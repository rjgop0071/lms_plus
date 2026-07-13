import frappe
from frappe import _
from frappe.utils.data import cstr


def after_user_created(doc, method=None):
    """Doc event: fires after a new User is inserted."""
    frappe.logger().info(f"LMS Plus: new user created — {doc.name}")


def sync_moderator_role(doc, method=None):
    """
    Doc event on Has Role — fires whenever a role is added to a User.

    Core LMS gates course/batch access and the instructor dashboard with
    hardcoded role-name checks (has_moderator_role, has_course_instructor_role
    in lms/lms/utils.py) that only recognize "Moderator", "Course Creator",
    and "Batch Evaluator" by exact name — not "LMS Manager". Our Custom
    DocPerm grants (see setup.create_role_permissions) satisfy
    frappe.has_permission() but do nothing for these checks, so an
    LMS-Manager-only user could create/write documents via the API yet
    still see the plain learner dashboard and get blocked from course/batch
    pages. Mirroring "Moderator" onto every LMS Manager keeps both paths
    in sync.
    """
    if doc.parenttype != "User" or doc.role != "LMS Manager":
        return

    if frappe.db.exists("Has Role", {"parent": doc.parent, "parenttype": "User", "role": "Moderator"}):
        return

    frappe.get_doc({
        "doctype": "Has Role",
        "parent": doc.parent,
        "parenttype": "User",
        "parentfield": "roles",
        "role": "Moderator",
    }).insert(ignore_permissions=True)
    frappe.clear_cache(user=doc.parent)


# ─── Individual user creation ──────────────────────────────────────────────────

@frappe.whitelist()
def create_user(first_name: str, last_name: str, email: str, role: str = "LMS Learner") -> dict:
    """
    Create a single LMS user and assign the given role.
    Sends a welcome email automatically via Frappe's user creation flow.
    """
    if frappe.db.exists("User", email):
        frappe.throw(_("A user with email {0} already exists.").format(email))

    user = frappe.new_doc("User")
    user.first_name = cstr(first_name).strip()
    user.last_name  = cstr(last_name).strip()
    user.email      = cstr(email).strip().lower()
    user.send_welcome_email = 1
    user.append("roles", {"role": role})
    user.insert(ignore_permissions=False)

    return {"user": user.name, "status": "created"}


# ─── Bulk user upload ──────────────────────────────────────────────────────────

@frappe.whitelist()
def bulk_create_users(users_json: str) -> dict:
    """
    Accepts a JSON list of user dicts and enqueues bulk creation.

    Each dict must have: first_name, last_name, email
    Optional: role (defaults to LMS Learner)

    Example payload:
        [{"first_name": "Jane", "last_name": "Doe", "email": "jane@example.com"}]
    """
    users = frappe.parse_json(users_json)
    if not isinstance(users, list) or not users:
        frappe.throw(_("Provide a non-empty list of users."))

    frappe.enqueue(
        "lms_plus.api.user._bulk_create_users_job",
        users=users,
        enqueued_by=frappe.session.user,
        queue="long",
        timeout=1800,
    )

    return {"queued": len(users), "status": "enqueued"}


def _bulk_create_users_job(users: list, enqueued_by: str):
    """Background worker: creates users one by one, logs errors per row."""
    success, failed = 0, []

    for row in users:
        try:
            create_user(
                first_name=row.get("first_name", ""),
                last_name=row.get("last_name", ""),
                email=row.get("email", ""),
                role=row.get("role", "LMS Learner"),
            )
            success += 1
        except Exception:
            failed.append(row.get("email"))
            frappe.log_error(
                title=f"LMS Plus: bulk user creation failed for {row.get('email')}",
                message=frappe.get_traceback(),
            )

    frappe.logger().info(
        f"LMS Plus bulk user import by {enqueued_by}: {success} created, {len(failed)} failed."
    )


# ─── Deactivate user ───────────────────────────────────────────────────────────

@frappe.whitelist()
def deactivate_user(user: str) -> dict:
    """
    Mark a user as inactive. All their data (enrollments, progress) is retained.
    """
    if not frappe.db.exists("User", user):
        frappe.throw(_("User {0} not found.").format(user))

    frappe.db.set_value("User", user, "enabled", 0)
    frappe.db.commit()

    return {"user": user, "status": "deactivated"}


# ─── Admin password reset ──────────────────────────────────────────────────────

@frappe.whitelist()
def reset_user_password(user: str) -> dict:
    """
    Trigger a password reset email for the given user.
    Only callable by System Manager or LMS Manager.
    """
    frappe.only_for(["System Manager", "LMS Manager"])

    if not frappe.db.exists("User", user):
        frappe.throw(_("User {0} not found.").format(user))

    user_doc = frappe.get_cached_doc("User", user)
    user_doc.reset_password()

    return {"user": user, "status": "reset_email_sent"}
