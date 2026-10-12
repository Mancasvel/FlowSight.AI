-- Revising the underlying facts also requires a fresh human review of drafts.
create function public.bip_evidence_invalidate_drafts() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.title is distinct from old.title or new.summary is distinct from old.summary or new.confirmed is distinct from old.confirmed then
    update public.bip_drafts set state='draft', revision=revision+1,
      approved_revision=null, approved_at=null
    where user_id=new.user_id and evidence_id=new.id and state in ('draft','approved','failed');
  end if;
  return new;
end;
$$;
create trigger bip_evidence_revision after update on public.bip_evidence
for each row execute function public.bip_evidence_invalidate_drafts();
