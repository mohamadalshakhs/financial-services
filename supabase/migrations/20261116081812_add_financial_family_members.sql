create table public.financial_family_members (
  family_hash text not null check (family_hash ~ '^[0-9a-f]{64}$'),
  id uuid not null default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  constraint financial_family_members_pkey primary key (family_hash, id)
);

create unique index financial_family_members_family_name_lower_idx
  on public.financial_family_members (family_hash, lower(name));

alter table public.financial_family_members enable row level security;
revoke all on table public.financial_family_members from public, anon, authenticated;
grant select, insert on table public.financial_family_members to service_role;
