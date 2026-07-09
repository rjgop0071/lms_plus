# lms_plus/www/_lms.py
# Extends LMS boot with user roles for portal JS permission checks.
# Falls back cleanly if LMS context is unavailable.

no_cache = 1


def get_context():
    try:
        from lms.www._lms import get_context as _lms_get_context
        context = _lms_get_context()
    except Exception:
        import frappe
        context = frappe._dict()
        context.boot = frappe._dict()

    import frappe
    user = frappe.session.user
    roles = frappe.get_roles(user)

    context.boot["user"] = user
    context.boot["user_roles"] = roles
    context.boot["is_lms_manager"] = (
        "LMS Manager" in roles
        or "Administrator" in roles
        or "System Manager" in roles
    )

    return context
