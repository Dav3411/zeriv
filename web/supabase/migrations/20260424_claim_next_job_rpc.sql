create or replace function public.claim_next_job(p_source text)
returns setof jobs
language sql
security definer
set search_path = public
as $$
  update public.jobs
  set status = 'processing',
      started_at = now(),
      updated_at = now(),
      progress = 5
  where id = (
    select id from public.jobs
    where status = 'queued'
      and source = p_source
    order by priority desc, created_at asc
    limit 1
    for update skip locked
  )
  returning *;
$$;

revoke execute on function public.claim_next_job(text) from public;
revoke execute on function public.claim_next_job(text) from authenticated;
revoke execute on function public.claim_next_job(text) from anon;
grant execute on function public.claim_next_job(text) to service_role;
