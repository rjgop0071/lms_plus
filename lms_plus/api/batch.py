import frappe
from frappe import _


def after_batch_enrollment(doc, method=None):
    """
    Fires after a student is added to a batch (LMS Batch Enrollment after_insert).
    Auto-creates LMS Enrollment for every course linked to that batch.
    Skips courses the student is already enrolled in.
    """
    batch_courses = frappe.get_all(
        "Batch Course",
        filters={"parent": doc.batch},
        pluck="course",
    )

    if not batch_courses:
        return

    already_enrolled = frappe.get_all(
        "LMS Enrollment",
        filters={"member": doc.member, "course": ["in", batch_courses]},
        pluck="course",
    )

    to_enroll = set(batch_courses) - set(already_enrolled)

    for course in to_enroll:
        enrollment = frappe.get_doc({
            "doctype": "LMS Enrollment",
            "member": doc.member,
            "member_name": doc.member_name,
            "member_username": doc.member_username,
            "member_image": doc.member_image,
            "course": course,
            "enrollment_from_batch": doc.batch,
            "member_type": "Student",
            "role": "Member",
        })
        enrollment.insert(ignore_permissions=True)

    _refresh_course_stats()


def _refresh_course_stats():
    """Refresh LMS Course enrollment counts after any enrollment change."""
    try:
        from lms.lms.api import update_course_statistics
        update_course_statistics()
    except Exception:
        pass


def on_batch_enrollment_trash(doc, method=None):
    """
    Fires before a student is removed from a batch (LMS Batch Enrollment on_trash).
    Deletes all LMS Enrollment records created via this batch for this student.
    Option A: progress is permanently deleted.
    """
    enrollments = frappe.get_all(
        "LMS Enrollment",
        filters={
            "member": doc.member,
            "enrollment_from_batch": doc.batch,
        },
        pluck="name",
    )

    for name in enrollments:
        frappe.delete_doc(
            "LMS Enrollment",
            name,
            ignore_permissions=True,
            force=True,
        )


def on_batch_trash(doc, method=None):
    """
    Fires before an LMS Batch is deleted (LMS Batch on_trash).
    Cleans up all linked records in the correct order so Frappe
    does not block the deletion due to existing references.
    LMS Certificates are kept as historical records — they were earned.
    """
    # Step 1: course enrollments that came from this batch — delete first
    # so that on_batch_enrollment_trash finds nothing when it fires in step 2
    frappe.db.delete("LMS Enrollment", {"enrollment_from_batch": doc.name})

    # Step 2: batch membership records
    frappe.db.delete("LMS Batch Enrollment", {"batch": doc.name})

    # Step 3: feedback left for this batch
    frappe.db.delete("LMS Batch Feedback", {"batch": doc.name})

    # Step 4: live class sessions linked to this batch
    frappe.db.delete("LMS Live Class", {"batch_name": doc.name})

    # Step 5: certificate requests for this batch
    frappe.db.delete("LMS Certificate Request", {"batch_name": doc.name})

    # Step 6: certificate evaluations for this batch
    frappe.db.delete("LMS Certificate Evaluation", {"batch_name": doc.name})

    # LMS Certificate records are intentionally kept —
    # a certificate was earned and should remain on the learner record

    frappe.db.commit()
    frappe.logger().info(f"LMS Plus: cleaned up all records for deleted batch '{doc.name}'.")


@frappe.whitelist()
def bulk_add_students(batch: str, members_json: str):
    """
    Whitelisted API — add multiple students to a batch in one action.
    Accepts batch name and a JSON list of member email strings.
    Runs as a background job so the screen never freezes.
    """
    members = frappe.parse_json(members_json)

    if not isinstance(members, list) or not members:
        frappe.throw(_("Please provide a non-empty list of members."))

    if not frappe.db.exists("LMS Batch", batch):
        frappe.throw(_("Batch {0} not found.").format(batch))

    frappe.enqueue(
        "lms_plus.api.batch._bulk_add_job",
        batch=batch,
        members=members,
        queue="long",
        timeout=3600,
    )

    return {
        "status": "enqueued",
        "batch": batch,
        "count": len(members),
        "message": _("{0} students are being added in the background.").format(len(members)),
    }


