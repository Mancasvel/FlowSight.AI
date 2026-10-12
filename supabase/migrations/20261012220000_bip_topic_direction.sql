-- Selection guidance and measured reasons accompany private content evidence.
alter table public.bip_settings add column topic_direction text not null default '' check(length(topic_direction) <= 1000);
alter table public.bip_evidence add column signals jsonb not null default '{}'::jsonb check(jsonb_typeof(signals)='object');
