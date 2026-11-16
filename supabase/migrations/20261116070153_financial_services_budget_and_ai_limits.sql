create table if not exists public.financial_ai_usage (
  id text primary key check (id = 'decision-guide'),
  total bigint not null default 0 check (total >= 0),
  usage_day date not null,
  daily bigint not null default 0 check (daily >= 0),
  updated_at timestamptz not null default now()
);

alter table public.financial_ai_usage enable row level security;
revoke all on table public.financial_ai_usage from anon, authenticated;
grant select, insert, update, delete on table public.financial_ai_usage to service_role;

create or replace function public.reserve_financial_ai_usage(
  p_daily_limit bigint,
  p_total_limit bigint
)
returns table (allowed boolean, error text, retry_after integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_row_day date;
  v_total bigint;
  v_daily bigint;
  v_retry integer;
begin
  if p_daily_limit < 0 or p_total_limit < 0 then
    raise exception 'usage limits must be non-negative';
  end if;

  insert into public.financial_ai_usage (id, total, usage_day, daily)
  values ('decision-guide', 0, v_day, 0)
  on conflict (id) do nothing;

  select u.usage_day, u.total, u.daily
    into v_row_day, v_total, v_daily
    from public.financial_ai_usage as u
    where u.id = 'decision-guide'
    for update;

  if v_row_day <> v_day then
    v_daily := 0;
    update public.financial_ai_usage as u
      set usage_day = v_day, daily = 0, updated_at = now()
      where u.id = 'decision-guide';
  end if;

  if v_total >= p_total_limit then
    return query select false, 'USAGE_LIMIT_REACHED'::text, null::integer;
    return;
  end if;

  if v_daily >= p_daily_limit then
    v_retry := greatest(
      1,
      ceil(extract(epoch from (((v_day + 1)::timestamp at time zone 'UTC') - now())))::integer
    );
    return query select false, 'DAILY_LIMIT_REACHED'::text, v_retry;
    return;
  end if;

  update public.financial_ai_usage as u
    set total = v_total + 1, daily = v_daily + 1, updated_at = now()
    where u.id = 'decision-guide';

  return query select true, null::text, null::integer;
end;
$$;

revoke all on function public.reserve_financial_ai_usage(bigint, bigint) from public, anon, authenticated;
grant execute on function public.reserve_financial_ai_usage(bigint, bigint) to service_role;
