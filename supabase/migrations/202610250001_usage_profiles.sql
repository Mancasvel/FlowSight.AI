-- License and verified team membership determine the desktop experience.
-- Profile activation never acknowledges a notice or enables activity sharing.
create table public.flowsight_profile_presets (
  id text primary key check (id in ('individual','team_employee','team_manager')),
  capabilities jsonb not null
);
insert into public.flowsight_profile_presets values
 ('individual','{"online":true,"focus_alerts":true,"personal_insights":true,"team_dashboard":false}'),
 ('team_employee','{"online":false,"focus_alerts":false,"personal_insights":false,"team_dashboard":false}'),
 ('team_manager','{"online":false,"focus_alerts":false,"personal_insights":false,"team_dashboard":true}');
create table public.flowsight_license_profile_rules (
  plan_id text primary key,
  member_profile text not null references public.flowsight_profile_presets,
  owner_profile text not null references public.flowsight_profile_presets,
  cloud_ai boolean not null, integrations boolean not null
);
insert into public.flowsight_license_profile_rules values
 ('individual_pro','individual','individual',true,true),
 ('teams_simple','team_employee','team_manager',true,false),
 ('teams_pro','team_employee','team_manager',true,true),
 ('enterprise','team_employee','team_manager',true,true);
create table public.flowsight_usage_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preferred_mode text not null default 'auto' check (preferred_mode in ('auto','individual','team')),
  team_id uuid references public.teams(id) on delete set null,
  preset_id text not null default 'individual' references public.flowsight_profile_presets,
  updated_at timestamptz not null default now()
);
alter table public.flowsight_profile_presets enable row level security;
alter table public.flowsight_license_profile_rules enable row level security;
alter table public.flowsight_usage_profiles enable row level security;
create policy profile_presets_read on public.flowsight_profile_presets for select to authenticated using (true);
create policy license_profile_rules_read on public.flowsight_license_profile_rules for select to authenticated using (true);
create policy usage_profile_read on public.flowsight_usage_profiles for select to authenticated using (user_id=auth.uid());
revoke all on public.flowsight_profile_presets,public.flowsight_license_profile_rules,public.flowsight_usage_profiles from public,anon,authenticated;
grant select on public.flowsight_profile_presets,public.flowsight_license_profile_rules,public.flowsight_usage_profiles to authenticated;

create function public.resolve_flowsight_usage_profile()
returns jsonb language plpgsql stable security definer set search_path='' as $$
<<profile_context>>
declare
 uid uuid:=auth.uid(); pref public.flowsight_usage_profiles; chosen record;
 solo record; owned_team record; expired_team record; preset text:='individual'; plan_key text;
 team_id uuid; manager boolean:=false; available jsonb:='[]'; team_choices jsonb:='[]'; project_keys jsonb:='[]';
