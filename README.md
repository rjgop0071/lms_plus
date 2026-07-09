# LMS Plus

Custom Frappe app that extends [Frappe LMS](https://github.com/frappe/lms)
with cohort management, bulk operations, reports, engagement features,
and platform customization — without modifying LMS core.

---

## Installation

```bash
# 1. Get the app into your bench
cd /path/to/your/bench
bench get-app lms_plus /path/to/lms_plus   # or GitHub URL once pushed

# 2. Install on your site
bench --site airplane.local install-app lms_plus

# 3. Run migrations (creates all custom DocTypes)
bench --site airplane.local migrate

# 4. Build frontend assets
bench build --app lms_plus

# 5. Restart
bench restart
```

---

## Custom DocTypes added

| DocType | Purpose |
|---|---|
| LMS Plus Cohort | Teams / groups of learners |
| LMS Plus Cohort Member | Child table — members of a cohort |
| LMS Plus Learning Plan | Ordered bundle of courses |
| LMS Plus Learning Plan Course | Child table — courses in a plan |
| LMS Plus Attendance | Session-level attendance per user/course |
| LMS Plus Badge | Rewards and recognition |
| LMS Plus FAQ | Published FAQ entries |

---

## API Reference

All endpoints are `@frappe.whitelist()` and callable via:
`POST /api/method/lms_plus.api.<module>.<function>`

### User management
| Function | Description |
|---|---|
| `user.create_user` | Create a single user |
| `user.bulk_create_users` | Enqueue bulk user creation from JSON list |
| `user.deactivate_user` | Disable user (data retained) |
| `user.reset_user_password` | Send password reset email (admin only) |

### Enrollment
| Function | Description |
|---|---|
| `enrollment.enroll_user` | Enroll single user in a course |
| `enrollment.unenroll_user` | Cancel single enrollment |
| `enrollment.enroll_cohort` | Enqueue enrollment for entire cohort |
| `enrollment.unenroll_cohort` | Enqueue unenrollment for entire cohort |
| `enrollment.bulk_enroll` | Bulk enroll from JSON list |
| `enrollment.bulk_unenroll` | Bulk unenroll from JSON list |

### Course
| Function | Description |
|---|---|
| `course.import_gift_quiz` | Parse GIFT format and create LMS Quiz |
| `course.assign_learning_plan` | Enroll users in all courses of a learning plan |

### Reports
| Function | Description |
|---|---|
| `reports.user_learning_summary` | All users — enrollment + completion count |
| `reports.user_report` | Single user — full progress + badges |
| `reports.user_login_report` | Login history (date range filter) |
| `reports.course_completion_report` | Users who completed a course |
| `reports.user_progress_overview` | Progress per user/course (cohort filter) |
| `reports.attendance_report` | Attendance records (multi-filter) |

### Notifications
| Function | Description |
|---|---|
| `notifications.send_popup_notification` | Push real-time popup to a user |
| `notifications.broadcast_notification` | Broadcast popup to all users |

---

## Portal pages

| URL | Description |
|---|---|
| `/lms-plus/faq` | Published FAQ entries |
| `/lms-plus/contact` | Contact details and support link |

---

## Updating Frappe LMS

Since `lms_plus` uses only hooks, custom DocTypes, and `www/` pages,
you can safely update Frappe LMS without touching this app:

```bash
bench update --pull
bench --site airplane.local migrate
bench restart
```

No LMS core files are modified.
