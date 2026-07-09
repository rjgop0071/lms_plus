import frappe
from frappe.model.document import Document


class LMSPlusBadge(Document):

    def after_insert(self):
        self._notify_user()

    def _notify_user(self):
        """Send an in-app notification to the badge recipient."""
        frappe.publish_realtime(
            event="lms_plus_badge",
            message={
                "title": frappe._("You earned a badge!"),
                "message": self.title,
                "badge_type": self.badge_type,
            },
            user=self.user,
        )
