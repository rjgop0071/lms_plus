import frappe
from frappe import _


@frappe.whitelist(allow_guest=False)
def check_course_access(course: str):
    """
    Checks if the current user can access lessons in this course.
    Returns allowed=True or blocked with reason and prerequisite info.
    LMS Managers and Administrators always have full access.
    """
    user = frappe.session.user
    roles = frappe.get_roles(user)

    # Full access for admins and managers
    if user == "Administrator" or "LMS Manager" in roles or "System Manager" in roles:
        return {"allowed": True}

    # ── Check 1: Direct prerequisite field on the course ──────────────────────
    visited = set()

    def get_prereq_chain(c):
        """Walk the prerequisite chain — detect and break circular references."""
        if c in visited:
            return []
        visited.add(c)
        p = frappe.db.get_value("LMS Course", c, "custom_prerequisite_course")
        if not p:
            return []
        return [p] + get_prereq_chain(p)

    prereq_chain = get_prereq_chain(course)

    for prereq in prereq_chain:
        progress = frappe.db.get_value(
            "LMS Enrollment",
            {"member": user, "course": prereq},
            "progress",
        ) or 0

        if frappe.utils.data.flt(progress) < 100:
            prereq_title = frappe.db.get_value("LMS Course", prereq, "title") or prereq
            return {
                "allowed":              False,
                "reason":               "prerequisite",
                "prerequisite_course":  prereq,
                "prerequisite_title":   prereq_title,
                "prerequisite_progress": frappe.utils.data.flt(progress),
            }

    # ── Check 2: Batch course order enforcement ───────────────────────────────
    batch_enrollments = frappe.get_all(
        "LMS Batch Enrollment",
        filters={"member": user},
        pluck="batch",
    )

    for batch in batch_enrollments:
        batch_courses = frappe.get_all(
            "Batch Course",
            filters={"parent": batch},
            fields=["course", "title", "idx"],
            order_by="idx asc",
        )

        # Find position of the course being accessed
        current_idx = None
        for i, bc in enumerate(batch_courses):
            if bc.course == course:
                current_idx = i
                break

        if current_idx is None or current_idx == 0:
            continue  # Not in this batch or it is the first course

        # All courses before this one must be 100% complete
        for prev in batch_courses[:current_idx]:
            progress = frappe.db.get_value(
                "LMS Enrollment",
                {"member": user, "course": prev.course},
                "progress",
            ) or 0

            if frappe.utils.data.flt(progress) < 100:
                return {
                    "allowed":              False,
                    "reason":               "batch_order",
                    "prerequisite_course":  prev.course,
                    "prerequisite_title":   prev.title or prev.course,
                    "prerequisite_progress": frappe.utils.data.flt(progress),
                    "batch":                batch,
                }

    return {"allowed": True}
