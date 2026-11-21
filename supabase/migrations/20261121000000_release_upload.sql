-- Gives back an upload that failed (the file couldn't be read), so it
-- doesn't count toward the student's limits. Removes their most recent
-- upload from the last 10 minutes.
create or replace function public.release_upload()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.uploads
  where id = (
    select id from public.uploads
    where user_id = auth.uid() and created_at > now() - interval '10 minutes'
    order by created_at desc limit 1
  );
end;
$$;

revoke all on function public.release_upload() from public, anon;
grant execute on function public.release_upload() to authenticated;
