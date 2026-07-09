import frappe
import os


def after_install():
    create_custom_fields()
    create_property_setters()
    sync_lms_template()


def after_migrate():
    create_custom_fields()
    create_property_setters()
    sync_lms_template()


def sync_lms_template():
    """
    Generates _lms.html from the currently installed LMS version
    and injects our lms_plus.js script tag.
    This runs on every bench migrate so it stays in sync with LMS updates.
    """
    try:
        lms_html = frappe.get_app_path("lms", "www", "_lms.html")
        our_html = frappe.get_app_path("lms_plus", "www", "_lms.html")

        if not os.path.exists(lms_html):
            frappe.logger().warning("LMS Plus: lms/_lms.html not found — skipping template sync")
            return

        with open(lms_html, "r") as f:
            content = f.read()

        # Inject our script tag before </body>
        script_tag = '    <script src="/assets/lms_plus/js/lms_plus.js"></script>\n'
        if "lms_plus.js" not in content:
            content = content.replace("</body>", script_tag + "</body>")

        os.makedirs(os.path.dirname(our_html), exist_ok=True)
        with open(our_html, "w") as f:
            f.write(content)

        frappe.logger().info("LMS Plus: _lms.html synced successfully from LMS")
    except Exception:
        frappe.log_error(
            title="LMS Plus: _lms.html sync failed",
            message=frappe.get_traceback(),
        )


def create_custom_fields():
    """
    Adds custom fields to LMS Batch and LMS Course Progress.
    LMS core is never touched.
    """
    fields = [
        {
            "dt": "LMS Batch",
            "label": "Department",
            "fieldname": "custom_department",
            "fieldtype": "Link",
            "options": "Department",
            "insert_after": "end_date",
        },
        {
            "dt": "LMS Batch",
            "label": "Manager",
            "fieldname": "custom_manager",
            "fieldtype": "Link",
            "options": "User",
            "insert_after": "custom_department",
        },
        {
            "dt": "LMS Course Progress",
            "label": "Video Position (seconds)",
            "fieldname": "custom_video_position",
            "fieldtype": "Float",
            "insert_after": "lesson",
            "description": "Stores the last watched position in seconds for video lessons",
        },
        {
            "dt": "LMS Course",
            "label": "Prerequisite Course",
            "fieldname": "custom_prerequisite_course",
            "fieldtype": "Link",
            "options": "LMS Course",
            "insert_after": "disable_self_learning",
            "description": "Learner must complete this course before accessing lessons here",
        },
    ]

    for field in fields:
        if frappe.db.exists("Custom Field", f"{field['dt']}-{field['fieldname']}"):
            continue
        frappe.get_doc({"doctype": "Custom Field", **field}).insert(ignore_permissions=True)

    frappe.db.commit()


def create_property_setters():
    """
    Removes mandatory constraint from LMS Batch date, time,
    description, instructors, and batch details fields.
    """
    fields_to_fix = [
        "start_date", "end_date", "start_time", "end_time",
        "timezone", "description", "instructors", "batch_details",
    ]

    for fieldname in fields_to_fix:
        ps_name = f"LMS Batch-{fieldname}-reqd"
        if frappe.db.exists("Property Setter", ps_name):
            continue
        frappe.get_doc({
            "doctype": "Property Setter",
            "name": ps_name,
            "doctype_or_field": "DocField",
            "doc_type": "LMS Batch",
            "field_name": fieldname,
            "property": "reqd",
            "value": "0",
            "property_type": "Check",
        }).insert(ignore_permissions=True)

    frappe.db.commit()
