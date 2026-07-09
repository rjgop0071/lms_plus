import frappe
from frappe.model.document import Document


class LMSPlusCohort(Document):

    def validate(self):
        self._validate_unique_members()

    def _validate_unique_members(self):
        seen = set()
        for row in self.members:
            if row.user in seen:
                frappe.throw(
                    frappe._("User {0} is added more than once in this cohort.").format(row.user),
                    frappe.ValidationError,
                )
            seen.add(row.user)

    def get_member_users(self) -> list[str]:
        """Return a plain list of user names in this cohort."""
        return [row.user for row in self.members]
