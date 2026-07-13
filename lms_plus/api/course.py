import frappe
from frappe import _
from frappe.utils.data import getdate, nowdate, cstr
from frappe.query_builder import DocType


# ─── Doc event hooks ───────────────────────────────────────────────────────────

def validate_course_dates(doc, method=None):
    """Hooked into LMS Course.validate — enforces start/end date logic."""
    start = doc.get("start_date")
    end   = doc.get("end_date")

    if start and end and getdate(start) > getdate(end):
        frappe.throw(
            _("Course start date ({0}) cannot be after end date ({1}).").format(start, end),
            frappe.ValidationError,
        )


def close_expired_courses():
    """
    Scheduled daily: add a custom 'is_expired' flag on courses past their end date.
    Does NOT modify LMS Course directly — sets a custom field added via fixtures.
    """
    Course = DocType("LMS Course")
    today  = nowdate()

    expired = (
        frappe.qb.from_(Course)
        .select(Course.name)
        .where(Course.end_date < today)
        .where(Course.is_published == 1)
        .run(as_dict=True)
    )

    for row in expired:
        frappe.db.set_value("LMS Course", row.name, "is_expired", 1)

    if expired:
        frappe.logger().info(
            f"LMS Plus: marked {len(expired)} course(s) as expired."
        )


# ─── GIFT format quiz import ───────────────────────────────────────────────────

@frappe.whitelist()
def import_gift_quiz(course: str, gift_text: str, quiz_title: str) -> dict:
    """
    Parse a GIFT-format string and create an LMS Quiz with its questions.

    GIFT format example:
        ::Q1:: What is 2+2? {=4 ~3 ~5}
    """
    questions = _parse_gift(cstr(gift_text))
    if not questions:
        frappe.throw(_("No valid questions found in the provided GIFT content."))

    quiz = frappe.new_doc("LMS Quiz")
    quiz.title  = cstr(quiz_title)
    quiz.course = course
    quiz.passing_percentage = 60

    for q in questions:
        question_doc = _create_question_from_gift(q)
        quiz.append("questions", {
            "question": question_doc.name,
            "type":     "Choices",
            "marks":    1,
        })

    quiz.insert(ignore_permissions=False)

    return {
        "quiz": quiz.name,
        "questions_imported": len(questions),
        "status": "created",
    }


def _create_question_from_gift(q: dict):
    """Create an LMS Question record from a parsed GIFT question dict (up to 4 options)."""
    fields = {
        "doctype": "LMS Question",
        "question": q["question"],
        "type": "Choices",
    }
    for i, option in enumerate(q["options"][:4], 1):
        fields[f"option_{i}"] = option
        fields[f"is_correct_{i}"] = 1 if option == q["correct"] else 0

    question_doc = frappe.get_doc(fields)
    question_doc.insert(ignore_permissions=True)
    return question_doc


def _parse_gift(text: str) -> list[dict]:
    """
    Minimal GIFT parser — handles single-answer multiple choice.
    Returns list of {"question": str, "options": list, "correct": str}
    """
    import re
    questions = []
    pattern = re.compile(
        r"(?:::(?P<title>[^:]+)::)?\s*(?P<stem>[^{]+)\{(?P<body>[^}]+)\}",
        re.MULTILINE,
    )

    for match in pattern.finditer(text):
        stem    = match.group("stem").strip()
        body    = match.group("body")
        options = []
        correct = None

        for part in re.split(r"[~=]", body):
            part = part.strip()
            if not part:
                continue
            is_correct = body.index(part) > 0 and body[body.index(part) - 1] == "="
            options.append(part)
            if is_correct:
                correct = part

        if stem:
            questions.append({
                "question": stem,
                "options":  options,
                "correct":  correct,
            })

    return questions


# ─── Learning plan bulk assign ─────────────────────────────────────────────────

@frappe.whitelist()
def assign_learning_plan(plan: str, users_json: str) -> dict:
    """
    Enqueue enrollment of a list of users into all courses in a learning plan.

    users_json: JSON list of user email strings.
    """
    users = frappe.parse_json(users_json)
    if not isinstance(users, list) or not users:
        frappe.throw(_("Provide a non-empty list of users."))

    if not frappe.db.exists("LMS Plus Learning Plan", plan):
        frappe.throw(_("Learning Plan {0} not found.").format(plan))

    frappe.enqueue(
        "lms_plus.api.course._assign_plan_job",
        plan=plan,
        users=users,
        queue="long",
        timeout=3600,
    )

    return {"status": "enqueued", "plan": plan, "users": len(users)}


def _assign_plan_job(plan: str, users: list):
    plan_doc = frappe.get_cached_doc("LMS Plus Learning Plan", plan)
    courses  = [row.course for row in plan_doc.courses]

    from lms_plus.api.enrollment import enroll_user

    success, failed = 0, []
    for user in users:
        for course in courses:
            try:
                enroll_user(user, course)
                success += 1
            except Exception:
                failed.append({"user": user, "course": course})
                frappe.log_error(
                    title=f"LMS Plus: plan assignment failed for {user}/{course}",
                    message=frappe.get_traceback(),
                )

    frappe.logger().info(
        f"LMS Plus plan '{plan}' assigned: {success} enrollments, {len(failed)} failed."
    )
