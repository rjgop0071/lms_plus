import frappe


def get_manager_batches(user=None):
    """
    Returns LMS Batch names the user has managerial access to.
    Includes:
    1. Batches where user is set as custom_manager
    2. Batches containing the user's direct reportees from HRMS
    """
    if not user:
        user = frappe.session.user

    batch_names = set()

    # Option A — Batches where user is explicitly set as Manager
    manager_batches = frappe.get_all(
        "LMS Batch",
        filters={"custom_manager": user},
        pluck="name",
    )
    batch_names.update(manager_batches)

    # Option B — Batches containing user's direct reportees from HRMS
    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")

    if employee:
        reportees = frappe.get_all(
            "Employee",
            filters={"reports_to": employee},
            pluck="user_id",
        )
        reportees = [r for r in reportees if r]

        if reportees:
            enrollments = frappe.get_all(
                "LMS Batch Enrollment",
                filters={"member": ["in", reportees]},
                pluck="batch",
            )
            batch_names.update(enrollments)

    return list(batch_names)


def get_batch_permission_query(user):
    """
    Permission query for LMS Batch list on the Desk.
    LMS Manager and System Manager see all batches.
    Team Manager sees only their managed batches.
    Others — no restriction from lms_plus side.
    """
    if not user:
        user = frappe.session.user

    roles = frappe.get_roles(user)

    # Full access roles — no restriction
    if "LMS Manager" in roles or "System Manager" in roles or user == "Administrator":
        return ""

    # Only apply restriction to Team Manager role
    if "Team Manager" not in roles:
        return ""

    batches = get_manager_batches(user)

    if not batches:
        # Team Manager but no batches assigned yet — show nothing
        return "1=0"

    escaped = ["'{}'".format(b.replace("'", "\'")) for b in batches]
    return "`tabLMS Batch`.`name` in ({})".format(", ".join(escaped))


@frappe.whitelist()
def get_my_batches():
    """
    Whitelisted API — returns batches accessible to the current manager.
    Used by the LMS portal to filter the batch list.
    """
    user = frappe.session.user
    roles = frappe.get_roles(user)

    # LMS Manager sees all batches
    if "LMS Manager" in roles or "System Manager" in roles or user == "Administrator":
        batches = frappe.get_all(
            "LMS Batch",
            filters={"published": 1},
            fields=["name", "title"],
        )
        return {"all": True, "batches": [b.name for b in batches]}

    # Team Manager sees their batches
    if "Team Manager" in roles:
        batches = get_manager_batches(user)
        return {"all": False, "batches": batches}

    return {"all": False, "batches": []}