begin
 if uid is null then return jsonb_build_object('id','individual','capabilities',(select capabilities from public.flowsight_profile_presets where id='individual'),'available_profiles',jsonb_build_array('individual'),'teams','[]'::jsonb); end if;
 select * into pref from public.flowsight_usage_profiles where user_id=uid;
 select l.* into solo from public.licenses l where l.owner_id=uid and coalesce(l.is_active,true)
  and (l.starts_at is null or l.starts_at<=now())
  and (l.expires_at is null or l.expires_at>now()) and (l.plan_id='individual_pro' or (l.plan_id is null and l.max_members<=1))
  order by l.claimed_at desc nulls last,l.id limit 1;
 select t.id,t.name,t.owner_id,l.plan_id,l.max_members,l.expires_at,m.role into chosen
  from public.teams t join public.licenses l on l.id=t.license_id
  left join public.team_members m on m.team_id=t.id and m.user_id=uid
  where coalesce(t.is_active,true) and not coalesce(t.is_personal,false)
   and coalesce(l.is_active,true) and (l.starts_at is null or l.starts_at<=now()) and (l.expires_at is null or l.expires_at>now())
   and (m.user_id=uid or t.owner_id=uid)
   and (l.plan_id in ('teams_simple','teams_pro','enterprise') or (l.plan_id is null and l.max_members>1))
  order by (t.id=pref.team_id) desc nulls last,(t.owner_id=uid) desc,t.created_at,t.id limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'manager',t.owner_id=uid or m.role='admin') order by t.name,t.id),'[]')
  into team_choices from public.teams t join public.licenses l on l.id=t.license_id
  left join public.team_members m on m.team_id=t.id and m.user_id=uid
  where coalesce(t.is_active,true) and not coalesce(t.is_personal,false) and coalesce(l.is_active,true)
   and (l.starts_at is null or l.starts_at<=now())
   and (l.expires_at is null or l.expires_at>now()) and (m.user_id=uid or t.owner_id=uid)
   and (l.plan_id in ('teams_simple','teams_pro','enterprise') or (l.plan_id is null and l.max_members>1));
 if chosen.id is not null then
  manager:=chosen.owner_id=uid or coalesce(chosen.role='admin',false);
  preset:=case when manager then 'team_manager' else 'team_employee' end;
  team_id:=chosen.id; plan_key:=coalesce(chosen.plan_id,'teams_pro');
  available:=jsonb_build_array(preset);
  if solo.id is not null then available:=available||jsonb_build_array('individual'); end if;
  if pref.preferred_mode='individual' and solo.id is not null then preset:='individual';team_id:=null;plan_key:='individual_pro';end if;
 else
  select t.id,t.owner_id,m.role into expired_team from public.teams t
   left join public.team_members m on m.team_id=t.id and m.user_id=uid
   where coalesce(t.is_active,true) and not coalesce(t.is_personal,false) and (m.user_id=uid or t.owner_id=uid)
   order by (t.id=pref.team_id) desc nulls last,t.created_at,t.id limit 1;
  select l.* into owned_team from public.licenses l where l.owner_id=uid and coalesce(l.is_active,true)
   and (l.starts_at is null or l.starts_at<=now())
   and (l.expires_at is null or l.expires_at>now()) and (l.plan_id in ('teams_simple','teams_pro','enterprise') or (l.plan_id is null and l.max_members>1))
   order by l.claimed_at desc nulls last,l.id limit 1;
  if owned_team.id is not null and not (pref.preferred_mode='individual' and solo.id is not null) then
   preset:='team_manager';manager:=true;plan_key:=coalesce(owned_team.plan_id,'teams_pro');available:=jsonb_build_array(preset);
   if solo.id is not null then available:=available||jsonb_build_array('individual');end if;
  elsif expired_team.id is not null and not (pref.preferred_mode='individual' and solo.id is not null) then
   preset:=case when expired_team.owner_id=uid or expired_team.role='admin' then 'team_manager' else 'team_employee' end;
   team_id:=expired_team.id;available:=jsonb_build_array(preset);plan_key:=null;
  else
   plan_key:=case when solo.id is not null then 'individual_pro' end;available:=jsonb_build_array('individual');
  end if;
 end if;
 if preset='individual' then
  select t.id into team_id from public.teams t join public.licenses l on l.id=t.license_id
   where t.owner_id=uid and t.is_personal and coalesce(t.is_active,true) and coalesce(l.is_active,true)
   and (l.starts_at is null or l.starts_at<=now())
   and (l.expires_at is null or l.expires_at>now()) and (l.plan_id='individual_pro' or (l.plan_id is null and l.max_members<=1))
   order by t.created_at,t.id limit 1;
 end if;
 if team_id is not null then
  select coalesce(jsonb_agg(distinct project_key),'[]') into project_keys from (
   select t.jira_project_key as project_key from public.teams t where t.id=profile_context.team_id and t.jira_project_key is not null
   union select s.jira_project_key from public.ticket_snapshots s where s.team_id=profile_context.team_id and s.jira_project_key is not null
  ) keys;
 end if;
 return jsonb_build_object('id',preset,'license_plan_id',plan_key,'team_id',team_id,'allowed_project_keys',project_keys,
  'capabilities',(select capabilities from public.flowsight_profile_presets where id=preset),
  'available_profiles',available,'teams',team_choices,'verified',true);
end $$;
revoke all on function public.resolve_flowsight_usage_profile() from public,anon;
grant execute on function public.resolve_flowsight_usage_profile() to authenticated;

