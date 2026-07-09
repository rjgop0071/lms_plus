import frappe
from frappe.model.document import Document


class LMSPlusLearningPlan(Document):

    def validate(self):
        self._set_course_order()

    def _set_course_order(self):
        """Auto-number courses if order is not set."""
        for idx, row in enumerate(self.courses, start=1):
            if not row.order:
                row.order = idx
