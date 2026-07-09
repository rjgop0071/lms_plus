import frappe
from frappe.model.document import Document


class LMSPlusAttendance(Document):

    def validate(self):
        self._validate_enrollment()

    def _validate_enrollment(self):
        """Ensure user is enrolled in the course before marking attendance."""
        enrolled = frappe.db.get_value(
            "LMS Enrollment",
            {"member": self.user, "course": self.course},
            "name",
        )
        if not enrolled:
            frappe.throw(
                frappe._("User {0} is not enrolled in course {1}.").format(
                    self.user, self.course
                ),
                frappe.ValidationError,
            )