create or replace function public.get_user_entitlements()
returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb:=public.resolve_flowsight_usage_profile(); rule public.flowsight_license_profile_rules;
 uid uuid:=auth.uid(); active boolean; team_ids jsonb;
begin
 select * into rule from public.flowsight_license_profile_rules where plan_id=p->>'license_plan_id';
 active:=rule.plan_id is not null;
 team_ids:=case when p->>'id'='individual' then
  case when p->>'team_id' is null then '[]'::jsonb else jsonb_build_array(p->>'team_id') end
  else (select coalesce(jsonb_agg(x->>'id'),'[]') from jsonb_array_elements(p->'teams') x) end;
 if uid is not null then
  insert into public.flowsight_usage_profiles(user_id,preset_id) values(uid,p->>'id')
   on conflict(user_id) do update set preset_id=excluded.preset_id,updated_at=now();
 end if;
 return jsonb_build_object('plan',case when active then case when p->>'id'='individual' then 'individual' else 'team' end end,
  'status',case when active then 'active' else 'free' end,'team_ids',team_ids,'active_team_id',p->'team_id','usage_profile',p,
  'features',jsonb_build_object('sync',active,'cloud_ai',active and rule.cloud_ai and p->>'id'<>'team_employee',
   'integrations',active and rule.integrations and p->>'id'<>'team_employee'));
end $$;
revoke all on function public.get_user_entitlements() from public,anon;
grant execute on function public.get_user_entitlements() to authenticated;

create function public.set_flowsight_usage_profile(p_mode text,p_team_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); p jsonb;
begin
 if uid is null then raise exception 'Authentication required';end if;
 if p_mode not in ('individual','team','auto') or p_mode is null then raise exception 'Unknown FlowSight profile';end if;
 if p_team_id is not null and not exists(select 1 from jsonb_array_elements(public.resolve_flowsight_usage_profile()->'teams') t where t->>'id'=p_team_id::text) then raise exception 'Team access could not be verified';end if;
 insert into public.flowsight_usage_profiles(user_id,preferred_mode,team_id) values(uid,p_mode,p_team_id)
  on conflict(user_id) do update set preferred_mode=excluded.preferred_mode,team_id=excluded.team_id,updated_at=now();
 p:=public.resolve_flowsight_usage_profile();
 if p_mode='individual' and p->>'id'<>'individual' then raise exception 'An Individual license is required for this profile';end if;
 if p_mode='team' and p->>'id'='individual' then raise exception 'An active Team license or invitation is required';end if;
 return public.get_user_entitlements();
end $$;
revoke all on function public.set_flowsight_usage_profile(text,uuid) from public,anon;
grant execute on function public.set_flowsight_usage_profile(text,uuid) to authenticated;

-- A new member inherits the team license through a valid invitation. Requiring
-- a paid account before joining would make that first step impossible.
-- The existing seat-limit trigger uses unqualified names; give it a fixed path
-- so it also works when called by an RPC with an empty search_path.
alter function public.check_member_limit() set search_path = public, pg_temp;
create function public.join_flowsight_team(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); invite public.invitations; license public.licenses; seats integer; account_email text;
begin
 if uid is null then raise exception 'Sign in before joining a team';end if;
 if p_token is null or length(trim(p_token))<8 or length(p_token)>512 then raise exception 'Invalid invitation code';end if;
 select * into invite from public.invitations where token=trim(p_token) and used_at is null and expires_at>now() for update;
 if invite.id is null then raise exception 'Invitation expired or unavailable';end if;
 select email into account_email from auth.users where id=uid;
 if invite.email is not null and lower(trim(invite.email))<>lower(coalesce(account_email,'')) then raise exception 'This invitation was issued to another email address';end if;
 select l.* into license from public.teams t join public.licenses l on l.id=t.license_id
  where t.id=invite.team_id and coalesce(t.is_active,true) and not coalesce(t.is_personal,false)
   and coalesce(l.is_active,true) and (l.starts_at is null or l.starts_at<=now()) and (l.expires_at is null or l.expires_at>now())
   and (l.plan_id in ('teams_simple','teams_pro','enterprise') or (l.plan_id is null and l.max_members>1)) for update of t,l;
 if license.id is null then raise exception 'This team needs an active Team license';end if;
 select count(*) into seats from public.team_members where team_id=invite.team_id;
 if license.max_members>0 and seats>=license.max_members and not exists(select 1 from public.team_members where team_id=invite.team_id and user_id=uid) then raise exception 'This team has no available license seats';end if;
 insert into public.profiles(id,display_name,role) values(uid,coalesce(account_email,'Team member'),'worker') on conflict(id) do nothing;
 insert into public.team_members(team_id,user_id,role) values(invite.team_id,uid,'member') on conflict(team_id,user_id) do nothing;
 update public.invitations set used_at=now() where id=invite.id;
 insert into public.flowsight_usage_profiles(user_id,preferred_mode,team_id) values(uid,'team',invite.team_id)
  on conflict(user_id) do update set preferred_mode='team',team_id=excluded.team_id,updated_at=now();
 return jsonb_build_object('success',true,'team_id',invite.team_id,'entitlements',public.get_user_entitlements());
