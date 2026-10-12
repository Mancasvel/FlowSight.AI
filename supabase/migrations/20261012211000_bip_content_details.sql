-- Rich assistant output can include a complete thread, reel script or slide plan.
alter table public.bip_drafts add column details text not null default '' check(length(details)<=20000);
