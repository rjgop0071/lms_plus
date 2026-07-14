import frappe
from frappe.core.doctype.file.file import File


def fix_file_attached_to_name(doc, method=None):
    """
    Fixes Frappe v17 + LMS v2.5 compatibility issue.
    LMS EditorJS passes attached_to_name as None.
    """
    if doc.attached_to_name is None:
        doc.attached_to_name = ""
    elif not isinstance(doc.attached_to_name, (str, int)):
        doc.attached_to_name = str(doc.attached_to_name)


# Monkey-patch File.validate_attachment_references to handle None gracefully
_original_validate = File.validate_attachment_references


def _patched_validate_attachment_references(self):
    if self.attached_to_name is None:
        self.attached_to_name = ""
    if self.attached_to_doctype and not self.attached_to_name:
        self.attached_to_doctype = ""
    try:
        _original_validate(self)
    except Exception as e:
        if "must be a string or an integer" in str(e):
            pass  # Silently ignore — file will save without attachment reference
        else:
            raise


File.validate_attachment_references = _patched_validate_attachment_references
