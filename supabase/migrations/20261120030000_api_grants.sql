-- Let signed-in students reach these tables through the Data API. Row-level
-- security (set up in the earlier migrations) still limits each student to
-- their own rows. Needed when "Grant API access to new tables automatically"
-- was left off when the project was created; harmless when it was on.
grant select, insert, update, delete on public.student_data to authenticated;
grant select on public.uploads to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.shared_syllabi to authenticated;

-- Nobody signed out can touch them, and reminder_log is server-only.
revoke all on public.student_data, public.uploads, public.push_subscriptions, public.shared_syllabi, public.shared_syllabus_reports, public.reminder_log from anon;
revoke all on public.reminder_log, public.shared_syllabus_reports from authenticated;
