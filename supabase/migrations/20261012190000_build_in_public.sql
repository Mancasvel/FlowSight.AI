-- Personal content studio. Service-only mutations enforce revision approval.
create table public.bip_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  project_name text not null default 'My project' check (length(project_name) between 1 and 100),
  locale text not null default 'es' check (locale in ('es','en')),
  timezone text not null default 'Europe/Madrid',
  cadence text not null default 'manual' check (cadence in ('manual','daily','weekly')),
  excluded_terms text[] not null default '{}',
  voice text not null default '' check (length(voice) <= 1500),
  last_collected_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.bip_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null check (length(source_key) between 1 and 160),
  title text not null check (length(title) between 1 and 160),
  summary text not null check (length(summary) between 1 and 2000),
  occurred_on date not null,
  kind text not null check (kind in ('progress','learning','decision','milestone')),
  provenance text not null check (provenance in ('local_activity','manual')),
  confirmed boolean not null default false,
  state text not null default 'suggested' check (state in ('suggested','selected','dismissed')),
  created_at timestamptz not null default now(),
  unique(user_id, source_key),
  unique(user_id, id)
);
create index bip_evidence_owner_date on public.bip_evidence(user_id, occurred_on desc);

create table public.bip_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  evidence_id uuid not null,
  channel text not null check (channel in ('linkedin','x','instagram')),
  body text not null check (length(body) between 1 and 5000),
  visual jsonb,
  image_path text,
  engine text not null check (engine in ('local','assistant','manual')),
  batch_key text,
  state text not null default 'draft' check (state in ('draft','approved','sending','scheduled','published','failed','uncertain')),
  revision integer not null default 1 check (revision > 0),
  approved_revision integer,
  approved_at timestamptz,
  provider_channel_id text,
  scheduled_at timestamptz,
  provider_post_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(user_id,evidence_id) references public.bip_evidence(user_id,id) on delete cascade,
  unique(user_id,batch_key,evidence_id,channel),
  check (state not in ('approved','sending','scheduled','published') or approved_revision = revision)
);
create index bip_drafts_owner_date on public.bip_drafts(user_id, created_at desc);

create table public.bip_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  prefix text not null,
  scope text not null check (scope in ('device','assistant')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index bip_tokens_owner on public.bip_tokens(user_id);

create table public.bip_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_key text not null,
  channels jsonb not null default '[]',
  connected_at timestamptz not null default now()
);

create table public.bip_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('collect','generate')),
  payload jsonb not null default '{}',
  state text not null default 'pending' check (state in ('pending','claimed','completed','failed')),
  claimed_by uuid references public.bip_tokens(id) on delete set null,
  claimed_until timestamptz,
  error text,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id,dedupe_key)
);
create index bip_jobs_pending on public.bip_jobs(user_id,state,created_at);

-- No browser client may write credentials, approve revisions or forge receipts.
-- The API authenticates with Supabase then scopes every service query by user_id.
alter table public.bip_settings enable row level security;
alter table public.bip_evidence enable row level security;
alter table public.bip_drafts enable row level security;
alter table public.bip_tokens enable row level security;
alter table public.bip_connections enable row level security;
alter table public.bip_jobs enable row level security;
create policy bip_settings_read on public.bip_settings for select to authenticated using (auth.uid() = user_id);
create policy bip_evidence_read on public.bip_evidence for select to authenticated using (auth.uid() = user_id);
create policy bip_drafts_read on public.bip_drafts for select to authenticated using (auth.uid() = user_id);
create policy bip_jobs_read on public.bip_jobs for select to authenticated using (auth.uid() = user_id);
revoke all on public.bip_tokens, public.bip_connections from anon, authenticated;
revoke insert, update, delete on public.bip_settings, public.bip_evidence, public.bip_drafts, public.bip_jobs from anon, authenticated;
grant select on public.bip_settings, public.bip_evidence, public.bip_drafts, public.bip_jobs to authenticated;
grant all on public.bip_settings, public.bip_evidence, public.bip_drafts, public.bip_tokens, public.bip_connections, public.bip_jobs to service_role;

-- Claim atomically: concurrent workers cannot consume the same job.
create function public.bip_claim_job(owner_id uuid, device_id uuid)
returns setof public.bip_jobs language sql security definer set search_path = '' as $$
  update public.bip_jobs set state='claimed', claimed_by=device_id, claimed_until=now()+interval '10 minutes'
  where id = (
    select id from public.bip_jobs
    where user_id=owner_id and (state='pending' or (state='claimed' and claimed_until < now()))
    order by created_at for update skip locked limit 1
  ) returning *;
$$;
revoke all on function public.bip_claim_job(uuid,uuid) from public, anon, authenticated;
grant execute on function public.bip_claim_job(uuid,uuid) to service_role;

-- Editing always invalidates approval, including future API callers.
create function public.bip_invalidate_approval() returns trigger language plpgsql set search_path='' as $$
begin
  if new.body is distinct from old.body or new.visual is distinct from old.visual or new.image_path is distinct from old.image_path or new.provider_channel_id is distinct from old.provider_channel_id or new.scheduled_at is distinct from old.scheduled_at then
    if old.state in ('sending','scheduled','published','uncertain') then
      raise exception 'This post has already been submitted; reconcile it before editing';
    end if;
    new.revision := old.revision + 1;
    new.approved_revision := null;
    new.approved_at := null;
    new.state := 'draft';
    if new.visual is distinct from old.visual then new.image_path := null; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger bip_drafts_revision before update on public.bip_drafts for each row execute function public.bip_invalidate_approval();

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('bip-media','bip-media',false,2097152,array['image/png']) on conflict(id) do nothing;
