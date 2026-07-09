import frappe
from frappe import _


def after_enrollment(doc, method=None):
    """Doc event: fires after LMS Enrollment is created."""
    _award_badge_if_applicable(doc)


def after_unenrollment(doc, method=None):
    """Doc event: fires after LMS Enrollment is cancelled."""
    frappe.logger().info(
        f"LMS Plus: {doc.member} unenrolled from {doc.course}"
    )


def _award_badge_if_applicable(enrollment_doc):
    """Award a Course Completion badge when progress reaches 100."""
    if frappe.utils.data.flt(enrollment_doc.get("progress")) == 100:
        _create_badge(
            user=enrollment_doc.member,
            badge_type="Course Completion",
            title=f"Completed: {enrollment_doc.course}",
            course=enrollment_doc.course,
        )


def _create_badge(user, badge_type, title, course=None):
    badge = frappe.new_doc("LMS Plus Badge")
    badge.user       = user
    badge.badge_type = badge_type
    badge.title      = title
    badge.course     = course
    badge.insert(ignore_permissions=True)


# ─── Individual enrollment ─────────────────────────────────────────────────────

@frappe.whitelist()
def enroll_user(user: str, course: str) -> dict:
    """Enroll a single user in a course."""
    _validate_course_open(course)

    if frappe.db.exists("LMS Enrollment", {"member": user, "course": course}):
        return {"status": "already_enrolled", "user": user, "course": course}

    doc = frappe.new_doc("LMS Enrollment")
    doc.member = user
    doc.course = course
    doc.insert(ignore_permissions=False)

    return {"status": "enrolled", "user": user, "course": course}


@frappe.whitelist()
def unenroll_user(user: str, course: str) -> dict:
    """Cancel a single user's enrollment."""
    name = frappe.db.get_value(
        "LMS Enrollment", {"member": user, "course": course}, "name"
    )
    if not name:
        frappe.throw(_("Enrollment not found for user {0} in course {1}.").format(user, course))

    enrollment = frappe.get_doc("LMS Enrollment", name)
    enrollment.cancel()

    return {"status": "unenrolled", "user": user, "course": course}


# ─── Cohort enrollment ─────────────────────────────────────────────────────────

@frappe.whitelist()
def enroll_cohort(cohort: str, course: str) -> dict:
    """Enqueue bulk enrollment for all members of a cohort."""
    _validate_cohort_exists(cohort)
    _validate_course_open(course)

    frappe.enqueue(
        "lms_plus.api.enrollment._bulk_enroll_job",
        cohort=cohort,
        course=course,
        action="enroll",
        queue="long",
        timeout=1800,
    )

    return {"status": "enqueued", "cohort": cohort, "course": course}


@frappe.whitelist()
def unenroll_cohort(cohort: str, course: str) -> dict:
    """Enqueue bulk unenrollment for all members of a cohort."""
    _validate_cohort_exists(cohort)

    frappe.enqueue(
        "lms_plus.api.enrollment._bulk_enroll_job",
        cohort=cohort,
        course=course,
        action="unenroll",
        queue="long",
        timeout=1800,
    )

    return {"status": "enqueued", "cohort": cohort, "course": course}


# ─── Bulk enrollment via CSV payload ──────────────────────────────────────────

@frappe.whitelist()
def bulk_enroll(enrollments_json: str) -> dict:
    """
    Enqueue bulk enrollment from a JSON list.

    Each item: {"user": "jane@example.com", "course": "COURSE-001"}
    """
    enrollments = frappe.parse_json(enrollments_json)
    if not isinstance(enrollments, list) or not enrollments:
        frappe.throw(_("Provide a non-empty list of enrollment records."))

    frappe.enqueue(
        "lms_plus.api.enrollment._bulk_enroll_list_job",
        enrollments=enrollments,
        action="enroll",
        queue="long",
        timeout=3600,
    )

    return {"status": "enqueued", "count": len(enrollments)}


@frappe.whitelist()
def bulk_unenroll(enrollments_json: str) -> dict:
    """Enqueue bulk unenrollment from a JSON list (same shape as bulk_enroll)."""
    enrollments = frappe.parse_json(enrollments_json)

    frappe.enqueue(
        "lms_plus.api.enrollment._bulk_enroll_list_job",
        enrollments=enrollments,
        action="unenroll",
        queue="long",
        timeout=3600,
    )

    return {"status": "enqueued", "count": len(enrollments)}


# ─── Background workers ────────────────────────────────────────────────────────

def _bulk_enroll_job(cohort: str, course: str, action: str):
    cohort_doc = frappe.get_cached_doc("LMS Plus Cohort", cohort)
    users = cohort_doc.get_member_users()
    _process_enrollment_list(
        [{"user": u, "course": course} for u in users], action
    )


def _bulk_enroll_list_job(enrollments: list, action: str):
    _process_enrollment_list(enrollments, action)


def _process_enrollment_list(enrollments: list, action: str):
    success, failed = 0, []

    for item in enrollments:
        user   = item.get("user")
        course = item.get("course")
        try:
            if action == "enroll":
                enroll_user(user, course)
            else:
                unenroll_user(user, course)
            success += 1
        except Exception:
            failed.append({"user": user, "course": course})
            frappe.log_error(
                title=f"LMS Plus: {action} failed for {user} / {course}",
                message=frappe.get_traceback(),
            )

    frappe.logger().info(
        f"LMS Plus bulk {action}: {success} ok, {len(failed)} failed."
    )


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _validate_course_open(course: str):
    from frappe.utils.data import getdate, nowdate

    course_doc = frappe.get_cached_doc("LMS Course", course)
    today = getdate(nowdate())

    start = getdate(course_doc.get("start_date")) if course_doc.get("start_date") else None
    end   = getdate(course_doc.get("end_date"))   if course_doc.get("end_date")   else None

    if start and today < start:
        frappe.throw(_("Course {0} is not open yet. It opens on {1}.").format(course, start))
    if end and today > end:
        frappe.throw(_("Course {0} has already closed.").format(course))


def _validate_cohort_exists(cohort: str):
    if not frappe.db.exists("LMS Plus Cohort", cohort):
        frappe.throw(_("Cohort {0} not found.").format(cohort))
