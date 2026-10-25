-- A license seat is one distinct person across its active workspaces. The owner
-- already occupies a seat; inserting their membership must not count them twice.
create or replace function public.get_license_member_count(p_license_id uuid)
returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from (
  select l.owner_id as user_id from public.licenses l where l.id=p_license_id and l.owner_id is not null
  union
  select m.user_id from public.teams t join public.team_members m on m.team_id=t.id
   where t.license_id=p_license_id and coalesce(t.is_active,true)
 ) people;
$$;

create or replace function public.check_member_limit()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_license_id uuid; v_maximum integer; v_owner_id uuid; v_current_count integer;
begin
 select t.license_id into v_license_id from public.teams t where t.id=new.team_id;
 select l.max_members,l.owner_id into v_maximum,v_owner_id from public.licenses l where l.id=v_license_id for update;
 if v_maximum is null or v_maximum<=0 or new.user_id=v_owner_id then return new;end if;
 if exists(select 1 from public.team_members m join public.teams t on t.id=m.team_id
   where t.license_id=v_license_id and coalesce(t.is_active,true) and m.user_id=new.user_id) then return new;end if;
 v_current_count:=public.get_license_member_count(v_license_id);
 if v_current_count>=v_maximum then raise exception 'License limit reached (% of %)',v_current_count,v_maximum;end if;
 return new;
end $$;

create or replace function public.ensure_personal_team()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); license public.licenses; personal_id uuid; display text; v_created boolean:=false;
begin
 if uid is null then raise exception 'Not authenticated';end if;
 select l.* into license from public.licenses l where l.owner_id=uid and coalesce(l.is_active,true)
  and (l.starts_at is null or l.starts_at<=now()) and (l.expires_at is null or l.expires_at>now())
  and (l.plan_id='individual_pro' or (l.plan_id is null and l.max_members<=1))
  order by l.claimed_at desc nulls last,l.created_at desc,l.id limit 1 for update;
 if license.id is null then raise exception 'An active Individual license is required';end if;
 select t.id into personal_id from public.teams t where t.owner_id=uid and t.is_personal and coalesce(t.is_active,true)
  and not exists(select 1 from public.team_members m where m.team_id=t.id and m.user_id<>uid)
  order by (t.license_id=license.id) desc,t.created_at,t.id limit 1;
 if personal_id is not null then
  update public.teams set license_id=license.id where id=personal_id and license_id is distinct from license.id;
 else
  v_created:=true;
  select coalesce(p.display_name,'Personal') into display from public.profiles p where p.id=uid;
  insert into public.teams(name,owner_id,license_id,is_personal,is_active)
   values(coalesce(display,'Personal')||' (Personal)',uid,license.id,true,true) returning id into personal_id;
 end if;
 insert into public.team_members(team_id,user_id,role) values(personal_id,uid,'admin')
  on conflict(team_id,user_id) do update set role='admin';
 return jsonb_build_object('team_id',personal_id,'created',v_created);
end $$;