def _bulk_add_job(batch: str, members: list):
    """
    Background job — creates LMS Batch Enrollment for each member.
    The after_insert hook handles course enrollment automatically.
    """
    existing_members = set(
        frappe.get_all(
            "LMS Batch Enrollment",
            filters={"batch": batch},
            pluck="member",
        )
    )

    new_members = [m for m in members if m not in existing_members]

    if not new_members:
        frappe.logger().info(f"LMS Plus bulk enroll '{batch}': all already in batch.")
        return

    users = frappe.get_all(
        "User",
        filters={"name": ["in", new_members], "enabled": 1},
        fields=["name", "full_name", "username", "user_image"],
    )
    user_map = {u.name: u for u in users}

    success, failed = 0, []

    for member in new_members:
        if member not in user_map:
            failed.append(member)
            frappe.log_error(
                title=f"LMS Plus: member {member} not found or disabled",
                message=f"Batch: {batch}",
            )
            continue

        try:
            user = user_map[member]
            enrollment = frappe.get_doc({
                "doctype": "LMS Batch Enrollment",
                "member": member,
                "member_name": user.full_name,
                "member_username": user.username,
                "member_image": user.user_image,
                "batch": batch,
            })
            enrollment.insert(ignore_permissions=True)
            success += 1
        except Exception:
            failed.append(member)
            frappe.log_error(
                title=f"LMS Plus: bulk enrollment failed for {member} in {batch}",
                message=frappe.get_traceback(),
            )

    skipped = len(existing_members & set(members))
    frappe.logger().info(
        f"LMS Plus bulk enroll '{batch}': "
        f"{success} added, {skipped} skipped, {len(failed)} failed."
    )


@frappe.whitelist()
def get_batch_students(batch: str):
    """
    Returns all students currently enrolled in a batch
    along with their course progress for that batch.
    Used by the Add Students dialog to show who is already enrolled.
    """
    if not frappe.db.exists("LMS Batch", batch):
        frappe.throw(_("Batch {0} not found.").format(batch))

    return frappe.get_all(
        "LMS Batch Enrollment",
        filters={"batch": batch},
        fields=["member", "member_name", "member_username"],
        order_by="member_name asc",
    )


@frappe.whitelist()
def bulk_enroll_in_course(course: str, members_json: str):
    """
    Whitelisted API — enroll multiple students directly into a course.
    Called from the LMS portal course dashboard page.
    """
    members = frappe.parse_json(members_json)

    if not isinstance(members, list) or not members:
        frappe.throw(_("Please provide a non-empty list of members."))

    if not frappe.db.exists("LMS Course", course):
        frappe.throw(_("Course {0} not found.").format(course))

    # Single query — who is already enrolled
    already_enrolled = set(
        frappe.get_all(
            "LMS Enrollment",
            filters={"course": course, "member": ["in", members]},
            pluck="member",
        )
    )

    # Single query — fetch all user data at once
    users = frappe.get_all(
        "User",
        filters={"name": ["in", members], "enabled": 1},
        fields=["name", "full_name", "username", "user_image"],
    )
    user_map = {u.name: u for u in users}

    success, skipped, failed = 0, 0, []

    for member in members:
        if member in already_enrolled:
            skipped += 1
            continue

        if member not in user_map:
            failed.append(member)
            frappe.log_error(
                title=f"LMS Plus: member {member} not found or disabled",
                message=f"Course: {course}",
            )
            continue

        try:
            user = user_map[member]
            enrollment = frappe.get_doc({
                "doctype": "LMS Enrollment",
                "member": member,
                "member_name": user.full_name,
                "member_username": user.username,
                "member_image": user.user_image,
                "course": course,
                "member_type": "Student",
                "role": "Member",
            })
            enrollment.insert(ignore_permissions=True)
            success += 1
        except Exception:
            failed.append(member)
            frappe.log_error(
                title=f"LMS Plus: bulk course enrollment failed for {member} in {course}",
                message=frappe.get_traceback(),
            )

    frappe.db.commit()

    # Refresh LMS Course enrollment count
    try:
        from lms.lms.api import update_course_statistics
        update_course_statistics()
    except Exception:
        pass

    return {
        "success": success,
        "skipped": skipped,
        "failed": len(failed),
        "message": _(
            "{0} students enrolled. {1} already enrolled. {2} failed."
        ).format(success, skipped, len(failed)),
    }


