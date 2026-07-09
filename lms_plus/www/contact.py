import frappe


def get_context(context):
    context.title = "Contact & Support"
    # Pull contact details from a Frappe System Settings custom field
    # (add these fields via fixtures/custom fields)
    context.support_email = frappe.db.get_single_value(
        "System Settings", "lms_plus_support_email"
    ) or "support@yourcompany.com"
    context.support_phone = frappe.db.get_single_value(
        "System Settings", "lms_plus_support_phone"
    ) or ""
