-- Run after the migration within an outer BEGIN / ROLLBACK. Never retains fixtures.
insert into auth.users(id) values ('b1000000-0000-4000-8000-000000000001'),('b1000000-0000-4000-8000-000000000002');
insert into public.bip_settings(user_id) values ('b1000000-0000-4000-8000-000000000001'),('b1000000-0000-4000-8000-000000000002');
insert into public.bip_evidence(id,user_id,source_key,title,summary,occurred_on,kind,provenance,confirmed,state) values
('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','fixture-a','Synthetic A','A synthetic test observation',current_date,'progress','manual',true,'selected'),
('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','fixture-b','Synthetic B','Another synthetic observation',current_date,'progress','manual',true,'selected');
insert into public.bip_drafts(id,user_id,evidence_id,channel,body,engine) values
('b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','x','Synthetic draft','local');
do $$ begin
  begin
    insert into public.bip_drafts(user_id,evidence_id,channel,body,engine) values('b1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','x','Cross-owner draft','local');
    raise exception 'FAIL: cross-owner evidence accepted';
  exception when foreign_key_violation then null; end;
end $$;
update public.bip_drafts set state='approved',approved_revision=1 where id='b3000000-0000-4000-8000-000000000001';
update public.bip_drafts set body='Changed synthetic draft' where id='b3000000-0000-4000-8000-000000000001';
do $$ begin
  if not exists(select 1 from public.bip_drafts where id='b3000000-0000-4000-8000-000000000001' and revision=2 and state='draft' and approved_revision is null) then raise exception 'FAIL: editing did not invalidate approval';end if;
end $$;
update public.bip_drafts set state='approved',approved_revision=2 where id='b3000000-0000-4000-8000-000000000001';
update public.bip_drafts set state='sending' where id='b3000000-0000-4000-8000-000000000001' and state='approved';
do $$ declare affected integer;begin
  update public.bip_drafts set state='sending' where id='b3000000-0000-4000-8000-000000000001' and state='approved';get diagnostics affected=row_count;
  if affected<>0 then raise exception 'FAIL: duplicate publish claim';end if;
  begin
    update public.bip_drafts set body='Unauthorized change during send' where id='b3000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: submitted draft changed';
  exception when raise_exception then if SQLERRM='FAIL: submitted draft changed' then raise;end if;end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
do $$ begin
  if (select count(*) from public.bip_evidence)<>1 then raise exception 'FAIL: personal RLS isolation';end if;
  if (select count(*) from public.bip_drafts)<>1 then raise exception 'FAIL: draft RLS isolation';end if;
  begin
    update public.bip_drafts set state='published';raise exception 'FAIL: client can forge publication';
  exception when insufficient_privilege then null;end;
  begin
    perform * from public.bip_connections;raise exception 'FAIL: client can read Buffer credentials';
  exception when insufficient_privilege then null;end;
  begin
    perform * from public.bip_tokens;raise exception 'FAIL: client can read integration token hashes';
  exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: ownership, RLS, private credentials, revision invalidation and single publication claim' as result;
