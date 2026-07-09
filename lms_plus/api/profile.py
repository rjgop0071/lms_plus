import frappe
from frappe import _
from frappe.utils.data import flt


@frappe.whitelist(allow_guest=False)
def get_learner_profile(user_email=None):
    """
    Returns complete learner profile combining HRMS, LMS, and badge data.
    """
    if not user_email:
        user_email = frappe.session.user

    user = frappe.db.get_value(
        "User",
        user_email,
        ["name", "full_name", "user_image", "username"],
        as_dict=True,
    )
    if not user:
        return None

    # Employee info from HRMS
    employee = frappe.db.get_value(
        "Employee",
        {"user_id": user_email},
        ["name", "employee_name", "department", "designation", "reports_to"],
        as_dict=True,
    ) or {}

    # Manager name
    manager_name = ""
    if employee.get("reports_to"):
        mgr_user = frappe.db.get_value("Employee", employee["reports_to"], "user_id")
        if mgr_user:
            manager_name = frappe.db.get_value("User", mgr_user, "full_name") or ""

    # Enrolled courses
    enrollments = frappe.get_all(
        "LMS Enrollment",
        filters={"member": user_email},
        fields=["course", "progress"],
        order_by="modified desc",
    )

    course_names = [e.course for e in enrollments]
    courses_map = {}
    if course_names:
        for c in frappe.get_all(
            "LMS Course",
            filters={"name": ["in", course_names]},
            fields=["name", "title", "image"],
        ):
            courses_map[c.name] = c

    enrolled, completed = [], []
    for e in enrollments:
        info = courses_map.get(e.course, frappe._dict())
        d = {
            "course":   e.course,
            "title":    info.get("title", e.course),
            "image":    info.get("image", ""),
            "progress": flt(e.progress or 0),
        }
        (completed if d["progress"] >= 100 else enrolled).append(d)

    # Certificates
    certs = frappe.get_all(
        "LMS Certificate",
        filters={"member": user_email},
        fields=["name", "course_title", "issue_date", "batch_title"],
        order_by="issue_date desc",
    )

    # Badges
    badges = frappe.get_all(
        "LMS Plus Badge",
        filters={"user": user_email},
        fields=["title", "badge_type", "awarded_on", "icon"],
        order_by="awarded_on desc",
    )

    # Batch memberships
    batch_enrollments = frappe.get_all(
        "LMS Batch Enrollment",
        filters={"member": user_email},
        pluck="batch",
    )
    batches = []
    if batch_enrollments:
        for b in frappe.get_all(
            "LMS Batch",
            filters={"name": ["in", batch_enrollments]},
            fields=["name", "title", "start_date", "end_date"],
        ):
            batches.append({
                "batch":      b.name,
                "title":      b.title,
                "start_date": str(b.start_date or ""),
                "end_date":   str(b.end_date or ""),
            })

    # Last login
    last_login = frappe.db.get_value(
        "Activity Log",
        {"user": user_email, "operation": "Login"},
        "creation",
        order_by="creation desc",
    )

    return {
        "user": {
            "email":     user.name,
            "full_name": user.full_name or user.name,
            "username":  user.username or "",
            "image":     user.user_image or "",
        },
        "employee": {
            "department":  employee.get("department") or "",
            "designation": employee.get("designation") or "",
            "manager":     manager_name,
            "employee_id": employee.get("name") or "",
        },
        "stats": {
            "enrolled":  len(enrollments),
            "completed": len(completed),
            "badges":    len(badges),
            "batches":   len(batches),
        },
        "enrolled_courses":  enrolled,
        "completed_courses": completed,
        "certificates": [{
            "name":         c.name,
            "course_title": c.course_title or "",
            "issue_date":   str(c.issue_date or ""),
            "batch_title":  c.batch_title or "",
        } for c in certs],
        "badges": [{
            "title":      b.title or "",
            "badge_type": b.badge_type or "",
            "awarded_on": str(b.awarded_on or ""),
            "icon":       b.icon or "",
        } for b in badges],
        "batches":    batches,
        "last_login": str(last_login) if last_login else "",
    }
