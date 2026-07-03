-- In-app account deletion (App Store guideline 5.1.1(v)).
-- SECURITY DEFINER runs as the migration owner (postgres), which may delete
-- from auth.users. All user-owned rows cascade: profiles, follows,
-- article_views (and GoTrue's identities/sessions/refresh_tokens).
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
