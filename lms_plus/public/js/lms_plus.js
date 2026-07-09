// lms_plus.js — runs inside Frappe LMS Vue SPA. No frappe JS dependency.

// Global load flag — check window._lmsPlusLoaded to verify script is running
window._lmsPlusLoaded = true;

(function () {
    "use strict";

    // ── Permission check ─────────────────────────────────────────────────────
    // window.is_lms_manager is injected by lms_plus/www/_lms.py via boot data
    var IS_MANAGER = window.is_lms_manager === true;

    // ── CSRF & fetch helper ──────────────────────────────────────────────────

    function getCsrf() { return window.csrf_token || ""; }

    function apiPost(method, args) {
        var params = new URLSearchParams();
        Object.keys(args).forEach(function (k) {
            var v = args[k];
            params.append(k, typeof v === "string" ? v : JSON.stringify(v));
        });
        return fetch("/api/method/" + method, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Frappe-CSRF-Token": getCsrf(),
                "X-Requested-With": "XMLHttpRequest",
            },
            body: params,
        }).then(function (r) { return r.json(); });
    }

    function showToast(msg, ok) {
        var old = document.getElementById("lms-plus-toast");
        if (old) old.remove();
        var t = document.createElement("div");
        t.id = "lms-plus-toast";
        t.style.cssText =
            "position:fixed;top:60px;right:20px;z-index:999999;" +
            "padding:12px 20px;border-radius:8px;font-size:14px;" +
            "font-weight:500;color:#fff;max-width:360px;line-height:1.4;" +
            "background:" + (ok ? "#22c55e" : "#ef4444") + ";" +
            "box-shadow:0 4px 16px rgba(0,0,0,.25);";
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(function () { if (t.parentNode) t.remove(); }, 5000);
    }

    function getSlug(pattern) {
        var m = window.location.pathname.match(pattern);
        return m ? m[1] : null;
    }


    // ════════════════════════════════════════════════════════════════════════
    // FLOATING TOOLBAR — fixed top-right, appended to body
    // ════════════════════════════════════════════════════════════════════════

    var _toolbar = null;

    function makeBtn(label, color, onClick) {
        var b = document.createElement("button");
        b.textContent = label;
        b.style.cssText =
            "padding:6px 14px;height:32px;border:none;border-radius:8px;" +
            "font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;" +
            "color:#fff;background:" + color + ";" +
            "box-shadow:0 2px 8px rgba(0,0,0,.2);";
        b.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        });
        return b;
    }

    function showToolbar(buttons) {
        if (_toolbar) _toolbar.remove();
        var bar = document.createElement("div");
        bar.id = "lms-plus-toolbar";
        bar.style.cssText =
            "position:fixed;top:14px;right:160px;z-index:99998;" +
            "display:flex;gap:8px;align-items:center;";
        buttons.forEach(function (b) { bar.appendChild(b); });
        document.body.appendChild(bar);
        _toolbar = bar;
    }

    function hideToolbar() {
        if (_toolbar) { _toolbar.remove(); _toolbar = null; }
    }


    // ════════════════════════════════════════════════════════════════════════
    // COURSE PAGE — Bulk Enroll + Bulk Remove (LMS Manager only)
    // ════════════════════════════════════════════════════════════════════════

    function initCourseTools() {
        var course = getSlug(/\/lms\/courses\/([^\/]+)/);
        if (!course) return;

        if (!IS_MANAGER) return;

        showToolbar([
            makeBtn("Bulk Enroll", "#1f2937", function () {
                loadUsersForCourse(course);
            }),
            makeBtn("Bulk Remove", "#dc2626", function () {
                loadEnrolledForRemove(course);
            }),
            makeBtn("Upload Lessons", "#7c3aed", function () {
                showLessonUploadModal(course);
            }),
            makeBtn("Upload Quizzes", "#0369a1", function () {
                showQuizUploadModal();
            }),
        ]);
    }

    function showLessonUploadModal(course) {
        var old = document.getElementById("lms-lesson-upload-modal");
        if (old) old.remove();

        var overlay = document.createElement("div");
        overlay.id = "lms-lesson-upload-modal";
        overlay.style.cssText =
            "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.5);" +
            "display:flex;align-items:center;justify-content:center;padding:16px;";

        var modal = document.createElement("div");
        modal.style.cssText =
            "background:#fff;border-radius:12px;width:100%;max-width:480px;" +
            "box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;font-family:inherit;";

        modal.innerHTML =
            "<div style=\"padding:16px 20px;border-bottom:1px solid #e5e7eb;" +
            "display:flex;align-items:center;justify-content:space-between;\">" +
            "<span style=\"font-size:16px;font-weight:600;color:#111827;\">Upload Lessons from Excel</span>" +
            "<button id=\"lms-lu-close\" style=\"width:28px;height:28px;border:none;" +
            "background:#f3f4f6;border-radius:6px;cursor:pointer;font-size:18px;\">&#215;</button></div>" +

            "<div style=\"padding:20px;\">" +

            // Step 1 — download template
            "<div style=\"margin-bottom:16px;\">" +
            "<div style=\"font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;\">Step 1 — Download the Excel template</div>" +
            "<button id=\"lms-lu-dl\" style=\"padding:8px 14px;border:1px solid #d1d5db;" +
            "border-radius:8px;background:#f9fafb;font-size:13px;cursor:pointer;color:#374151;\">&#8595; Download Template</button></div>" +

            // Step 2 — fill and upload
            "<div style=\"margin-bottom:16px;\">" +
            "<div style=\"font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;\">Step 2 — Fill the template and upload</div>" +
            "<input type=\"file\" id=\"lms-lu-file\" accept=\".xlsx\"" +
            " style=\"display:none;\">" +
            "<div id=\"lms-lu-drop\" style=\"border:2px dashed #d1d5db;border-radius:8px;" +
            "padding:24px;text-align:center;cursor:pointer;color:#6b7280;font-size:13px;\">" +
            "Click to select your filled Excel file</div></div>" +

            "<div id=\"lms-lu-status\" style=\"font-size:12px;color:#6b7280;min-height:20px;margin-bottom:12px;\"></div>" +

            "<div style=\"display:flex;justify-content:flex-end;gap:8px;\">" +
            "<button id=\"lms-lu-cancel\" style=\"padding:8px 16px;border:1px solid #d1d5db;" +
            "border-radius:8px;background:#fff;font-size:14px;cursor:pointer;color:#374151;\">Cancel</button>" +
            "<button id=\"lms-lu-upload\" disabled style=\"padding:8px 16px;border:none;" +
            "border-radius:8px;background:#7c3aed;color:#fff;font-size:14px;" +
            "font-weight:500;cursor:pointer;opacity:.4;\">Upload &amp; Create Lessons</button></div>" +

            "</div>";

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        var selectedFile = null;

        function setStatus(msg, color) {
            var el = document.getElementById("lms-lu-status");
            if (el) { el.textContent = msg; el.style.color = color || "#6b7280"; }
        }

        // Download template
        document.getElementById("lms-lu-dl").addEventListener("click", function () {
            setStatus("Preparing template...", "#6b7280");
            apiPost("lms_plus.api.lesson_upload.download_template", {})
            .then(function (r) {
                var data = r.message;
                if (!data || !data.file_content) { setStatus("Failed to generate template.", "#ef4444"); return; }
                var bytes = atob(data.file_content);
                var arr = new Uint8Array(bytes.length);
                for (var i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
                var blob = new Blob([arr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                var link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = data.filename || "lesson_bulk_upload_template.xlsx";
                link.click();
                setStatus("Template downloaded. Fill it in and upload below.", "#22c55e");
            }).catch(function () { setStatus("Download failed. Please try again.", "#ef4444"); });
        });

        // File selector
        var dropZone = document.getElementById("lms-lu-drop");
        var fileInput = document.getElementById("lms-lu-file");

        dropZone.addEventListener("click", function () { fileInput.click(); });

        fileInput.addEventListener("change", function () {
            if (fileInput.files && fileInput.files[0]) {
                selectedFile = fileInput.files[0];
                dropZone.textContent = "Selected: " + selectedFile.name;
                dropZone.style.borderColor = "#7c3aed";
                dropZone.style.color = "#7c3aed";
                var btn = document.getElementById("lms-lu-upload");
                btn.disabled = false;
                btn.style.opacity = "1";
                setStatus("Ready to upload.", "#22c55e");
            }
        });

        // Upload
        document.getElementById("lms-lu-upload").addEventListener("click", function () {
            if (!selectedFile) return;
            var btn = document.getElementById("lms-lu-upload");
            btn.textContent = "Uploading...";
            btn.disabled = true;

            // Step 1: Upload file to Frappe
            var formData = new FormData();
            formData.append("file", selectedFile, selectedFile.name);
            formData.append("is_private", "0");

            fetch("/api/method/upload_file", {
                method: "POST",
                headers: { "X-Frappe-CSRF-Token": getCsrf() },
                body: formData,
            })
            .then(function (r) { return r.json(); })
            .then(function (r) {
                if (!r.message || !r.message.file_url) {
                    throw new Error("File upload failed");
                }
                setStatus("File uploaded. Creating lessons in background...", "#6b7280");

                // Step 2: Process the uploaded file
                return apiPost("lms_plus.api.lesson_upload.process_lesson_upload", {
                    course: course,
                    file_url: r.message.file_url,
                });
            })
            .then(function (r) {
                if (r.message) {
                    overlay.remove();
                    showToast(r.message.message, true);
                }
            })
            .catch(function (e) {
                btn.textContent = "Upload & Create Lessons";
                btn.disabled = false;
                btn.style.opacity = "1";
                setStatus("Upload failed. Please try again.", "#ef4444");
            });
        });

        function closeModal() { overlay.remove(); }
        document.getElementById("lms-lu-close").addEventListener("click", closeModal);
        document.getElementById("lms-lu-cancel").addEventListener("click", closeModal);
        overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
    }

    function loadUsersForCourse(course) {
        apiPost("frappe.client.get_list", {
            doctype: "User",
            filters: JSON.stringify([
                ["enabled", "=", 1],
                ["user_type", "=", "System User"],
            ]),
            fields: JSON.stringify(["name", "full_name"]),
            limit_page_length: 500,
        }).then(function (r) {
            var users = (r.message || []).filter(function (u) {
                return u.name !== "Administrator" && u.name !== "Guest";
            });
            buildModal("Bulk Enroll Students", users, "Enroll", function (selected, done) {
                apiPost("lms_plus.api.batch.bulk_enroll_in_course", {
                    course: course,
                    members_json: JSON.stringify(selected),
                }).then(function (r) {
                    done();
                    if (r.message) {
                        showToast(r.message.message, true);
                        setTimeout(function () { window.location.reload(); }, 2000);
                    }
                }).catch(function () {
                    done(true);
                    showToast("Enrollment failed. Please try again.", false);
                });
            });
        }).catch(function () {
            showToast("Failed to load users.", false);
        });
    }

    function loadEnrolledForRemove(course) {
        apiPost("frappe.client.get_list", {
            doctype: "LMS Enrollment",
            filters: JSON.stringify([["course", "=", course]]),
            fields: JSON.stringify(["member", "member_name"]),
            limit_page_length: 500,
        }).then(function (r) {
            var members = (r.message || []).map(function (e) {
                return { name: e.member, full_name: e.member_name || e.member };
            });
            if (!members.length) {
                showToast("No students enrolled in this course.", false);
                return;
            }
            buildModal("Bulk Remove Students", members, "Remove", function (selected, done) {
                apiPost("lms_plus.api.batch.bulk_remove_from_course", {
                    course: course,
                    members_json: JSON.stringify(selected),
                }).then(function (r) {
                    done();
                    if (r.message) {
                        showToast(r.message.message, true);
                        setTimeout(function () { window.location.reload(); }, 2000);
                    }
                }).catch(function () {
                    done(true);
                    showToast("Failed to remove students.", false);
                });
            });
        }).catch(function () {
            showToast("Failed to load enrolled students.", false);
        });
    }


    // ════════════════════════════════════════════════════════════════════════
    // BATCH PAGE — Bulk Add + Bulk Remove (LMS Manager only)
    // ════════════════════════════════════════════════════════════════════════

    function initBatchTools() {
        var batch = getSlug(/\/lms\/batches\/([^\/]+)/);
        if (!batch || batch === "new") return;

        // Only show to LMS Managers
        if (!IS_MANAGER) return;

        showToolbar([
            makeBtn("Bulk Add Students", "#1f2937", function () {
                loadUsersForBatchAdd(batch);
            }),
            makeBtn("Bulk Remove Students", "#dc2626", function () {
                loadUsersForBatchRemove(batch);
            })
        ]);
    }

    function loadUsersForBatchAdd(batch) {
        Promise.all([
            apiPost("frappe.client.get_list", {
                doctype: "User",
                filters: JSON.stringify([
                    ["enabled", "=", 1],
                    ["user_type", "=", "System User"],
                ]),
                fields: JSON.stringify(["name", "full_name"]),
                limit_page_length: 500,
            }),
            apiPost("frappe.client.get_list", {
                doctype: "LMS Batch Enrollment",
                filters: JSON.stringify([["batch", "=", batch]]),
                fields: JSON.stringify(["member"]),
                limit_page_length: 500,
            })
        ]).then(function (results) {
            var allUsers = (results[0].message || []).filter(function (u) {
                return u.name !== "Administrator" && u.name !== "Guest";
            });
            var enrolled = new Set((results[1].message || []).map(function (e) { return e.member; }));
            var available = allUsers.filter(function (u) { return !enrolled.has(u.name); });

            if (!available.length) {
                showToast("All users are already enrolled in this batch.", false);
                return;
            }

            buildModal("Bulk Add Students to Batch", available, "Add to Batch", function (selected, done) {
                apiPost("lms_plus.api.batch.bulk_add_students", {
                    batch: batch,
                    members_json: JSON.stringify(selected),
                }).then(function (r) {
                    done();
                    if (r.message) {
                        showToast(r.message.message, true);
                        setTimeout(function () { window.location.reload(); }, 2000);
                    }
                }).catch(function () {
                    done(true);
                    showToast("Failed to add students.", false);
                });
            });
        }).catch(function () {
            showToast("Failed to load users.", false);
        });
    }

    function loadUsersForBatchRemove(batch) {
        apiPost("frappe.client.get_list", {
            doctype: "LMS Batch Enrollment",
            filters: JSON.stringify([["batch", "=", batch]]),
            fields: JSON.stringify(["member", "member_name"]),
            limit_page_length: 500,
        }).then(function (r) {
            var members = (r.message || []).map(function (e) {
                return { name: e.member, full_name: e.member_name || e.member };
            });
            if (!members.length) {
                showToast("No students enrolled in this batch.", false);
                return;
            }
            buildModal("Bulk Remove Students from Batch", members, "Remove from Batch", function (selected, done) {
                apiPost("lms_plus.api.batch.bulk_remove_students", {
                    batch: batch,
                    members_json: JSON.stringify(selected),
                }).then(function (r) {
                    done();
                    if (r.message) {
                        showToast(r.message.message, true);
                        setTimeout(function () { window.location.reload(); }, 2000);
                    }
                }).catch(function () {
                    done(true);
                    showToast("Failed to remove students.", false);
                });
            });
        }).catch(function () {
            showToast("Failed to load batch members.", false);
        });
    }


    // ════════════════════════════════════════════════════════════════════════
    // SHARED MODAL
    // ════════════════════════════════════════════════════════════════════════

    function buildModal(title, users, actionLabel, onConfirm) {
        var old = document.getElementById("lms-bulk-modal");
        if (old) old.remove();

        var selected = new Set();
        var filterText = "";

        var overlay = document.createElement("div");
        overlay.id = "lms-bulk-modal";
        overlay.style.cssText =
            "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.5);" +
            "display:flex;align-items:center;justify-content:center;padding:16px;";

        var modal = document.createElement("div");
        modal.style.cssText =
            "background:#fff;border-radius:12px;width:100%;max-width:480px;" +
            "max-height:80vh;display:flex;flex-direction:column;" +
            "box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;font-family:inherit;";

        modal.innerHTML =
            "<div style=\"padding:16px 20px;border-bottom:1px solid #e5e7eb;" +
            "display:flex;align-items:center;justify-content:space-between;\">" +
            "<span style=\"font-size:16px;font-weight:600;color:#111827;\">" + title + "</span>" +
            "<button id=\"lms-m-close\" style=\"width:28px;height:28px;border:none;" +
            "background:#f3f4f6;border-radius:6px;cursor:pointer;font-size:18px;\">&#215;</button></div>" +

            "<div style=\"padding:12px 20px;border-bottom:1px solid #e5e7eb;\">" +
            "<input id=\"lms-m-search\" type=\"text\" placeholder=\"Search by name or email...\"" +
            " style=\"width:100%;padding:8px 12px;border:1px solid #d1d5db;" +
            "border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;\"></div>" +

            "<div style=\"padding:8px 20px;border-bottom:1px solid #e5e7eb;" +
            "display:flex;align-items:center;gap:8px;background:#f9fafb;\">" +
            "<input type=\"checkbox\" id=\"lms-m-all\" style=\"width:16px;height:16px;cursor:pointer;\">" +
            "<label for=\"lms-m-all\" style=\"font-size:13px;color:#374151;cursor:pointer;" +
            "font-weight:500;\">Select all</label>" +
            "<span id=\"lms-m-count\" style=\"margin-left:auto;font-size:12px;" +
            "color:#6b7280;\">0 selected</span></div>" +

            "<div id=\"lms-m-list\" style=\"overflow-y:auto;flex:1;min-height:0;\"></div>" +

            "<div style=\"padding:12px 20px;border-top:1px solid #e5e7eb;" +
            "display:flex;justify-content:flex-end;gap:8px;\">" +
            "<button id=\"lms-m-cancel\" style=\"padding:8px 16px;border:1px solid #d1d5db;" +
            "border-radius:8px;background:#fff;font-size:14px;cursor:pointer;" +
            "color:#374151;\">Cancel</button>" +
            "<button id=\"lms-m-action\" style=\"padding:8px 16px;border:none;" +
            "border-radius:8px;background:#111827;color:#fff;font-size:14px;" +
            "font-weight:500;cursor:pointer;\">" + actionLabel + "</button></div>";

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        function updateCount() {
            document.getElementById("lms-m-count").textContent = selected.size + " selected";
        }

        function getFiltered() {
            if (!filterText) return users;
            var q = filterText.toLowerCase();
            return users.filter(function (u) {
                return (u.full_name || "").toLowerCase().includes(q) ||
                    u.name.toLowerCase().includes(q);
            });
        }

        function renderList() {
            var list = document.getElementById("lms-m-list");
            var filtered = getFiltered();
            list.innerHTML = "";
            if (!filtered.length) {
                list.innerHTML =
                    "<div style=\"padding:24px;text-align:center;" +
                    "color:#6b7280;font-size:14px;\">No users found</div>";
                return;
            }
            filtered.forEach(function (u) {
                var row = document.createElement("div");
                row.style.cssText =
                    "padding:10px 20px;display:flex;align-items:center;gap:10px;" +
                    "border-bottom:1px solid #f3f4f6;cursor:pointer;";
                var chk = document.createElement("input");
                chk.type = "checkbox";
                chk.style.cssText = "width:16px;height:16px;cursor:pointer;flex-shrink:0;";
                chk.checked = selected.has(u.name);
                var info = document.createElement("div");
                info.innerHTML =
                    "<div style=\"font-size:14px;color:#111827;font-weight:500;\">" +
                    (u.full_name || u.name) + "</div>" +
                    "<div style=\"font-size:12px;color:#6b7280;\">" + u.name + "</div>";
                row.appendChild(chk);
                row.appendChild(info);
                row.addEventListener("click", function (e) {
                    if (e.target !== chk) chk.checked = !chk.checked;
                    if (chk.checked) selected.add(u.name);
                    else selected.delete(u.name);
                    updateCount();
                });
                list.appendChild(row);
            });
        }

        renderList();

        document.getElementById("lms-m-search").addEventListener("input", function (e) {
            filterText = e.target.value;
            renderList();
        });

        document.getElementById("lms-m-all").addEventListener("change", function (e) {
            getFiltered().forEach(function (u) {
                if (e.target.checked) selected.add(u.name);
                else selected.delete(u.name);
            });
            renderList();
            updateCount();
        });

        function closeModal() { overlay.remove(); }
        document.getElementById("lms-m-close").addEventListener("click", closeModal);
        document.getElementById("lms-m-cancel").addEventListener("click", closeModal);
        overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });

        document.getElementById("lms-m-action").addEventListener("click", function () {
            if (!selected.size) { showToast("Select at least one student.", false); return; }
            var btn = document.getElementById("lms-m-action");
            btn.textContent = "Please wait...";
            btn.disabled = true;
            onConfirm(Array.from(selected), function (err) {
                if (err) {
                    btn.textContent = actionLabel;
                    btn.disabled = false;
                } else {
                    closeModal();
                }
            });
        });
    }


    // ════════════════════════════════════════════════════════════════════════
    // NO FAST-FORWARD
    // ════════════════════════════════════════════════════════════════════════

    function showVideoAlert() {
        showToast("You cannot skip ahead. Please watch the video in full.", false);
    }

    function restrictHTML5Videos() {
        document.querySelectorAll("video").forEach(function (video) {
            if (video._lmsRestricted) return;
            video._lmsRestricted = true;
            var max = 0;
            video.addEventListener("timeupdate", function () {
                if (video.currentTime > max) max = video.currentTime;
            });
            video.addEventListener("seeking", function () {
                if (video.currentTime > max + 1) {
                    video.currentTime = max;
                    showVideoAlert();
                }
            });
        });
    }

    function getLessonAndCourse() {
        // URL format: /lms/courses/{course}/learn/{lesson-id}
        var m = window.location.pathname.match(/\/lms\/courses\/([^\/]+)\/learn\/([^\/]+)/);
        return m ? { course: m[1], lesson: m[2] } : null;
    }

    // Resolved lesson name cache — avoids repeat API calls on same page
    var _resolvedLesson = null;
    var _resolvedForPath = null;

    function getLessonSlug() {
        var m = window.location.pathname.match(/\/lms\/courses\/[^\/]+\/learn\/([^\/]+)/);
        return m ? m[1] : null;
    }

    function resolveLessonName(callback) {
        // Reset cache if URL changed (navigated to different lesson)
        if (_resolvedForPath !== window.location.pathname) {
            _resolvedLesson = null;
            _resolvedForPath = window.location.pathname;
        }
        // Return cached value if already resolved
        if (_resolvedLesson !== null && _resolvedLesson !== "") { callback(_resolvedLesson); return; }

        var lc = getLessonAndCourse();
        var slug = getLessonSlug();

        if (!lc || !slug) { _resolvedLesson = ""; callback(""); return; }

        apiPost("lms_plus.api.batch.resolve_lesson_slug", {
            course: lc.course,
            slug: slug,
        }).then(function (r) {
            var name = (r.message && r.message.lesson) ? r.message.lesson : "";
            if (name) {
                _resolvedLesson = name;
            }
            // Do not cache empty — retry next time
            callback(name);
        }).catch(function () {
            callback("");
        });
    }

    function saveVideoPosition(position) {
        if (position < 1) return;
        var lc = getLessonAndCourse();
        if (!lc) return;

        resolveLessonName(function (lessonName) {
            if (!lessonName) return;

            // Save to database for cross-device resume
            apiPost("lms_plus.api.batch.save_video_position", {
                lesson: lessonName,
                course: lc.course,
                position: String(Math.floor(position)),
            }).catch(function () {});

            // Also save to localStorage as fast fallback
            try {
                var key = "lms_vpos_" + (window.user||"guest") + "_" + lessonName;
                localStorage.setItem(key, String(Math.floor(position)));
            } catch (e) {}
        });
    }

    function loadVideoPosition(callback) {
        var lc = getLessonAndCourse();
        if (!lc) { callback(0); return; }

        resolveLessonName(function (lessonName) {
            if (!lessonName) { callback(0); return; }

            // Try database first (cross-device)
            apiPost("lms_plus.api.batch.get_video_position", {
                lesson: lessonName,
                course: lc.course,
            }).then(function (r) {
                var dbPos = (r.message && r.message.position) ? r.message.position : 0;

                if (dbPos > 0) {
                    callback(dbPos);
                } else {
                    // Fallback to localStorage
                    try {
                        var key = "lms_vpos_" + (window.user||"guest") + "_" + lessonName;
                        var local = parseFloat(localStorage.getItem(key) || "0");
                        callback(local > 0 ? local : 0);
                    } catch (e) { callback(0); }
                }
            }).catch(function () {
                // Fallback to localStorage on network error
                try {
                    var key = "lms_vpos_" + (window.user||"guest") + "_" + lessonName;
                    var local = parseFloat(localStorage.getItem(key) || "0");
                    callback(local > 0 ? local : 0);
                } catch (e) { callback(0); }
            });
        });
    }

    function restrictYouTubeIframes() {
        document.querySelectorAll("iframe").forEach(function (iframe) {
            var src = iframe.src || "";
            if ((!src.includes("youtube.com") && !src.includes("youtube-nocookie.com")) ||
                iframe._lmsRestricted) return;
            iframe._lmsRestricted = true;

            function attachRestriction() {
                if (!window.YT || !window.YT.get) return false;
                var player = window.YT.get(iframe.id);
                if (!player || !player.getCurrentTime) return false;

                var max = 0;
                var hasResumed = false;
                var savedPosition = 0;
                var lastSavedAt = 0;
                var SAVE_EVERY_MS = 5000;

                // Load saved position immediately
                loadVideoPosition(function (saved) {
                    savedPosition = saved;
                    max = saved;
                });

                setInterval(function () {
                    try {
                        var state = player.getPlayerState();
                        var cur = player.getCurrentTime();
                        var duration = player.getDuration() || 0;
                        var now = Date.now();

                        if (state === 1) {
                            // First play — seek to saved position
                            if (!hasResumed) {
                                hasResumed = true;
                                if (savedPosition > 2 && savedPosition < duration - 2) {
                                    player.seekTo(savedPosition, true);
                                    return;
                                }
                            }

                            // Forward seek restriction
                            if (cur > max + 0.5) {
                                if (duration > 0 && max >= duration - 3) {
                                    max = cur;
                                } else {
                                    player.seekTo(max, true);
                                    showVideoAlert();
                                }
                            } else {
                                max = Math.max(max, cur);

                                // Save every 5 seconds while playing
                                if (now - lastSavedAt > SAVE_EVERY_MS) {
                                    lastSavedAt = now;
                                    saveVideoPosition(max);
                                }
                            }
                        } else if (state === 0) {
                            // Ended naturally — clear saved position and mark lesson complete
                            max = duration;
                            saveVideoPosition(0);
                            markLessonComplete();
                        }
                    } catch (e) {}
                }, 200);
                return true;
            }

            if (!attachRestriction()) {
                var attempts = 0;
                var poll = setInterval(function () {
                    attempts++;
                    if (attachRestriction() || attempts > 20) {
                        clearInterval(poll);
                    }
                }, 500);
            }
        });
    }

    function restrictVimeoVideos() {
        document.querySelectorAll("iframe").forEach(function (iframe) {
            var src = iframe.src || "";
            if (!src.includes("vimeo.com") || iframe._lmsRestricted) return;
            iframe._lmsRestricted = true;
            function setup() {
                var player = new window.Vimeo.Player(iframe);
                var max = 0;
                player.on("timeupdate", function (d) { if (d.seconds > max) max = d.seconds; });
                player.on("seeked", function (d) {
                    if (d.seconds > max + 1) { player.setCurrentTime(max); showVideoAlert(); }
                });
            }
            if (!window.Vimeo) {
                var tag = document.createElement("script");
                tag.src = "https://player.vimeo.com/api/player.js";
                tag.onload = setup;
                document.head.appendChild(tag);
            } else { setup(); }
        });
    }

    function applyVideoRestrictions() {
        restrictHTML5Videos();
        restrictYouTubeIframes();
        restrictVimeoVideos();
    }

    function markLessonComplete() {
        var lc = getLessonAndCourse();
        var slug = getLessonSlug();
        if (!lc || !slug) return;

        var parts = slug.split("-");
        if (parts.length !== 2) return;

        var chapterNum = parseInt(parts[0]);
        var lessonNum  = parseInt(parts[1]);
        if (isNaN(chapterNum) || isNaN(lessonNum)) return;

        apiPost("lms.lms.api.mark_lesson_progress", {
            course: lc.course,
            chapter_number: String(chapterNum),
            lesson_number: String(lessonNum),
        }).then(function () {
            showToast("Lesson completed!", true);
        }).catch(function () {});
    }

    function initVideoRestriction() {
        // Resolve lesson name immediately on page load
        // so it is ready before the player starts and save timer fires
        var lc = getLessonAndCourse();
        var slug = getLessonSlug();
        if (lc && slug && _resolvedForPath !== window.location.pathname) {
            _resolvedForPath = window.location.pathname;
            apiPost("lms_plus.api.batch.resolve_lesson_slug", {
                course: lc.course,
                slug: slug,
            }).then(function (r) {
                var name = (r.message && r.message.lesson) ? r.message.lesson : "";
                if (name) {
                    _resolvedLesson = name;
                }
            }).catch(function () {});
        }

        applyVideoRestrictions();
        setTimeout(applyVideoRestrictions, 2000);
        if (window.MutationObserver) {
            new MutationObserver(function (muts) {
                muts.forEach(function (m) {
                    m.addedNodes.forEach(function (n) {
                        if (n.nodeType !== 1) return;
                        if (n.tagName === "VIDEO" || n.tagName === "IFRAME") applyVideoRestrictions();
                        if (n.querySelectorAll && n.querySelectorAll("video,iframe").length) {
                            applyVideoRestrictions();
                        }
                    });
                });
            }).observe(document.body, { childList: true, subtree: true });
        }
    }


    function showQuizUploadModal() {
        var old = document.getElementById("lms-quiz-upload-modal");
        if (old) old.remove();

        var overlay = document.createElement("div");
        overlay.id = "lms-quiz-upload-modal";
        overlay.style.cssText =
            "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.5);" +
            "display:flex;align-items:center;justify-content:center;padding:16px;";

        var modal = document.createElement("div");
        modal.style.cssText =
            "background:#fff;border-radius:12px;width:100%;max-width:480px;" +
            "box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;font-family:inherit;";

        modal.innerHTML =
            "<div style=\"padding:16px 20px;border-bottom:1px solid #e5e7eb;" +
            "display:flex;align-items:center;justify-content:space-between;\">" +
            "<span style=\"font-size:16px;font-weight:600;color:#111827;\">Upload Quizzes from Excel</span>" +
            "<button id=\"lms-qu-close\" style=\"width:28px;height:28px;border:none;" +
            "background:#f3f4f6;border-radius:6px;cursor:pointer;font-size:18px;\">&#215;</button></div>" +

            "<div style=\"padding:20px;\">" +

            "<div style=\"margin-bottom:16px;\">" +
            "<div style=\"font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;\">Step 1 — Download the Excel template</div>" +
            "<button id=\"lms-qu-dl\" style=\"padding:8px 14px;border:1px solid #d1d5db;" +
            "border-radius:8px;background:#f9fafb;font-size:13px;cursor:pointer;color:#374151;\">&#8595; Download Template</button></div>" +

            "<div style=\"margin-bottom:8px;\">" +
            "<div style=\"font-size:12px;color:#6b7280;margin-bottom:8px;\">" +
            "The template has two sheets: <b>Quiz Settings</b> (one row per quiz) and <b>Questions</b> (one row per question)." +
            "<br>Set <b>Shuffle + Limit Questions To</b> to give each learner unique questions.</div>" +
            "<div style=\"font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;\">Step 2 — Fill the template and upload</div>" +
            "<input type=\"file\" id=\"lms-qu-file\" accept=\".xlsx\" style=\"display:none;\">" +
            "<div id=\"lms-qu-drop\" style=\"border:2px dashed #d1d5db;border-radius:8px;" +
            "padding:24px;text-align:center;cursor:pointer;color:#6b7280;font-size:13px;\">" +
            "Click to select your filled Excel file</div></div>" +

            "<div id=\"lms-qu-status\" style=\"font-size:12px;color:#6b7280;min-height:20px;margin-bottom:12px;\"></div>" +

            "<div style=\"display:flex;justify-content:flex-end;gap:8px;\">" +
            "<button id=\"lms-qu-cancel\" style=\"padding:8px 16px;border:1px solid #d1d5db;" +
            "border-radius:8px;background:#fff;font-size:14px;cursor:pointer;color:#374151;\">Cancel</button>" +
            "<button id=\"lms-qu-upload\" disabled style=\"padding:8px 16px;border:none;" +
            "border-radius:8px;background:#0369a1;color:#fff;font-size:14px;" +
            "font-weight:500;cursor:pointer;opacity:.4;\">Upload &amp; Create Quizzes</button></div>" +
            "</div>";

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        var selectedFile = null;

        function setStatus(msg, color) {
            var el = document.getElementById("lms-qu-status");
            if (el) { el.textContent = msg; el.style.color = color || "#6b7280"; }
        }

        document.getElementById("lms-qu-dl").addEventListener("click", function () {
            setStatus("Preparing template...", "#6b7280");
            apiPost("lms_plus.api.quiz_upload.download_quiz_template", {})
            .then(function (r) {
                var data = r.message;
                if (!data || !data.file_content) { setStatus("Failed to generate template.", "#ef4444"); return; }
                var bytes = atob(data.file_content);
                var arr = new Uint8Array(bytes.length);
                for (var i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
                var blob = new Blob([arr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                var link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = data.filename || "quiz_bulk_upload_template.xlsx";
                link.click();
                setStatus("Template downloaded. Fill both sheets and upload below.", "#22c55e");
            }).catch(function () { setStatus("Download failed. Please try again.", "#ef4444"); });
        });

        var dropZone = document.getElementById("lms-qu-drop");
        var fileInput = document.getElementById("lms-qu-file");

        dropZone.addEventListener("click", function () { fileInput.click(); });

        fileInput.addEventListener("change", function () {
            if (fileInput.files && fileInput.files[0]) {
                selectedFile = fileInput.files[0];
                dropZone.textContent = "Selected: " + selectedFile.name;
                dropZone.style.borderColor = "#0369a1";
                dropZone.style.color = "#0369a1";
                var btn = document.getElementById("lms-qu-upload");
                btn.disabled = false;
                btn.style.opacity = "1";
                setStatus("Ready to upload.", "#22c55e");
            }
        });

        document.getElementById("lms-qu-upload").addEventListener("click", function () {
            if (!selectedFile) return;
            var btn = document.getElementById("lms-qu-upload");
            btn.textContent = "Uploading...";
            btn.disabled = true;

            var formData = new FormData();
            formData.append("file", selectedFile, selectedFile.name);
            formData.append("is_private", "0");

            fetch("/api/method/upload_file", {
                method: "POST",
                headers: { "X-Frappe-CSRF-Token": getCsrf() },
                body: formData,
            })
            .then(function (r) { return r.json(); })
            .then(function (r) {
                if (!r.message || !r.message.file_url) throw new Error("Upload failed");
                setStatus("File uploaded. Creating quizzes in background...", "#6b7280");
                return apiPost("lms_plus.api.quiz_upload.process_quiz_upload", {
                    file_url: r.message.file_url,
                });
            })
            .then(function (r) {
                if (r.message) {
                    overlay.remove();
                    showToast(r.message.message, true);
                }
            })
            .catch(function () {
                btn.textContent = "Upload & Create Quizzes";
                btn.disabled = false;
                btn.style.opacity = "1";
                setStatus("Upload failed. Please try again.", "#ef4444");
            });
        });

        function closeModal() { overlay.remove(); }
        document.getElementById("lms-qu-close").addEventListener("click", closeModal);
        document.getElementById("lms-qu-cancel").addEventListener("click", closeModal);
        overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
    }

    // ════════════════════════════════════════════════════════════════════════
    // BATCH LIST PAGE — My Batches filter for Team Managers
    // ════════════════════════════════════════════════════════════════════════

    function initBatchListFilter() {
        // Only show filter for Team Managers — LMS Managers already see all
        if (IS_MANAGER) return;

        apiPost("lms_plus.api.manager.get_my_batches", {})
        .then(function (r) {
            var data = r.message;
            if (!data || data.all) return; // LMS Manager — no filter needed

            var myBatches = data.batches || [];
            if (!myBatches.length) return;

            // Add "My Batches" filter button
            var existing = document.getElementById("lms-my-batches-btn");
            if (existing) return;

            var btn = document.createElement("button");
            btn.id = "lms-my-batches-btn";
            btn.textContent = "My Batches (" + myBatches.length + ")";
            btn.style.cssText =
                "position:fixed;top:14px;right:160px;z-index:99998;" +
                "padding:6px 14px;height:32px;border:none;border-radius:8px;" +
                "font-size:13px;font-weight:500;cursor:pointer;color:#fff;" +
                "background:#1f2937;box-shadow:0 2px 8px rgba(0,0,0,.2);";

            var showing = false;
            btn.addEventListener("click", function () {
                showing = !showing;
                btn.style.background = showing ? "#1d4ed8" : "#1f2937";
                btn.textContent = showing
                    ? "Show All Batches"
                    : "My Batches (" + myBatches.length + ")";
                filterBatchCards(showing ? myBatches : null);
            });

            document.body.appendChild(btn);
        })
        .catch(function () {});
    }

    function filterBatchCards(allowedBatches) {
        // Batch cards in the LMS portal have a link to /lms/batches/{name}
        var cards = document.querySelectorAll("a[href*='/lms/batches/']");
        cards.forEach(function (card) {
            var href = card.getAttribute("href") || "";
            var batchName = href.split("/lms/batches/")[1];
            if (!batchName) return;
            batchName = batchName.split("/")[0].split("?")[0];

            if (!allowedBatches) {
                card.style.display = "";
            } else {
                card.style.display = allowedBatches.includes(batchName) ? "" : "none";
            }
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // LEARNER PROFILE — home dashboard + profile page
    // ════════════════════════════════════════════════════════════════════════

    var _profileCache = null;
    var _profileWidgets = [];

    function clearProfileWidgets() {
        _profileWidgets.forEach(function (w) { if (w && w.parentNode) w.parentNode.removeChild(w); });
        _profileWidgets = [];
    }

    function loadProfile(callback) {
        if (_profileCache) { callback(_profileCache); return; }
        apiPost("lms_plus.api.profile.get_learner_profile", { user_email: window.user || "" })
        .then(function (r) {
            if (r.message) { _profileCache = r.message; callback(r.message); }
        }).catch(function () {});
    }

    function avatar(image, name, size) {
        size = size || 44;
        if (image) {
            return "<img src=\"" + image + "\" style=\"width:" + size + "px;height:" + size + "px;" +
                   "border-radius:50%;object-fit:cover;flex-shrink:0;\">";
        }
        var initials = (name || "L").charAt(0).toUpperCase();
        return "<div style=\"width:" + size + "px;height:" + size + "px;border-radius:50%;" +
               "background:#1A7A6E;display:flex;align-items:center;justify-content:center;" +
               "font-size:" + Math.round(size * 0.4) + "px;font-weight:600;color:#fff;" +
               "flex-shrink:0;\">" + initials + "</div>";
    }

    function progressBar(pct) {
        return "<div style=\"height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;margin-top:4px;\">" +
               "<div style=\"height:100%;width:" + Math.min(pct, 100) + "%;background:#1A7A6E;border-radius:3px;\"></div></div>";
    }

    function card(title, html) {
        return "<div style=\"background:#fff;border:1px solid #e5e7eb;border-radius:12px;" +
               "padding:18px 20px;margin-bottom:16px;\">" +
               "<div style=\"font-size:14px;font-weight:600;color:#111827;margin-bottom:14px;" +
               "padding-bottom:10px;border-bottom:1px solid #f3f4f6;\">" + title + "</div>" +
               html + "</div>";
    }

    // ── HOME DASHBOARD ───────────────────────────────────────────────────────

    function initHomeProfile() {
        loadProfile(function (data) {
            injectHomeProfilePanel(data);
        });
    }

    function injectHomeProfilePanel(data) {
        if (document.getElementById("lms-plus-home-panel")) return;

        var tries = 0;
        var interval = setInterval(function () {
            tries++;
            if (tries > 30) { clearInterval(interval); return; }

            // Find the widest content column — the main area, not sidebar
            // We look for the div containing section headings like "My Courses"
            var mainCol = null;
            var allDivs = document.querySelectorAll("div");
            var bestWidth = 0;

            for (var i = 0; i < allDivs.length; i++) {
                var d = allDivs[i];
                var text = d.textContent || "";
                var w = d.offsetWidth;
                // Must contain LMS native sections AND be a substantial column
                if (w > 400 && w > bestWidth &&
                    (text.includes("My Courses") || text.includes("Resume where") ||
                     text.includes("My Batches") || text.includes("Hey,"))) {
                    // Avoid the root body-level wrappers (too wide)
                    if (w < window.innerWidth * 0.9) {
                        mainCol = d;
                        bestWidth = w;
                    }
                }
            }

            if (!mainCol && tries < 25) return;
            clearInterval(interval);
            if (!mainCol) return;
            if (document.getElementById("lms-plus-home-panel")) return;

            var panel = document.createElement("div");
            panel.id = "lms-plus-home-panel";
            panel.style.cssText = "padding:0 0 32px 0;font-family:inherit;";

            // Section divider
            var divider = "<div style=\"margin:24px 0 16px;font-size:16px;font-weight:600;" +
                "color:#111827;border-bottom:2px solid #1A7A6E;padding-bottom:8px;\">" +
                "My Learning Dashboard</div>";

            // Employee info
            var empHtml = "";
            if (data.employee.department || data.employee.designation || data.employee.manager) {
                var rows = [];
                if (data.employee.designation) rows.push(["Designation", data.employee.designation]);
                if (data.employee.department)  rows.push(["Department",  data.employee.department]);
                if (data.employee.manager)     rows.push(["Reports To",  data.employee.manager]);
                if (data.last_login)           rows.push(["Last Login",  data.last_login.split(".")[0]]);
                empHtml = card("Employee Information",
                    "<div style=\"display:grid;grid-template-columns:repeat(2,1fr);gap:12px;\">" +
                    rows.map(function (r) {
                        return "<div><div style=\"font-size:11px;color:#9ca3af;margin-bottom:2px;\">" +
                               r[0] + "</div><div style=\"font-size:13px;font-weight:500;color:#111827;\">" +
                               r[1] + "</div></div>";
                    }).join("") + "</div>"
                );
            }

            // Stats
            var statsHtml = card("Learning Overview",
                "<div style=\"display:grid;grid-template-columns:repeat(4,1fr);gap:12px;\">" +
                [
                    { label: "Enrolled",  value: data.stats.enrolled,  color: "#1A7A6E" },
                    { label: "Completed", value: data.stats.completed, color: "#16a34a" },
                    { label: "Badges",    value: data.stats.badges,    color: "#7c3aed" },
                    { label: "Batches",   value: data.stats.batches,   color: "#0369a1" },
                ].map(function (s) {
                    return "<div style=\"background:#f9fafb;border-radius:10px;padding:16px;" +
                           "text-align:center;\">" +
                           "<div style=\"font-size:32px;font-weight:700;color:" + s.color + ";\">" +
                           s.value + "</div>" +
                           "<div style=\"font-size:12px;color:#6b7280;margin-top:4px;\">" +
                           s.label + "</div></div>";
                }).join("") + "</div>"
            );

            // In Progress courses
            var inProgressHtml = "";
            if (data.enrolled_courses.length) {
                inProgressHtml = card("Courses In Progress",
                    "<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;\">" +
                    data.enrolled_courses.map(function (c) {
                        return "<a href=\"/lms/courses/" + c.course + "\" style=\"text-decoration:none;\">" +
                               "<div style=\"background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;" +
                               "padding:14px;cursor:pointer;\">" +
                               (c.image ? "<img src=\"" + c.image + "\" style=\"width:100%;height:80px;" +
                               "object-fit:cover;border-radius:6px;margin-bottom:10px;\">" :
                               "<div style=\"width:100%;height:80px;background:#e5e7eb;border-radius:6px;" +
                               "margin-bottom:10px;\"></div>") +
                               "<div style=\"font-size:13px;font-weight:600;color:#111827;margin-bottom:6px;\">" +
                               c.title + "</div>" +
                               progressBar(c.progress) +
                               "<div style=\"font-size:11px;color:#6b7280;margin-top:4px;\">" +
                               Math.round(c.progress) + "% complete</div>" +
                               "</div></a>";
                    }).join("") + "</div>"
                );
            }

            // Completed courses
            var completedHtml = "";
            if (data.completed_courses.length) {
                completedHtml = card("Completed Courses",
                    "<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;\">" +
                    data.completed_courses.map(function (c) {
                        return "<div style=\"background:#f0fdf4;border:1px solid #bbf7d0;" +
                               "border-radius:10px;padding:14px;\">" +
                               "<div style=\"font-size:20px;margin-bottom:6px;\">&#10003;</div>" +
                               "<div style=\"font-size:13px;font-weight:600;color:#111827;\">" +
                               c.title + "</div>" +
                               "<div style=\"font-size:11px;color:#16a34a;margin-top:4px;\">Completed</div>" +
                               "</div>";
                    }).join("") + "</div>"
                );
            }

            // Certificates
            var certsHtml = "";
            if (data.certificates.length) {
                certsHtml = card("Certificates Earned",
                    "<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;\">" +
                    data.certificates.map(function (c) {
                        return "<div style=\"background:#fefce8;border:1px solid #fde68a;" +
                               "border-radius:10px;padding:14px;\">" +
                               "<div style=\"font-size:24px;margin-bottom:6px;\">&#127941;</div>" +
                               "<div style=\"font-size:13px;font-weight:600;color:#111827;\">" +
                               (c.course_title || "Certificate") + "</div>" +
                               "<div style=\"font-size:11px;color:#92400e;margin-top:4px;\">" +
                               (c.issue_date ? "Issued: " + c.issue_date : "") + "</div>" +
                               "</div>";
                    }).join("") + "</div>"
                );
            }

            // Badges
            var badgesHtml = "";
            if (data.badges.length) {
                badgesHtml = card("Badges Earned",
                    "<div style=\"display:flex;flex-wrap:wrap;gap:10px;\">" +
                    data.badges.map(function (b) {
                        return "<div style=\"background:#f5f3ff;border:1px solid #ddd6fe;" +
                               "border-radius:10px;padding:12px 16px;text-align:center;\">" +
                               (b.icon ? "<img src=\"" + b.icon + "\" style=\"width:32px;height:32px;" +
                               "margin-bottom:6px;\">" :
                               "<div style=\"font-size:28px;margin-bottom:4px;\">&#127942;</div>") +
                               "<div style=\"font-size:12px;font-weight:600;color:#6d28d9;\">" +
                               (b.title || "Badge") + "</div>" +
                               "</div>";
                    }).join("") + "</div>"
                );
            }

            // Batches
            var batchesHtml = "";
            if (data.batches.length) {
                batchesHtml = card("My Batches",
                    "<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;\">" +
                    data.batches.map(function (b) {
                        return "<a href=\"/lms/batches/" + b.batch + "\" style=\"text-decoration:none;\">" +
                               "<div style=\"background:#eff6ff;border:1px solid #bfdbfe;" +
                               "border-radius:10px;padding:14px;cursor:pointer;\">" +
                               "<div style=\"font-size:20px;margin-bottom:6px;\">&#128101;</div>" +
                               "<div style=\"font-size:13px;font-weight:600;color:#111827;\">" + b.title + "</div>" +
                               "<div style=\"font-size:11px;color:#1d4ed8;margin-top:4px;\">" +
                               (b.start_date || "Active") + "</div>" +
                               "</div></a>";
                    }).join("") + "</div>"
                );
            }

            // Stats cards — compact horizontal row
            var statsRowHtml =
                "<div style=\"display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;\">" +
                [
                    { label: "Enrolled",  value: data.stats.enrolled,  color: "#1A7A6E", bg: "#f0fdf9" },
                    { label: "Completed", value: data.stats.completed, color: "#16a34a", bg: "#f0fdf4" },
                    { label: "Badges",    value: data.stats.badges,    color: "#7c3aed", bg: "#f5f3ff" },
                    { label: "Batches",   value: data.stats.batches,   color: "#0369a1", bg: "#eff6ff" },
                ].map(function (s) {
                    return "<div style=\"flex:1;min-width:100px;background:" + s.bg + ";" +
                           "border-radius:10px;padding:14px 16px;text-align:center;\">" +
                           "<div style=\"font-size:26px;font-weight:700;color:" + s.color + ";\">" +
                           s.value + "</div>" +
                           "<div style=\"font-size:11px;color:#6b7280;margin-top:2px;\">" +
                           s.label + "</div></div>";
                }).join("") + "</div>";

            // Only show sections LMS does not already show natively
            var extraContent = statsRowHtml + empHtml + completedHtml + certsHtml + badgesHtml;
            panel.innerHTML = divider + extraContent;

            mainCol.appendChild(panel);
            _profileWidgets.push(panel);

        }, 400);
    }

    function injectHomeBanner(data) {
        if (document.getElementById("lms-plus-home-banner")) return;

        // Wait for Vue to render main content
        var tries = 0;
        var interval = setInterval(function () {
            tries++;
            // Look for any rendered content in the main area
            var main = document.querySelector("main") ||
                       document.querySelector(".main-section") ||
                       document.querySelector(".layout-main-section") ||
                       document.querySelector("[class*=\"content\"]");

            if (!main && tries < 20) return;
            clearInterval(interval);

            var banner = document.createElement("div");
            banner.id = "lms-plus-home-banner";
            banner.style.cssText =
                "position:fixed;top:0;left:0;right:0;z-index:9990;" +
                "background:#fff;border-bottom:1px solid #e5e7eb;" +
                "padding:10px 24px;display:flex;align-items:center;" +
                "gap:16px;box-shadow:0 1px 8px rgba(0,0,0,.06);";

            var dept = [data.employee.designation, data.employee.department]
                .filter(Boolean).join(" • ") || "Learner";

            var stats = [
                { label: "Enrolled",  value: data.stats.enrolled },
                { label: "Completed", value: data.stats.completed },
                { label: "Badges",    value: data.stats.badges },
                { label: "Batches",   value: data.stats.batches },
            ].map(function (s) {
                return "<div style=\"text-align:center;padding:0 12px;" +
                       "border-right:1px solid #e5e7eb;\">" +
                       "<div style=\"font-size:18px;font-weight:700;color:#1A7A6E;\">" + s.value + "</div>" +
                       "<div style=\"font-size:11px;color:#6b7280;\">" + s.label + "</div></div>";
            }).join("");

            var profileUrl = "/lms/user/" + (data.user.username || encodeURIComponent(data.user.email));

            banner.innerHTML =
                avatar(data.user.image, data.user.full_name, 36) +
                "<div style=\"flex:1;min-width:0;\">" +
                "<div style=\"font-size:14px;font-weight:600;color:#111827;white-space:nowrap;" +
                "overflow:hidden;text-overflow:ellipsis;\">Welcome, " + data.user.full_name + "</div>" +
                "<div style=\"font-size:12px;color:#6b7280;\">" + dept + "</div></div>" +
                "<div style=\"display:flex;align-items:center;\">" + stats + "</div>" +
                "<a href=\"" + profileUrl + "\" style=\"padding:6px 14px;background:#1A7A6E;" +
                "color:#fff;border-radius:8px;font-size:12px;font-weight:500;" +
                "text-decoration:none;white-space:nowrap;\">My Profile</a>";

            document.body.appendChild(banner);
            _profileWidgets.push(banner);

            // Push page content down so banner does not overlap
            var spacer = document.createElement("div");
            spacer.id = "lms-plus-spacer";
            spacer.style.cssText = "height:60px;";
            if (document.body.firstChild) {
                document.body.insertBefore(spacer, document.body.firstChild);
            }
            _profileWidgets.push(spacer);
        }, 300);
    }


    // ── USER PROFILE PAGE ────────────────────────────────────────────────────

    function initUserProfile() {
        loadProfile(function (data) {
            injectProfilePanel(data);
        });
    }

    function injectProfilePanel(data) {
        if (document.getElementById("lms-plus-profile-panel")) return;

        var tries = 0;
        var interval = setInterval(function () {
            tries++;
            var container = document.querySelector(".profile-section") ||
                           document.querySelector("[class*=\"profile\"]") ||
                           document.querySelector("main") ||
                           document.querySelector(".page-content");

            if (!container && tries < 20) return;
            clearInterval(interval);
            if (!container) return;

            var panel = document.createElement("div");
            panel.id = "lms-plus-profile-panel";
            panel.style.cssText =
                "max-width:820px;margin:24px auto;padding:0 16px;font-family:inherit;";

            var hrHtml = "";
            if (data.employee.department || data.employee.designation || data.employee.manager) {
                var hrRows = [];
                if (data.employee.designation) hrRows.push(["Designation", data.employee.designation]);
                if (data.employee.department)  hrRows.push(["Department",  data.employee.department]);
                if (data.employee.manager)     hrRows.push(["Reports To",  data.employee.manager]);
                if (data.last_login)           hrRows.push(["Last Login",  data.last_login.split(".")[0]]);
                hrHtml = card("Employee Information",
                    "<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:10px;\">" +
                    hrRows.map(function (r) {
                        return "<div><div style=\"font-size:11px;color:#9ca3af;margin-bottom:2px;\">" + r[0] + "</div>" +
                               "<div style=\"font-size:13px;color:#111827;font-weight:500;\">" + r[1] + "</div></div>";
                    }).join("") + "</div>"
                );
            }

            // Stats
            var statsHtml = card("Learning Overview",
                "<div style=\"display:grid;grid-template-columns:repeat(4,1fr);gap:12px;\">" +
                [
                    { label: "Enrolled",  value: data.stats.enrolled,  color: "#1A7A6E" },
                    { label: "Completed", value: data.stats.completed, color: "#16a34a" },
                    { label: "Badges",    value: data.stats.badges,    color: "#7c3aed" },
                    { label: "Batches",   value: data.stats.batches,   color: "#0369a1" },
                ].map(function (s) {
                    return "<div style=\"background:#f9fafb;border-radius:10px;padding:14px;" +
                           "text-align:center;\">" +
                           "<div style=\"font-size:28px;font-weight:700;color:" + s.color + ";\">"+s.value+"</div>" +
                           "<div style=\"font-size:12px;color:#6b7280;margin-top:2px;\">" + s.label + "</div></div>";
                }).join("") + "</div>"
            );

            // Courses in progress
            var inProgressHtml = "";
            if (data.enrolled_courses.length) {
                inProgressHtml = card("Courses In Progress",
                    data.enrolled_courses.map(function (c) {
                        return "<div style=\"display:flex;align-items:center;gap:12px;margin-bottom:12px;\">" +
                               (c.image ? "<img src=\"" + c.image + "\" style=\"width:40px;height:40px;" +
                               "border-radius:8px;object-fit:cover;flex-shrink:0;\">" :
                               "<div style=\"width:40px;height:40px;border-radius:8px;background:#e5e7eb;" +
                               "flex-shrink:0;\"></div>") +
                               "<div style=\"flex:1;min-width:0;\">" +
                               "<div style=\"font-size:13px;font-weight:500;color:#111827;\">" + c.title + "</div>" +
                               progressBar(c.progress) +
                               "<div style=\"font-size:11px;color:#6b7280;margin-top:2px;\">" +
                               Math.round(c.progress) + "% complete</div></div>" +
                               "<a href=\"/lms/courses/" + c.course + "\" style=\"font-size:12px;" +
                               "color:#1A7A6E;text-decoration:none;font-weight:500;white-space:nowrap;\">" +
                               "Continue →</a></div>";
                    }).join("")
                );
            }

            // Completed courses
            var completedHtml = "";
            if (data.completed_courses.length) {
                completedHtml = card("Completed Courses",
                    data.completed_courses.map(function (c) {
                        return "<div style=\"display:flex;align-items:center;gap:12px;margin-bottom:10px;\">" +
                               "<div style=\"width:8px;height:8px;border-radius:50%;background:#16a34a;" +
                               "flex-shrink:0;\"></div>" +
                               "<div style=\"font-size:13px;color:#111827;font-weight:500;flex:1;\">" + c.title + "</div>" +
                               "<span style=\"font-size:11px;background:#dcfce7;color:#16a34a;" +
                               "padding:2px 8px;border-radius:10px;\">Completed</span></div>";
                    }).join("")
                );
            }

            // Certificates
            var certsHtml = "";
            if (data.certificates.length) {
                certsHtml = card("Certificates",
                    data.certificates.map(function (c) {
                        return "<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:10px;\">" +
                               "<div style=\"font-size:20px;\">&#127941;</div>" +
                               "<div style=\"flex:1;\">" +
                               "<div style=\"font-size:13px;font-weight:500;color:#111827;\">" +
                               (c.course_title || "Certificate") + "</div>" +
                               "<div style=\"font-size:11px;color:#6b7280;\">" +
                               (c.issue_date ? "Issued: " + c.issue_date : "") +
                               (c.batch_title ? " • " + c.batch_title : "") + "</div></div></div>";
                    }).join("")
                );
            }

            // Badges
            var badgesHtml = "";
            if (data.badges.length) {
                badgesHtml = card("Badges Earned",
                    "<div style=\"display:flex;flex-wrap:wrap;gap:10px;\">" +
                    data.badges.map(function (b) {
                        return "<div style=\"background:#f9fafb;border:1px solid #e5e7eb;" +
                               "border-radius:10px;padding:10px 14px;text-align:center;" +
                               "min-width:100px;\">" +
                               (b.icon ? "<img src=\"" + b.icon + "\" style=\"width:32px;height:32px;" +
                               "margin-bottom:6px;\">" :
                               "<div style=\"font-size:28px;margin-bottom:4px;\">&#127942;</div>") +
                               "<div style=\"font-size:12px;font-weight:500;color:#111827;\">" + (b.title||"Badge") + "</div>" +
                               "<div style=\"font-size:10px;color:#6b7280;\">" + (b.badge_type||"") + "</div>" +
                               "</div>";
                    }).join("") + "</div>"
                );
            }

            // Batches
            var batchesHtml = "";
            if (data.batches.length) {
                batchesHtml = card("Batch Memberships",
                    data.batches.map(function (b) {
                        return "<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:10px;\">" +
                               "<div style=\"font-size:18px;\">&#128101;</div>" +
                               "<div style=\"flex:1;\">" +
                               "<div style=\"font-size:13px;font-weight:500;color:#111827;\">" + b.title + "</div>" +
                               "<div style=\"font-size:11px;color:#6b7280;\">" +
                               (b.start_date ? b.start_date + (b.end_date ? " – " + b.end_date : "") : "Active") +
                               "</div></div></div>";
                    }).join("")
                );
            }

            panel.innerHTML =
                hrHtml + statsHtml + inProgressHtml +
                completedHtml + certsHtml + badgesHtml + batchesHtml;

            // Inject after first child of container
            if (container.firstChild) {
                container.insertBefore(panel, container.firstChild.nextSibling || null);
            } else {
                container.appendChild(panel);
            }
            _profileWidgets.push(panel);
        }, 300);
    }

    // ════════════════════════════════════════════════════════════════════════
    // ROUTE DETECTION
    // ════════════════════════════════════════════════════════════════════════

    function detectRoute() {
        var path = window.location.pathname;
        hideToolbar();
        clearProfileWidgets();
        _profileCache = null;

        if (path.includes("/learn/")) {
            setTimeout(initSequentialAccess, 500);

        } else if (path === "/lms" || path === "/lms/") {
            setTimeout(initHomeProfile, 800);

        } else if (path.match(/\/lms\/user\/[^\/]+/)) {
            setTimeout(initUserProfile, 800);

        } else if (path.match(/\/lms\/courses\/[^\/]+/) && !path.includes("/learn/")) {
            var courseSlug = getSlug(/\/lms\/courses\/([^\/]+)/);
            if (!window.location.hash || window.location.hash === "#dashboard") {
                setTimeout(initCourseTools, 300);
            }
            if (courseSlug) {
                initCourseSettings(courseSlug);
            }
        } else if (path.match(/\/lms\/batches\/[^\/]+/) && !path.includes("/details/")) {
            setTimeout(initBatchTools, 300);
        } else if (path === "/lms/batches" || path === "/lms/batches/") {
            setTimeout(initBatchListFilter, 500);
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // COURSE SETTINGS — prerequisite field in Settings tab
    // ════════════════════════════════════════════════════════════════════════

    function initCourseSettings(course) {
        if (!IS_MANAGER) return;
        function tryInject() {
            if (window.location.hash !== "#settings") return;
            if (document.getElementById("lms-prereq-field")) return;
            setTimeout(function () { doInject(course); }, 800);
        }
        tryInject();
        window.addEventListener("hashchange", function () { setTimeout(tryInject, 400); });
    }

    function doInject(course) {
        if (document.getElementById("lms-prereq-field")) return;

        var target = null;

        // Find the scrollable settings panel — widest overflow div
        var divs = document.querySelectorAll("div");
        var best = 0;
        for (var i = 0; i < divs.length; i++) {
            var d = divs[i];
            if (d.scrollHeight > 500 && d.offsetWidth > 400 && d.offsetWidth > best) {
                target = d;
                best = d.offsetWidth;
            }
        }

        if (!target) {
            setTimeout(function () { doInject(course); }, 1000);
            return;
        }

        Promise.all([
            apiPost("frappe.client.get_list", {
                doctype: "LMS Course",
                fields: JSON.stringify(["name", "title"]),
                filters: JSON.stringify([["name", "!=", course]]),
                limit_page_length: 100,
            }),
            apiPost("frappe.client.get_value", {
                doctype: "LMS Course",
                filters: JSON.stringify({ name: course }),
                fieldname: "custom_prerequisite_course",
            })
        ]).then(function (results) {
            var courses = results[0].message || [];
            var current = (results[1].message && results[1].message.custom_prerequisite_course) || "";
            injectPrereqField(target, courses, current, course);
        }).catch(function () {
            injectPrereqField(target, [], "", course);
        });
    }

    function injectPrereqField(target, courses, currentVal, course) {
        if (document.getElementById("lms-prereq-field")) return;

        var wrapper = document.createElement("div");
        wrapper.id = "lms-prereq-field";
        wrapper.style.cssText =
            "background:#f0fdf9;border:1px solid #99e6d8;border-radius:10px;" +
            "padding:16px 20px;margin:0 0 20px 0;";

        var opts = courses.map(function (c) {
            return "<option value=\"" + c.name + "\"" +
                (c.name === currentVal ? " selected" : "") +
                ">" + (c.title || c.name) + "</option>";
        }).join("");

        wrapper.innerHTML =
            "<div style=\"font-size:13px;font-weight:600;color:#065f46;margin-bottom:6px;\">" +
            "&#128274; Prerequisite Course</div>" +
            "<div style=\"font-size:12px;color:#6b7280;margin-bottom:10px;\">" +
            "Learners must complete this course before accessing lessons here." +
            "</div>" +
            "<div style=\"display:flex;gap:8px;align-items:center;\">" +
            "<select id=\"lms-prereq-select\" style=\"flex:1;padding:7px 10px;" +
            "border:1px solid #d1d5db;border-radius:8px;font-size:13px;background:#fff;\">" +
            "<option value=\"\">-- No prerequisite --</option>" + opts +
            "</select>" +
            "<button id=\"lms-prereq-save\" style=\"padding:7px 18px;background:#1A7A6E;" +
            "color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:500;" +
            "cursor:pointer;white-space:nowrap;\">Save</button>" +
            "</div>" +
            "<div id=\"lms-prereq-msg\" style=\"font-size:12px;margin-top:8px;\"></div>";

        target.insertBefore(wrapper, target.firstChild);

        document.getElementById("lms-prereq-save").addEventListener("click", function () {
            var val = document.getElementById("lms-prereq-select").value;
            var msg = document.getElementById("lms-prereq-msg");
            var btn = document.getElementById("lms-prereq-save");
            btn.textContent = "Saving...";
            btn.disabled = true;

            apiPost("frappe.client.set_value", {
                doctype: "LMS Course",
                name: course,
                fieldname: "custom_prerequisite_course",
                value: val,
            }).then(function () {
                btn.textContent = "Save";
                btn.disabled = false;
                msg.style.color = "#1A7A6E";
                msg.textContent = val
                    ? "Saved. Learners must complete \"" + val + "\" first."
                    : "Prerequisite removed successfully.";
            }).catch(function () {
                btn.textContent = "Save";
                btn.disabled = false;
                msg.style.color = "#ef4444";
                msg.textContent = "Failed to save. Please try again.";
            });
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // COURSE SETTINGS — prerequisite field in Settings tab
    // ════════════════════════════════════════════════════════════════════════

    function initCourseSettings(course) {
        if (!IS_MANAGER) return;
        function tryInject() {
            if (window.location.hash !== "#settings") return;
            if (document.getElementById("lms-prereq-field")) return;
            setTimeout(function () { doInject(course); }, 800);
        }
        tryInject();
        window.addEventListener("hashchange", function () { setTimeout(tryInject, 400); });
    }

    function doInject(course) {
        if (document.getElementById("lms-prereq-field")) return;

        var target = null;

        // Find the scrollable settings panel — widest overflow div
        var divs = document.querySelectorAll("div");
        var best = 0;
        for (var i = 0; i < divs.length; i++) {
            var d = divs[i];
            if (d.scrollHeight > 500 && d.offsetWidth > 400 && d.offsetWidth > best) {
                target = d;
                best = d.offsetWidth;
            }
        }

        if (!target) {
            setTimeout(function () { doInject(course); }, 1000);
            return;
        }

        Promise.all([
            apiPost("frappe.client.get_list", {
                doctype: "LMS Course",
                fields: JSON.stringify(["name", "title"]),
                filters: JSON.stringify([["name", "!=", course]]),
                limit_page_length: 100,
            }),
            apiPost("frappe.client.get_value", {
                doctype: "LMS Course",
                filters: JSON.stringify({ name: course }),
                fieldname: "custom_prerequisite_course",
            })
        ]).then(function (results) {
            var courses = results[0].message || [];
            var current = (results[1].message && results[1].message.custom_prerequisite_course) || "";
            injectPrereqField(target, courses, current, course);
        }).catch(function () {
            injectPrereqField(target, [], "", course);
        });
    }

    function injectPrereqField(target, courses, currentVal, course) {
        if (document.getElementById("lms-prereq-field")) return;

        // Find the course header Save button — rightmost Save button on the page
        var saveBtn = null;
        var allBtns = document.querySelectorAll("button");
        var bestRight = 0;
        allBtns.forEach(function(b) {
            if (b.textContent.trim() === "Save") {
                var r = b.getBoundingClientRect();
                // Pick the Save button that is highest on the page (smallest top)
                // and furthest right — that is the course header Save
                if (r.top < 300 && r.right > bestRight) {
                    bestRight = r.right;
                    saveBtn = b;
                }
            }
        });
        if (!saveBtn) return;

        var opts = courses.map(function (c) {
            return "<option value=\"" + c.name + "\"" +
                (c.name === currentVal ? " selected" : "") +
                ">" + (c.title || c.name) + "</option>";
        }).join("");

        var wrapper = document.createElement("div");
        wrapper.id = "lms-prereq-field";
        wrapper.style.cssText =
            "display:inline-flex;align-items:center;gap:6px;margin-right:8px;";

        wrapper.innerHTML =
            "<span style=\"font-size:12px;color:#374151;font-weight:500;" +
            "white-space:nowrap;\">Prerequisite:</span>" +
            "<select id=\"lms-prereq-select\" style=\"height:30px;padding:2px 8px;" +
            "border:1px solid #d1d5db;border-radius:6px;font-size:12px;" +
            "background:#fff;cursor:pointer;max-width:160px;\">" +
            "<option value=\"\">None</option>" + opts + "</select>" +
            "<button id=\"lms-prereq-save\" style=\"height:30px;padding:0 10px;" +
            "background:#1A7A6E;color:#fff;border:none;border-radius:6px;" +
            "font-size:12px;font-weight:500;cursor:pointer;\">Set</button>" +
            "<span id=\"lms-prereq-msg\" style=\"font-size:11px;color:#1A7A6E;\"></span>";

        saveBtn.parentElement.insertBefore(wrapper, saveBtn);

        document.getElementById("lms-prereq-save").addEventListener("click", function () {
            var val = document.getElementById("lms-prereq-select").value || "";
            var msg = document.getElementById("lms-prereq-msg");
            var btn = document.getElementById("lms-prereq-save");

            // Guard: circular prerequisite check
            // If setting B as prereq for A, make sure A is not already a prereq of B
            if (val) {
                apiPost("frappe.client.get_value", {
                    doctype: "LMS Course",
                    filters: JSON.stringify({ name: val }),
                    fieldname: "custom_prerequisite_course",
                }).then(function (r) {
                    var valPrereq = (r.message && r.message.custom_prerequisite_course) || "";
                    if (valPrereq === course) {
                        msg.style.color = "#ef4444";
                        msg.textContent =
                            "Circular dependency! " + val +
                            " already requires this course as its prerequisite.";
                        return;
                    }
                    doSave(val, btn, msg, course);
                }).catch(function () {
                    doSave(val, btn, msg, course);
                });
            } else {
                doSave(val, btn, msg, course);
            }
        });
    }

    function doSave(val, btn, msg, course) {
        btn.textContent = "...";
        btn.disabled = true;
        msg.textContent = "";
        msg.style.color = "#1A7A6E";

        // Use set_value with null for empty to ensure DB is cleared
        fetch("/api/method/frappe.client.set_value", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Frappe-CSRF-Token": getCsrf(),
                "X-Requested-With": "XMLHttpRequest",
            },
            body: new URLSearchParams({
                doctype: "LMS Course",
                name: course,
                fieldname: "custom_prerequisite_course",
                value: val || "",
            }),
        })
        .then(function (r) { return r.json(); })
        .then(function (r) {
            btn.textContent = "Set";
            btn.disabled = false;
            if (r.exc) {
                msg.style.color = "#ef4444";
                msg.textContent = "Failed to save.";
            } else {
                msg.style.color = "#1A7A6E";
                msg.textContent = val ? "✓ Saved" : "✓ Removed";
                setTimeout(function () { msg.textContent = ""; }, 3000);
            }
        })
        .catch(function () {
            btn.textContent = "Set";
            btn.disabled = false;
            msg.style.color = "#ef4444";
            msg.textContent = "Failed. Please try again.";
        });
    }
    // ════════════════════════════════════════════════════════════════════════
    // SEQUENTIAL COURSE ACCESS — lock lesson if prerequisite not complete
    // ════════════════════════════════════════════════════════════════════════

    function initSequentialAccess() {
        var m = window.location.pathname.match(/\/lms\/courses\/([^\/]+)\/learn\//);
        if (!m) return;
        var course = m[1];

        apiPost("lms_plus.api.access.check_course_access", { course: course })
        .then(function (r) {
            var data = r.message;
            if (!data || data.allowed) return;
            // Not allowed — inject lock overlay
            waitAndLock(data);
        })
        .catch(function () {});
    }

    function waitAndLock(data) {
        var tries = 0;
        var interval = setInterval(function () {
            tries++;
            if (tries > 30) { clearInterval(interval); return; }

            var content = document.querySelector(".outline-lesson");
            if (!content) return;
            clearInterval(interval);

            // Already locked
            if (document.getElementById("lms-plus-lock")) return;

            // Hide the lesson content
            content.style.filter = "blur(4px)";
            content.style.pointerEvents = "none";
            content.style.userSelect = "none";

            // Build lock overlay
            var overlay = document.createElement("div");
            overlay.id = "lms-plus-lock";
            overlay.style.cssText =
                "position:fixed;inset:0;z-index:9990;" +
                "display:flex;align-items:center;justify-content:center;" +
                "background:rgba(255,255,255,0.85);";

            var pct = Math.round(data.prerequisite_progress || 0);
            var reason = data.reason === "batch_order"
                ? "Complete the previous course in this batch first."
                : "You must complete the prerequisite course first.";

            overlay.innerHTML =
                "<div style=\"background:#fff;border:1px solid #e5e7eb;border-radius:16px;" +
                "padding:40px 48px;max-width:460px;text-align:center;" +
                "box-shadow:0 8px 32px rgba(0,0,0,.12);\">" +
                "<div style=\"font-size:48px;margin-bottom:16px;\">&#128274;</div>" +
                "<div style=\"font-size:20px;font-weight:700;color:#111827;" +
                "margin-bottom:8px;\">Lesson Locked</div>" +
                "<div style=\"font-size:14px;color:#6b7280;margin-bottom:24px;\">" +
                reason + "</div>" +

                "<div style=\"background:#f9fafb;border:1px solid #e5e7eb;" +
                "border-radius:10px;padding:16px;margin-bottom:24px;text-align:left;\">" +
                "<div style=\"font-size:12px;color:#9ca3af;margin-bottom:4px;\">Complete this first</div>" +
                "<div style=\"font-size:15px;font-weight:600;color:#111827;margin-bottom:10px;\">" +
                (data.prerequisite_title || data.prerequisite_course) + "</div>" +
                "<div style=\"height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;\">" +
                "<div style=\"height:100%;width:" + pct + "%;background:#1A7A6E;" +
                "border-radius:4px;\"></div></div>" +
                "<div style=\"font-size:12px;color:#6b7280;margin-top:4px;\">" +
                pct + "% completed</div></div>" +

                "<a href=\"/lms/courses/" + data.prerequisite_course + "\"" +
                " style=\"display:inline-block;background:#1A7A6E;color:#fff;" +
                "padding:10px 28px;border-radius:8px;font-size:14px;font-weight:500;" +
                "text-decoration:none;margin-right:8px;\">Go to Course</a>" +
                "<button onclick=\"history.back()\" style=\"padding:10px 20px;" +
                "border:1px solid #d1d5db;border-radius:8px;background:#fff;" +
                "font-size:14px;cursor:pointer;color:#374151;\">Go Back</button>" +
                "</div>";

            document.body.appendChild(overlay);
        }, 300);
    }

    function init() {
        detectRoute();
        initVideoRestriction();

        window.addEventListener("hashchange", function () {
            setTimeout(detectRoute, 300);
        });

        var origPush = history.pushState;
        history.pushState = function () {
            origPush.apply(history, arguments);
            setTimeout(detectRoute, 400);
        };
        var origReplace = history.replaceState;
        history.replaceState = function () {
            origReplace.apply(history, arguments);
            setTimeout(detectRoute, 400);
        };
        window.addEventListener("popstate", function () {
            setTimeout(detectRoute, 300);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

}());
