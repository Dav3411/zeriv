-- campaign_v1_functions.sql
-- campaign_v1.sql 이후 적용.
-- reusable_assets.reused_count 원자적 증가 함수.

/**
 * increment_reused_count(p_asset_id uuid) → integer
 *
 * reused_count를 1 증가시키고 새 값을 반환.
 * SECURITY DEFINER: RLS를 우회하지 않음 — UPDATE는 reusable_assets RLS 적용.
 *
 * 호출: supabaseAdmin.rpc("increment_reused_count", { p_asset_id: assetId })
 */
create or replace function increment_reused_count(p_asset_id uuid)
returns integer
language plpgsql
security invoker
as $$
declare
  v_new_count integer;
begin
  update reusable_assets
  set reused_count = reused_count + 1
  where id = p_asset_id
  returning reused_count into v_new_count;

  if v_new_count is null then
    raise exception 'Asset not found: %', p_asset_id;
  end if;

  return v_new_count;
end;
$$;
