import { assert, assertStringIncludes } from "jsr:@std/assert@1";
import { readFile } from "node:fs/promises";

const migrationPath = "supabase/migrations/20260824120000_mobile_devices_and_events.sql";

Deno.test("mobile migration uses user-scoped devices and idempotent events", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assertStringIncludes(sql, "create table if not exists public.devices");
  assertStringIncludes(sql, "create table if not exists public.mobile_activity_events");
  assertStringIncludes(sql, "unique (user_id, device_id, client_event_id)");
  assertStringIncludes(sql, "as restrictive for insert to authenticated");
  assertStringIncludes(sql, "public.cloud_sync_permitted(user_id)");
  assertStringIncludes(sql, "d.user_id = auth.uid()");
  assertStringIncludes(sql, "tm.user_id = auth.uid()");
  assert(!/grant\s+all\s+on\s+table\s+public\.(devices|mobile_activity_events)\s+to\s+authenticated/iu.test(sql));
});

Deno.test("shared timeline combines mobile events and desktop summaries", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assertStringIncludes(sql, "create or replace function public.get_activity_timeline");
  assertStringIncludes(sql, "from public.mobile_activity_events m");
  assertStringIncludes(sql, "from public.activity_reports a");
  assertStringIncludes(sql, "m.user_id = auth.uid()");
  assertStringIncludes(sql, "a.user_id = auth.uid()");
  assertStringIncludes(sql, "grant execute on function public.get_activity_timeline");
});

Deno.test("privacy and cloud insights include mobile activity", async () => {
  const [privacyPolicy, insightFunction] = await Promise.all([
    readFile("supabase/functions/_shared/privacy_policy.ts", "utf8"),
    readFile("supabase/functions/generate-insights/index.ts", "utf8"),
  ]);

  assertStringIncludes(privacyPolicy, 'table: "mobile_activity_events"');
  assertStringIncludes(privacyPolicy, 'table: "devices"');
  assertStringIncludes(insightFunction, '.from("mobile_activity_events")');
  assertStringIncludes(insightFunction, "mobileRows");
});
