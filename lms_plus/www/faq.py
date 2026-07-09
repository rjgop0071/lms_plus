import frappe


def get_context(context):
    context.faqs = frappe.get_all(
        "LMS Plus FAQ",
        filters={"published": 1},
        fields=["question", "answer", "category"],
        order_by="category asc, `order` asc",
    )
    context.title = "Frequently Asked Questions"
