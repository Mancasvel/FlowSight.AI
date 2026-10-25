-- Desktop modes describe recording; manager permissions remain in the web
-- dashboard's verified ownership/membership checks. No consent is changed.
update public.flowsight_license_profile_rules set owner_profile='individual'
 where owner_profile='team_manager';

create or replace function public.resolve_flowsight_usage_profile()
returns jsonb language plpgsql stable security definer set search_path='' as $$
<<profile_context>>
declare
 uid uuid:=auth.uid(); pref public.flowsight_usage_profiles; chosen record;
 solo record; preset text:='individual'; plan_key text; team_id uuid;
 available jsonb:='["individual"]'; team_choices jsonb:='[]'; project_keys jsonb:='[]';
begin
 if uid is null then return jsonb_build_object('id','individual','capabilities',(select capabilities from public.flowsight_profile_presets where id='individual'),'available_profiles',available,'teams',team_choices); end if;
 select * into pref from public.flowsight_usage_profiles where user_id=uid;
 select l.* into solo from public.licenses l where l.owner_id=uid and coalesce(l.is_active,true)
  and (l.starts_at is null or l.starts_at<=now()) and (l.expires_at is null or l.expires_at>now())
  and (l.plan_id='individual_pro' or (l.plan_id is null and l.max_members<=1))
  order by l.claimed_at desc nulls last,l.id limit 1;
 -- Only an employee's active licensed membership selects the work recorder.
 select t.id,t.name,l.plan_id into chosen from public.teams t
  join public.licenses l on l.id=t.license_id
  join public.team_members m on m.team_id=t.id and m.user_id=uid
  where coalesce(t.is_active,true) and not coalesce(t.is_personal,false)
   and coalesce(l.is_active,true) and (l.starts_at is null or l.starts_at<=now())
   and (l.expires_at is null or l.expires_at>now()) and t.owner_id<>uid and coalesce(m.role,'member')<>'admin'
   and (l.plan_id in ('teams_simple','teams_pro','enterprise') or (l.plan_id is null and l.max_members>1))
  order by (t.id=pref.team_id) desc nulls last,t.created_at,t.id limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'manager',t.owner_id=uid or coalesce(m.role='admin',false)) order by t.name,t.id),'[]')
  into team_choices from public.teams t join public.licenses l on l.id=t.license_id
  left join public.team_members m on m.team_id=t.id and m.user_id=uid
  where coalesce(t.is_active,true) and not coalesce(t.is_personal,false) and coalesce(l.is_active,true)
   and (l.starts_at is null or l.starts_at<=now()) and (l.expires_at is null or l.expires_at>now())
   and (m.user_id=uid or t.owner_id=uid)
   and (l.plan_id in ('teams_simple','teams_pro','enterprise') or (l.plan_id is null and l.max_members>1));
 if chosen.id is not null then
  preset:='team_employee'; team_id:=chosen.id; plan_key:=coalesce(chosen.plan_id,'teams_pro');
  available:='["team_employee"]';
  if solo.id is not null then available:=available||'["individual"]'::jsonb; end if;
  if pref.preferred_mode='individual' and solo.id is not null then preset:='individual';team_id:=null; end if;
 end if;
 if preset='individual' then
  -- Owning a Team license does not grant personal cloud access or route
  -- personal activity into the company workspace.
  plan_key:=case when solo.id is not null then 'individual_pro' end;
  select t.id into team_id from public.teams t join public.licenses l on l.id=t.license_id
   where t.owner_id=uid and t.is_personal and coalesce(t.is_active,true) and coalesce(l.is_active,true)
   and (l.starts_at is null or l.starts_at<=now()) and (l.expires_at is null or l.expires_at>now())
   and (l.plan_id='individual_pro' or (l.plan_id is null and l.max_members<=1))
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

-- Refresh the stored preset only; keep each account's deliberate preference.
do $$ declare person record; previous_claim text:=current_setting('request.jwt.claim.sub',true);
begin
 for person in select id from public.profiles loop
  perform set_config('request.jwt.claim.sub',person.id::text,true);
  perform public.get_user_entitlements();
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(previous_claim,''),true);
end $$;