end $$;
revoke all on function public.join_flowsight_team(text) from public,anon;
grant execute on function public.join_flowsight_team(text) to authenticated;

-- Other-member activity is visible only to a verified owner or team admin.
-- Self access remains available for history/export, including after offboarding.
create function public.flowsight_can_manage_activity(p_team_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.teams t where t.id=p_team_id and coalesce(t.is_active,true)
  and (t.owner_id=auth.uid() or exists(select 1 from public.team_members m where m.team_id=t.id and m.user_id=auth.uid() and m.role='admin')));
$$;
revoke all on function public.flowsight_can_manage_activity(uuid) from public,anon;
grant execute on function public.flowsight_can_manage_activity(uuid) to authenticated;
create policy flowsight_activity_manager_read on public.work_sessions for select to authenticated using (public.flowsight_can_manage_activity(team_id));
create policy flowsight_activity_manager_read on public.activity_reports for select to authenticated using (public.flowsight_can_manage_activity(team_id));
create policy flowsight_activity_visibility on public.work_sessions as restrictive for select to authenticated using (user_id=auth.uid() or public.flowsight_can_manage_activity(team_id));
create policy flowsight_activity_visibility on public.activity_reports as restrictive for select to authenticated using (user_id=auth.uid() or public.flowsight_can_manage_activity(team_id));
create policy flowsight_activity_scope on public.work_sessions as restrictive for insert to authenticated with check (user_id=auth.uid() and team_id=(public.resolve_flowsight_usage_profile()->>'team_id')::uuid and public.resolve_flowsight_usage_profile()->>'license_plan_id' is not null);
create policy flowsight_activity_scope on public.activity_reports as restrictive for insert to authenticated with check (user_id=auth.uid() and team_id=(public.resolve_flowsight_usage_profile()->>'team_id')::uuid and public.resolve_flowsight_usage_profile()->>'license_plan_id' is not null);
-- Bound UPDATE independently of any current or future permissive policy. Neither
-- another user's row nor another team's row can be reassigned by a client.
create policy flowsight_activity_update_scope on public.work_sessions as restrictive for update to authenticated
 using (user_id=auth.uid() and team_id=(public.resolve_flowsight_usage_profile()->>'team_id')::uuid)
 with check (user_id=auth.uid() and team_id=(public.resolve_flowsight_usage_profile()->>'team_id')::uuid and public.resolve_flowsight_usage_profile()->>'license_plan_id' is not null);
create policy flowsight_activity_update_scope on public.activity_reports as restrictive for update to authenticated
 using (user_id=auth.uid() and team_id=(public.resolve_flowsight_usage_profile()->>'team_id')::uuid)
 with check (user_id=auth.uid() and team_id=(public.resolve_flowsight_usage_profile()->>'team_id')::uuid and public.resolve_flowsight_usage_profile()->>'license_plan_id' is not null);
-- Keep the original membership policy and narrow it to explicit assignments.
create policy flowsight_work_item_visibility on public.team_work_items as restrictive for select to authenticated
 using (public.flowsight_can_manage_activity(team_id) or owner_id=auth.uid() or recipient_id=auth.uid());

