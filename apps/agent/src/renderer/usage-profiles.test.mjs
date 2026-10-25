import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveUsageProfile, profileAllowsTab, profileChoice } from './usage-profiles.mjs';

const teams = [{ id: 'company-a', name: 'Company A', manager: false }, { id: 'company-b', name: 'Company B', manager: true }];
const entitlement = (id = 'team_employee', extra = {}) => ({ owner_user_id: 'worker-a', status: 'active', usage_profile: {
  id, verified: true, team_id: id === 'team_manager' ? 'company-b' : 'company-a', license_plan_id: 'team_simple', teams,
  capabilities: { online: true, focus_alerts: true, personal_insights: true, team_dashboard: true },
  available_profiles: ['team_employee', 'team_manager'], ...extra,
} });
const resolve = value => resolveUsageProfile(value, { accountId: 'worker-a' });

test('a local guest retains individual tools without a fabricated licensed manager role', () => {
  const profile = resolveUsageProfile(null);
  assert.equal(profile.id, 'individual'); assert.equal(profile.guest, true);
  assert.equal(profileAllowsTab(profile, 'tabSummary'), true); assert.equal(profileAllowsTab(profile, 'tabOnline'), true);
  assert.equal(profileChoice(profile, 'team_manager'), null);
  assert.deepEqual(profileChoice(profile, 'individual'), { mode: 'local', teamId: null });
});

test('unverified and different-account caches keep signed-in users in the simple safe recorder', () => {
  for (const value of [null, { ...entitlement(), owner_user_id: 'other-worker' }, entitlement('team_manager', { verified: false }), { plan: 'enterprise', status: 'active', can_sync: true }]) {
    const profile = resolve(value);
    assert.equal(profile.id, 'team_employee'); assert.equal(profile.verified, false);
    assert.equal(profileAllowsTab(profile, 'tabToday'), true); assert.equal(profileAllowsTab(profile, 'tabProfile'), true);
    assert.equal(profileAllowsTab(profile, 'tabOnline'), false); assert.equal(profileAllowsTab(profile, 'tabSummary'), false);
    assert.equal(profileChoice(profile, 'individual'), null); assert.equal(profile.capabilities.team_dashboard, false);
  }
  assert.equal(resolveUsageProfile(entitlement(), { accountId: 'worker-a', hydrated: false }).verified, false);
});

test('a named licensed employee team cannot enable personal analysis or manager analytics through broad legacy flags', () => {
  const profile = resolve(entitlement());
  assert.equal(profile.verified, true); assert.equal(profile.team_name, 'Company A');
  assert.deepEqual(profile.capabilities, { online: false, focus_alerts: false, personal_insights: false, team_dashboard: false });
  for (const tab of ['tabOnline', 'tabSummary', 'tabCloudInsights', 'undefined', 'constructor']) assert.equal(profileAllowsTab(profile, tab), false);
});

test('manager access requires the verified manager role for the selected named workspace', () => {
  assert.equal(resolve(entitlement('team_manager')).capabilities.team_dashboard, true);
  assert.equal(resolve(entitlement('team_manager', { team_id: 'company-a' })).verified, false);
  assert.equal(resolve(entitlement('team_manager', { teams: [] })).verified, false);
  assert.equal(resolve(entitlement('team_manager', { capabilities: { team_dashboard: false } })).capabilities.team_dashboard, false);
});

test('the server-authorized team choice sends a mode and matching team, never an invented role', () => {
  const employee = resolve(entitlement('team_employee', { teams: teams.slice(0, 1), available_profiles: ['team_employee'] }));
  assert.equal(profileChoice(employee, 'team_manager'), null); assert.equal(profileChoice(employee, 'individual'), null);
  assert.deepEqual(profileChoice(employee, 'team_employee'), { mode: 'team', teamId: 'company-a' });
  const multi = resolve(entitlement());
  assert.deepEqual(profileChoice(multi, 'team_manager', 'company-b'), { mode: 'team', teamId: 'company-b' });
  assert.deepEqual(profileChoice(multi, 'team_employee', 'company-b'), { mode: 'team', teamId: 'company-a' });
  assert.equal(profileChoice(multi, 'owner'), null);
});

test('an authorized individual profile restores only its native capabilities and remains separate from team destination', () => {
  const profile = resolve(entitlement('individual', { available_profiles: ['individual', 'team_employee'], capabilities: { online: true, personal_insights: true, focus_alerts: false, team_dashboard: false } }));
  assert.equal(profile.team_id, null); assert.equal(profile.team_name, null);
  assert.equal(profileAllowsTab(profile, 'tabOnline'), true); assert.equal(profileAllowsTab(profile, 'tabSummary'), true);
  assert.equal(profile.capabilities.focus_alerts, false);
  assert.deepEqual(profileChoice(profile, 'individual'), { mode: 'individual', teamId: null });
});
