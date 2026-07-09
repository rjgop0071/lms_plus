# lms_plus/www/_lms.py
# Extends LMS boot data with current user info and roles.
import frappe
from lms.www._lms import get_context as _lms_get_context

no_cache = 1


def get_context():
    context = _lms_get_context()

    # Add user identity and roles to boot so JS can check permissions
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