-- Future uploads from older agents are also minimized at the database boundary.
create function public.flowsight_team_categories(p_data jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb:='{}'; item record; bucket text; amount numeric;
begin
 if jsonb_typeof(p_data)<>'object' or p_data is null then return result;end if;
 for item in select * from jsonb_each(p_data) loop
  if jsonb_typeof(item.value)<>'number' then continue;end if;
  amount:=greatest(0,least((item.value::text)::numeric,86400));
  bucket:=case when lower(item.key) in ('meeting','meetings','clientcalls') then 'meetings'
   when lower(item.key) in ('coding','debugging','testing','devops','database','design','prototyping','uxdesign','writing','editing','contentcreation','copywriting','campaignmanagement','seo','documentation','deep_work','deep work','focus work','work') then 'work' else 'other' end;
  result:=jsonb_set(result,array[bucket],to_jsonb(coalesce((result->>bucket)::numeric,0)+amount));
 end loop;return result;
end $$;
create function public.flowsight_minimize_team_upload()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.teams where id=new.team_id and not coalesce(is_personal,false)) then
  if tg_table_name='work_sessions' then
   new.summary:='Shared work totals. Detailed activity stays on the device.';
   new.category_breakdown:=public.flowsight_team_categories(new.category_breakdown);
   new.jira_breakdown:=coalesce((select jsonb_object_agg(key,value) from jsonb_each(case when jsonb_typeof(new.jira_breakdown)='object' then new.jira_breakdown else '{}' end) where key~'^[A-Z][A-Z0-9_]+-[0-9]+$' and jsonb_typeof(value)='number' and (exists(select 1 from public.teams t where t.id=new.team_id and t.jira_project_key=split_part(key,'-',1)) or exists(select 1 from public.ticket_snapshots s where s.team_id=new.team_id and s.jira_project_key=split_part(key,'-',1)))),'{}');
  else
   new.description:='Shared work totals. Detailed activity stays on the device.';
   new.category:=case when lower(new.category) in ('meeting','meetings','clientcalls') then 'meetings'
    when lower(new.category) in ('coding','debugging','testing','devops','database','design','writing','documentation','work') then 'work' else 'other' end;
   if new.jira_ticket_id is not null and (new.jira_ticket_id!~'^[A-Z][A-Z0-9_]+-[0-9]+$' or not (exists(select 1 from public.teams t where t.id=new.team_id and t.jira_project_key=split_part(new.jira_ticket_id,'-',1)) or exists(select 1 from public.ticket_snapshots s where s.team_id=new.team_id and s.jira_project_key=split_part(new.jira_ticket_id,'-',1)))) then new.jira_ticket_id:=null;end if;
  end if;
 end if;return new;
end $$;
revoke all on function public.flowsight_minimize_team_upload() from public,anon,authenticated;
create trigger flowsight_minimize_work_session before insert or update on public.work_sessions for each row execute function public.flowsight_minimize_team_upload();
create trigger flowsight_minimize_activity_report before insert or update on public.activity_reports for each row execute function public.flowsight_minimize_team_upload();

-- Employee clients cannot activate social leagues by bypassing the renderer.
alter function public.online_leagues_service(jsonb) rename to online_leagues_individual_service;
revoke all on function public.online_leagues_individual_service(jsonb) from public,anon,authenticated;
create function public.online_leagues_service(p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if public.resolve_flowsight_usage_profile()->>'id'<>'individual' and coalesce(p_request->>'action','') not in ('withdraw','export') then
  raise exception 'Online leagues are available in the Individual profile';
 end if;
 return public.online_leagues_individual_service(p_request);
end $$;
revoke all on function public.online_leagues_service(jsonb) from public,anon;
grant execute on function public.online_leagues_service(jsonb) to authenticated;

-- Populate current assignments without changing choices or consent. Future
-- license activations refresh this row through get_user_entitlements.
do $$ declare person record; previous_claim text:=current_setting('request.jwt.claim.sub',true);
begin
 for person in select id from public.profiles loop
  perform set_config('request.jwt.claim.sub',person.id::text,true);
  perform public.get_user_entitlements();
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(previous_claim,''),true);
end $$;
