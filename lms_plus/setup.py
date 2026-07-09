import frappe


def after_install():
    create_custom_fields()
    create_property_setters()


def create_custom_fields():
    """
    Adds Department and Manager custom fields to LMS Batch.
    LMS core is never touched — these are Custom Field records only.
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
    Only Title remains mandatory.
    LMS core is never touched — these are Property Setter records only.
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