@frappe.whitelist()
def bulk_remove_students(batch: str, members_json: str):
    """
    Whitelisted API — remove multiple students from a batch.
    The on_trash hook on LMS Batch Enrollment deletes their course
    enrollments automatically (Option A — progress deleted).
    """
    members = frappe.parse_json(members_json)

    if not isinstance(members, list) or not members:
        frappe.throw(_("Please provide a non-empty list of members."))

    if not frappe.db.exists("LMS Batch", batch):
        frappe.throw(_("Batch {0} not found.").format(batch))

    # Single query — find all batch enrollment records for these members
    enrollments = frappe.get_all(
        "LMS Batch Enrollment",
        filters={"batch": batch, "member": ["in", members]},
        fields=["name", "member"],
    )

    if not enrollments:
        return {
            "removed": 0,
            "message": _("None of the selected members were enrolled in this batch."),
        }

    removed, failed = 0, []

    for row in enrollments:
        try:
            frappe.delete_doc(
                "LMS Batch Enrollment",
                row.name,
                ignore_permissions=True,
                force=True,
            )
            removed += 1
        except Exception:
            failed.append(row.member)
            frappe.log_error(
                title=f"LMS Plus: failed to remove {row.member} from {batch}",
                message=frappe.get_traceback(),
            )

    frappe.db.commit()

    return {
        "removed": removed,
        "failed": len(failed),
        "message": _("{0} students removed from batch. {1} failed.").format(
            removed, len(failed)
        ),
    }


@frappe.whitelist()
def bulk_remove_from_course(course: str, members_json: str):
    """
    Whitelisted API — unenroll multiple students from a course directly.
    Deletes their LMS Enrollment records. Progress is lost (Option A).
    """
    members = frappe.parse_json(members_json)

    if not isinstance(members, list) or not members:
        frappe.throw(_("Please provide a non-empty list of members."))

    if not frappe.db.exists("LMS Course", course):
        frappe.throw(_("Course {0} not found.").format(course))

    enrollments = frappe.get_all(
        "LMS Enrollment",
        filters={"course": course, "member": ["in", members]},
        fields=["name", "member"],
    )

    if not enrollments:
        return {
            "removed": 0,
            "message": _("None of the selected members were enrolled in this course."),
        }

    removed, failed = 0, []

    for row in enrollments:
        try:
            frappe.delete_doc(
                "LMS Enrollment",
                row.name,
                ignore_permissions=True,
                force=True,
            )
            removed += 1
        except Exception:
            failed.append(row.member)
            frappe.log_error(
                title=f"LMS Plus: failed to remove {row.member} from {course}",
                message=frappe.get_traceback(),
            )

    frappe.db.commit()

    return {
        "removed": removed,
        "failed": len(failed),
        "message": _("{0} students removed from course. {1} failed.").format(
            removed, len(failed)
        ),
    }


@frappe.whitelist()
def save_video_position(lesson: str, course: str, position: float):
    """
    Saves the learner's current video position in seconds.
    Called every 5 seconds while the video is playing.
    """
    member = frappe.session.user

    existing = frappe.db.get_value(
        "LMS Course Progress",
        {"member": member, "lesson": lesson, "course": course},
        "name",
    )

    if existing:
        frappe.db.set_value(
            "LMS Course Progress",
            existing,
            "custom_video_position",
            frappe.utils.data.flt(position),
        )
    else:
        frappe.get_doc({
            "doctype": "LMS Course Progress",
            "member": member,
            "lesson": lesson,
            "course": course,
            "status": "Incomplete",
            "custom_video_position": frappe.utils.data.flt(position),
        }).insert(ignore_permissions=True)

    frappe.db.commit()
    return {"saved": True}


@frappe.whitelist()
def get_video_position(lesson: str, course: str):
    """
    Returns the learner's last saved video position in seconds.
    Called when the lesson page loads.
    """
    member = frappe.session.user

    position = frappe.db.get_value(
        "LMS Course Progress",
        {"member": member, "lesson": lesson, "course": course},
        "custom_video_position",
    )

    return {"position": frappe.utils.data.flt(position) or 0}


@frappe.whitelist(allow_guest=False)
def resolve_lesson_slug(course: str, slug: str):
    """
    Resolves a lesson URL slug (e.g. "1-1") to the actual Course Lesson name.
    Slug format: {chapter_position}-{lesson_position} (1-based).
    """
    parts = slug.split("-")
    if len(parts) != 2:
        return {"lesson": None}

    chapter_idx = frappe.utils.data.cint(parts[0]) - 1
    lesson_idx  = frappe.utils.data.cint(parts[1]) - 1

    chapters = frappe.get_all(
        "Course Chapter",
        filters={"course": course},
        fields=["name"],
        order_by="creation asc",
    )

    if chapter_idx < 0 or chapter_idx >= len(chapters):
        return {"lesson": None}

    lessons = frappe.get_all(
        "Course Lesson",
        filters={"chapter": chapters[chapter_idx].name, "course": course},
        fields=["name"],
        order_by="creation asc",
    )

    if lesson_idx < 0 or lesson_idx >= len(lessons):
        return {"lesson": None}

    return {"lesson": lessons[lesson_idx].name}
