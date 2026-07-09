app_name = "lms_plus"
app_title = "LMS Plus"
app_publisher = "Your Company"
app_description = "Custom extension for Frappe LMS — cohorts, bulk ops, reports, engagement"
app_email = "dev@yourcompany.com"
app_license = "MIT"

required_apps = ["frappe", "lms"]


after_install = "lms_plus.setup.after_install"

# ─── Permission query — filters LMS Batch list for Team Managers ──────────────
permission_query_conditions = {
    "LMS Batch": "lms_plus.api.manager.get_batch_permission_query",
}
after_migrate  = "lms_plus.setup.after_install"

doc_events = {
    "LMS Batch": {
        "on_trash": "lms_plus.api.batch.on_batch_trash",
    },
    "LMS Batch Enrollment": {
        "after_insert": "lms_plus.api.batch.after_batch_enrollment",
        "on_trash":     "lms_plus.api.batch.on_batch_enrollment_trash",
    },
    "LMS Course": {
        "validate": "lms_plus.api.course.validate_course_dates",
    },
    "LMS Enrollment": {
        "after_insert": "lms_plus.api.enrollment.after_enrollment",
        "on_cancel":    "lms_plus.api.enrollment.after_unenrollment",
    },
    "User": {
        "after_insert": "lms_plus.api.user.after_user_created",
    },
}

scheduler_events = {
    "daily": [
        "lms_plus.api.course.close_expired_courses",
        "lms_plus.api.notifications.send_daily_reminders",
    ],
}

website_route_rules = [
    {"from_route": "/lms-plus/faq",     "to_route": "faq"},
    {"from_route": "/lms-plus/contact", "to_route": "contact"},
]

web_include_css = ["assets/lms_plus/css/lms_plus.css"]
web_include_js  = ["assets/lms_plus/js/lms_plus.js"]

# Desk JS — adds custom buttons to LMS DocType forms
doctype_js = {
    "LMS Batch": "public/js/lms_batch.js",
}

fixtures = [
    "Custom Field",
    "Property Setter",
    "Notification",
    {"dt": "Role", "filters": [["role_name", "in", ["LMS Manager", "Team Manager", "LMS Learner"]]]},
]
