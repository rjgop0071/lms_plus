import frappe
from frappe import _
from frappe.query_builder import DocType
from frappe.query_builder.functions import Count, Max
from frappe.utils.data import getdate


# ─── 1. User learning summary (all users) ────────────────────────────────────

@frappe.whitelist()
def user_learning_summary() -> list[dict]:
    """
    Returns one row per user with total enrollments, completed courses,
    and average progress.
    """
    Enrollment = DocType("LMS Enrollment")
    User       = DocType("User")

    rows = (
        frappe.qb.from_(Enrollment)
        .left_join(User).on(User.name == Enrollment.member)
        .select(
            Enrollment.member.as_("user"),
            User.full_name,
            Count(Enrollment.name).as_("total_enrollments"),
            Count(
                frappe.qb.terms.ValueWrapper(1)
            ).filter(Enrollment.progress == 100).as_("completed"),
        )
        .groupby(Enrollment.member, User.full_name)
        .orderby(User.full_name)
        .run(as_dict=True)
    )

    return rows


# ─── 2. Individual user report ─────────────────────────────────────────────────

@frappe.whitelist()
def user_report(user: str) -> dict:
    """
    Full learning profile for a single user:
    enrollments, progress per course, badges earned.
    """
    Enrollment = DocType("LMS Enrollment")

    enrollments = (
        frappe.qb.from_(Enrollment)
        .select(
            Enrollment.course,
            Enrollment.progress,
            Enrollment.creation.as_("enrolled_on"),
        )
        .where(Enrollment.member == user)
        .orderby(Enrollment.creation)
        .run(as_dict=True)
    )

    Badge = DocType("LMS Plus Badge")
    badges = (
        frappe.qb.from_(Badge)
        .select(Badge.title, Badge.badge_type, Badge.awarded_on)
        .where(Badge.user == user)
        .orderby(Badge.awarded_on)
        .run(as_dict=True)
    )

    return {
        "user":        user,
        "enrollments": enrollments,
        "badges":      badges,
    }


# ─── 3. User login report ─────────────────────────────────────────────────────

@frappe.whitelist()
def user_login_report(from_date: str = None, to_date: str = None) -> list[dict]:
    """
    Returns login activity from Frappe's Activity Log.
    Optionally filter by date range.
    """
    Log = DocType("Activity Log")

    query = (
        frappe.qb.from_(Log)
        .select(
            Log.user,
            Log.creation.as_("login_time"),
            Log.ip_address,
        )
        .where(Log.operation == "Login")
        .where(Log.status == "Success")
        .orderby(Log.creation, order=frappe.qb.desc)
    )

    if from_date:
        query = query.where(Log.creation >= getdate(from_date))
    if to_date:
        query = query.where(Log.creation <= getdate(to_date))

    return query.run(as_dict=True)


# ─── 4. Course completion report ─────────────────────────────────────────────

@frappe.whitelist()
def course_completion_report(course: str = None) -> list[dict]:
    """
    Lists all users who have completed a course (progress == 100).
    Pass a specific course name to filter, or leave blank for all courses.
    """
    Enrollment = DocType("LMS Enrollment")
    User       = DocType("User")

    query = (
        frappe.qb.from_(Enrollment)
        .left_join(User).on(User.name == Enrollment.member)
        .select(
            Enrollment.member.as_("user"),
            User.full_name,
            Enrollment.course,
            Enrollment.progress,
            Enrollment.modified.as_("completed_on"),
        )
        .where(Enrollment.progress == 100)
        .orderby(Enrollment.modified, order=frappe.qb.desc)
    )

    if course:
        query = query.where(Enrollment.course == course)

    return query.run(as_dict=True)


# ─── 5. User progress overview ────────────────────────────────────────────────

@frappe.whitelist()
def user_progress_overview(cohort: str = None) -> list[dict]:
    """
    Progress overview for all users (or filtered by cohort).
    Returns user, course, and progress %.
    """
    Enrollment   = DocType("LMS Enrollment")
    User         = DocType("User")
    CohortMember = DocType("LMS Plus Cohort Member")

    query = (
        frappe.qb.from_(Enrollment)
        .left_join(User).on(User.name == Enrollment.member)
        .select(
            Enrollment.member.as_("user"),
            User.full_name,
            Enrollment.course,
            Enrollment.progress,
        )
        .orderby(User.full_name)
    )

    if cohort:
        members_in_cohort = (
            frappe.qb.from_(CohortMember)
            .select(CohortMember.user)
            .where(CohortMember.parent == cohort)
        )
        query = query.where(Enrollment.member.isin(members_in_cohort))

    return query.run(as_dict=True)


# ─── 6. Attendance report ─────────────────────────────────────────────────────

@frappe.whitelist()
def attendance_report(course: str = None, user: str = None,
                      from_date: str = None, to_date: str = None) -> list[dict]:
    """
    Attendance summary. Filter by course, user, and/or date range.
    """
    Attendance = DocType("LMS Plus Attendance")
    User       = DocType("User")

    query = (
        frappe.qb.from_(Attendance)
        .left_join(User).on(User.name == Attendance.user)
        .select(
            Attendance.user,
            User.full_name,
            Attendance.course,
            Attendance.session_date,
            Attendance.status,
            Attendance.remarks,
        )
        .where(Attendance.docstatus == 1)
        .orderby(Attendance.session_date, order=frappe.qb.desc)
    )

    if course:
        query = query.where(Attendance.course == course)
    if user:
        query = query.where(Attendance.user == user)
    if from_date:
        query = query.where(Attendance.session_date >= getdate(from_date))
    if to_date:
        query = query.where(Attendance.session_date <= getdate(to_date))

    return query.run(as_dict=True)
