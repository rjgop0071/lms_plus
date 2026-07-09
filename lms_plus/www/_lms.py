# lms_plus/www/_lms.py
# This file exists to ensure lms_plus/_lms.html takes precedence over lms/_lms.html.
# The actual HTML is generated dynamically by setup.py sync_lms_template()
# which runs on every bench migrate, keeping it in sync with the installed LMS version.

no_cache = 1


def get_context():
    import frappe

    # Get LMS context safely — handles version differences between LMS installations
    try:
        from lms.www._lms import get_context as lms_get_context
        context = lms_get_context()
    except Exception:
        context = frappe._dict()
        try:
            from lms.www._lms import get_boot
            context.boot = get_boot()
        except Exception:
            context.boot = frappe._dict({
                "frappe_version": frappe.__version__,
                "read_only_mode": frappe.flags.read_only,
                "csrf_token": frappe.sessions.get_csrf_token(),
                "site_name": frappe.local.site,
                "lms_path": "lms",
            })

    # Inject LMS Plus role data into boot
    try:
        user = frappe.session.user
        roles = frappe.get_roles(user)
        context.boot["user"] = user
        context.boot["user_roles"] = roles
        context.boot["is_lms_manager"] = (
            "LMS Manager" in roles
            or "Administrator" in roles
            or "System Manager" in roles
        )
    except Exception:
        pass

    return context
