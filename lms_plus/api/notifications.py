import frappe
from frappe import _
from frappe.query_builder import DocType


def send_daily_reminders():
    """
    Scheduled daily: sends reminder emails to users with incomplete enrollments.
    Uses Frappe's built-in Email Queue — no raw SMTP calls.
    """
    Enrollment = DocType("LMS Enrollment")
    User       = DocType("User")

    incomplete = (
        frappe.qb.from_(Enrollment)
        .left_join(User).on(User.name == Enrollment.member)
        .select(
            Enrollment.member.as_("user"),
            User.full_name,
            User.email,
            Enrollment.course,
            Enrollment.progress,
        )
        .where(Enrollment.progress < 100)
        .where(User.enabled == 1)
        .run(as_dict=True)
    )

    for row in incomplete:
        _send_reminder_email(row)


def _send_reminder_email(row: dict):
    try:
        frappe.sendmail(
            recipients=[row["email"]],
            subject=_("Continue your learning — {0}").format(row["course"]),
            template="lms_plus_course_reminder",
            args={
                "full_name": row["full_name"],
                "course":    row["course"],
                "progress":  row["progress"],
            },
            now=False,  # queued, not immediate
        )
    except Exception:
        frappe.log_error(
            title=f"LMS Plus: reminder email failed for {row['user']}",
            message=frappe.get_traceback(),
        )


# ─── Pop-up notification ───────────────────────────────────────────────────────

@frappe.whitelist()
def send_popup_notification(user: str, title: str, message: str) -> dict:
    """
    Push a real-time pop-up notification to a specific user via Frappe sockets.
    """
    frappe.only_for(["LMS Manager", "System Manager"])

    frappe.publish_realtime(
        event="lms_plus_notification",
        message={"title": title, "message": message},
        user=user,
    )

    return {"status": "sent", "user": user}


@frappe.whitelist()
def broadcast_notification(title: str, message: str) -> dict:
    """
    Broadcast a real-time pop-up to ALL active users.
    """
    frappe.only_for(["LMS Manager", "System Manager"])

    frappe.publish_realtime(
        event="lms_plus_notification",
        message={"title": title, "message": message},
        # no `user` param = broadcast to all connected clients
    )

    return {"status": "broadcast_sent"}
