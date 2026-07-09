frappe.ui.form.on("LMS Batch", {

    refresh(frm) {
        if (frm.is_new()) return;

        frm.add_custom_button(__("Add Students"), () => {
            show_add_students_dialog(frm);
        }, __("Actions"));

        frm.add_custom_button(__("View Students"), () => {
            show_students_list(frm);
        }, __("Actions"));
    }

});


function show_add_students_dialog(frm) {
    // Frappe standard multi-select dialog — searchable checkbox list
    new frappe.ui.form.MultiSelectDialog({
        doctype: "User",
        target: frm,
        setters: {
            full_name: null,
            email: null,
        },
        filters: {
            enabled: 1,
            user_type: "System User",
        },
        action(selections) {
            if (!selections || !selections.length) {
                frappe.msgprint(__("Please select at least one student."));
                return;
            }

            frappe.show_progress(
                __("Adding Students"),
                0, 100,
                __("Please wait while students are being added...")
            );

            frappe.call({
                method: "lms_plus.api.batch.bulk_add_students",
                args: {
                    batch: frm.doc.name,
                    members_json: JSON.stringify(selections),
                },
                callback(r) {
                    frappe.hide_progress();
                    if (r.message) {
                        frappe.show_alert({
                            message: r.message.message,
                            indicator: "green",
                        });
                    }
                },
                error() {
                    frappe.hide_progress();
                }
            });
        }
    });
}


function show_students_list(frm) {
    frappe.call({
        method: "lms_plus.api.batch.get_batch_students",
        args: { batch: frm.doc.name },
        callback(r) {
            if (!r.message || !r.message.length) {
                frappe.msgprint(__("No students enrolled in this batch yet."));
                return;
            }

            const rows = r.message.map(s =>
                `<tr>
                    <td>${s.member_name || ""}</td>
                    <td>${s.member || ""}</td>
                    <td>${s.member_username || ""}</td>
                </tr>`
            ).join("");

            const html = `
                <table class="table table-bordered table-sm">
                    <thead>
                        <tr>
                            <th>${__("Name")}</th>
                            <th>${__("Email")}</th>
                            <th>${__("Username")}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            `;

            const d = new frappe.ui.Dialog({
                title: __("Students in {0}", [frm.doc.title]),
                fields: [{ fieldtype: "HTML", fieldname: "students_html" }],
            });

            d.fields_dict.students_html.$wrapper.html(html);
            d.show();
        }
    });
}
