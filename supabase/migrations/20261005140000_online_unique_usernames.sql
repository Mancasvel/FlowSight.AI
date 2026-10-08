-- Global usernames for online leagues. Uniqueness is enforced in the database,
-- including concurrent requests and case variants. Withdrawal releases the name.
alter table public.online_league_consent alter column alias drop default;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='online_username_format' and conrelid='public.online_league_consent'::regclass) then
    alter table public.online_league_consent add constraint online_username_format check (alias ~ '^[a-z0-9][a-z0-9_.]{2,19}$');
  end if;
end; $$;
create unique index if not exists online_league_username_unique on public.online_league_consent(lower(alias));

create or replace function public.online_leagues_service(p_request jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  uid uuid := auth.uid();
  action text := p_request->>'action';
  today date := (now() at time zone 'Europe/Madrid')::date;
  week_start date := date_trunc('week',now() at time zone 'Europe/Madrid')::date;
  consent public.online_league_consent%rowtype;
  gid uuid;
  did uuid;
  alias_value text;
  token text;
  new_minutes integer;
  groups_json jsonb;
  allowed text[];
begin
  if uid is null then raise exception 'Sign in to use online leagues'; end if;
  if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>4096 then
    raise exception 'Invalid league request';
  end if;
  allowed := case action
    when 'status' then array['action']
    when 'accept' then array['action','device_id','alias','notice_version']
    when 'withdraw' then array['action']
    when 'submit' then array['action','device_id','day','eligible_minutes','scoring_version','evidence_profile','receipt_id']
    when 'create' then array['action','name']
    when 'invite' then array['action','group_id']
    when 'join' then array['action','code']
    when 'leave' then array['action','group_id']
    when 'export' then array['action']
    else null end;
  if allowed is null or exists(select 1 from jsonb_object_keys(p_request) k where not(k=any(allowed))) then
    raise exception 'Unsupported league fields';
  end if;
  -- Serialize each account's actions, including consent/revocation/publication.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,105));
  delete from public.online_focus_day where day<today-35;
  delete from public.online_friend_invites where expires_at<=now();
  select * into consent from public.online_league_consent where user_id=uid;
  if action='accept' then
    if p_request->>'notice_version' is distinct from 'leagues-2026-10-05' then
      raise exception 'Accept the current league notice';
    end if;
    did := (p_request->>'device_id')::uuid;
    alias_value := lower(btrim(p_request->>'alias'));
    if did is null or alias_value is null or alias_value !~ '^[a-z0-9][a-z0-9_.]{2,19}$' then
      raise exception 'Use 3 to 20 letters, numbers, dots or underscores for your username';
    end if;
    if consent.enabled and consent.device_id is distinct from did then
      raise exception 'Another device is scoring. Disable leagues on that device first';
    end if;
    begin
    insert into public.online_league_consent(user_id,enabled,device_id,alias,accepted_at)
      values(uid,true,did,alias_value,now())
      on conflict(user_id) do update set enabled=true,device_id=excluded.device_id,alias=excluded.alias,
        notice_version='leagues-2026-10-05',
        accepted_at=case when online_league_consent.enabled then online_league_consent.accepted_at else now() end,
        updated_at=now();
    exception when unique_violation then
      raise exception 'Username already taken. Choose another';
    end;
  elsif action='withdraw' then
    delete from public.online_league_consent where user_id=uid;
    delete from public.online_focus_day where user_id=uid;
    delete from public.online_friend_groups where owner_id=uid;
    delete from public.online_friend_members where user_id=uid;
  elsif action in ('submit','create','invite','join','leave') then
    if consent.enabled is distinct from true or consent.notice_version<>'leagues-2026-10-05' then
      raise exception 'Accept the online league service first';
    end if;
    if action='submit' then
      did := (p_request->>'device_id')::uuid;
      if did is distinct from consent.device_id then raise exception 'Scoring device does not match'; end if;
      if (p_request->>'day')::date is distinct from today then raise exception 'Only today can be published'; end if;
      if p_request->>'scoring_version' is distinct from 'friends-v1' or
         p_request->>'evidence_profile' is distinct from 'windows-observed-v1' then
        raise exception 'Unsupported scoring rules or evidence profile';
      end if;
      if jsonb_typeof(p_request->'eligible_minutes')<>'number' or
         (p_request->>'eligible_minutes') !~ '^(0|[1-9][0-9]*)$' then raise exception 'Invalid minutes'; end if;
      new_minutes := (p_request->>'eligible_minutes')::integer;
      if new_minutes<>0 and new_minutes not between 25 and 75 then raise exception 'Invalid minute limit'; end if;
      insert into public.online_focus_day(user_id,day,eligible_minutes,scoring_version,evidence_profile,device_id,receipt_id)
        values(uid,today,new_minutes,'friends-v1','windows-observed-v1',did,(p_request->>'receipt_id')::uuid)
        on conflict(user_id,day) do update set
          eligible_minutes=greatest(online_focus_day.eligible_minutes,excluded.eligible_minutes),
          receipt_id=excluded.receipt_id,updated_at=now();
    elsif action='create' then
      if (select count(*) from public.online_friend_groups where owner_id=uid)>=5 then raise exception 'Group limit reached'; end if;
      insert into public.online_friend_groups(owner_id,name) values(uid,btrim(p_request->>'name')) returning id into gid;
      insert into public.online_friend_members(group_id,user_id) values(gid,uid);
      token := replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
      insert into public.online_friend_invites(token_hash,group_id) values(encode(sha256(convert_to(token,'UTF8')),'hex'),gid);
    elsif action='invite' then
      gid := (p_request->>'group_id')::uuid;
      if not exists(select 1 from public.online_friend_groups where id=gid and owner_id=uid) then raise exception 'Only the group owner can invite'; end if;
      delete from public.online_friend_invites where group_id=gid;
      token := replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
      insert into public.online_friend_invites(token_hash,group_id) values(encode(sha256(convert_to(token,'UTF8')),'hex'),gid);
    elsif action='join' then
      token := btrim(p_request->>'code');
      if token is null or token !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation code'; end if;
      select group_id into gid from public.online_friend_invites where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') and expires_at>now();
      if gid is null then raise exception 'Invitation expired or unavailable'; end if;
      perform 1 from public.online_friend_groups where id=gid for update;
      if not exists(select 1 from public.online_friend_members where group_id=gid and user_id=uid) then
        if (select count(*) from public.online_friend_members where group_id=gid)>=8 then raise exception 'This group already has 8 friends'; end if;
        if (select count(*) from public.online_friend_members where user_id=uid)>=8 then raise exception 'Membership limit reached'; end if;
        insert into public.online_friend_members(group_id,user_id) values(gid,uid);
      end if;
      token := null;
    elsif action='leave' then
      gid := (p_request->>'group_id')::uuid;
      if exists(select 1 from public.online_friend_groups where id=gid and owner_id=uid) then
        delete from public.online_friend_groups where id=gid and owner_id=uid;
      else
        delete from public.online_friend_members where group_id=gid and user_id=uid;
      end if;
    end if;
  elsif action='export' then
    return jsonb_build_object('consent',to_jsonb(consent),'days',coalesce((select jsonb_agg(to_jsonb(d)) from public.online_focus_day d where user_id=uid),'[]'::jsonb),
      'memberships',coalesce((select jsonb_agg(to_jsonb(m)) from public.online_friend_members m where user_id=uid),'[]'::jsonb));
  end if;
  select * into consent from public.online_league_consent where user_id=uid;
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'owner',g.owner_id=uid,'members',(
    select coalesce(jsonb_agg(jsonb_build_object('alias',ranked.alias,'participant_id',ranked.participant_id,
      'mine',ranked.user_id=uid,'points',ranked.points,'today_points',ranked.today_points,'rank',ranked.position)
      order by ranked.points desc,ranked.alias),'[]'::jsonb)
    from (
      select scores.*,rank() over(order by points desc) as position from (
        select m.participant_id,m.user_id,c.alias,
          coalesce((select sum(v.points) from (
            select public.online_focus_points(d.eligible_minutes) as points from public.online_focus_day d
            where d.user_id=m.user_id and d.day>=week_start and d.day<=today
              and d.day>=(m.joined_at at time zone 'Europe/Madrid')::date
            order by points desc limit 5) v),0) as points,
          coalesce((select public.online_focus_points(d.eligible_minutes) from public.online_focus_day d where d.user_id=m.user_id and d.day=today),0) as today_points
        from public.online_friend_members m join public.online_league_consent c on c.user_id=m.user_id and c.enabled
        where m.group_id=g.id
      ) scores
    ) ranked
  )) order by g.created_at),'[]'::jsonb) into groups_json
  from public.online_friend_groups g
  where exists(select 1 from public.online_friend_members mine where mine.group_id=g.id and mine.user_id=uid);
  return jsonb_build_object('enabled',coalesce(consent.enabled,false),'notice_version','leagues-2026-10-05',
    'alias',consent.alias,'accepted_at',consent.accepted_at,'device_id',consent.device_id,'day',today,'week_start',week_start,
    'today_points',coalesce((select public.online_focus_points(eligible_minutes) from public.online_focus_day where user_id=uid and day=today),0),
    'groups',groups_json,'invitation_code',token);
end;
$$;
revoke all on function public.online_leagues_service(jsonb) from public,anon;
grant execute on function public.online_leagues_service(jsonb) to authenticated;
notify pgrst,'reload schema';
