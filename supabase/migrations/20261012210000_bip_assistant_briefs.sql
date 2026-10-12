-- Social identities and assistant prompts belong to FlowSight, independently of
-- any publishing provider. FlowSight does not schedule or publish posts.
create table public.bip_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('linkedin','x','instagram')),
  name text not null check(length(name) between 1 and 100),
  handle text not null check(length(handle) between 1 and 150),
  style text not null,
  created_at timestamptz not null default now(),
  unique(user_id,id), unique(user_id,channel,handle)
);
create table public.bip_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  evidence_id uuid not null,
  profile_id uuid,
  channel text not null check(channel in ('linkedin','x','instagram')),
  style text not null,
  prompt text not null check(length(prompt) between 1 and 14000),
  revision integer not null default 1,
  batch_key uuid not null,
  created_at timestamptz not null default now(),
  foreign key(user_id,evidence_id) references public.bip_evidence(user_id,id) on delete cascade,
  foreign key(user_id,profile_id) references public.bip_profiles(user_id,id) on delete set null (profile_id),
  unique(user_id,id), unique(user_id,batch_key,evidence_id,channel)
);
alter table public.bip_drafts add column brief_id uuid;
alter table public.bip_drafts add constraint bip_draft_brief_owner foreign key(user_id,brief_id) references public.bip_briefs(user_id,id) on delete set null (brief_id);
alter table public.bip_profiles enable row level security;
alter table public.bip_briefs enable row level security;
create policy bip_profiles_read on public.bip_profiles for select to authenticated using(auth.uid()=user_id);
create policy bip_briefs_read on public.bip_briefs for select to authenticated using(auth.uid()=user_id);
revoke all on public.bip_profiles, public.bip_briefs from anon,authenticated;
grant select on public.bip_profiles, public.bip_briefs to authenticated;
grant all on public.bip_profiles, public.bip_briefs to service_role;
