import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');

function harness() {
  const stored = {};
  const changes = [];
  const listeners = { addListener() {} };
  const chrome = {
    alarms: { create() {}, onAlarm: listeners },
    runtime: { onInstalled: listeners, onStartup: listeners, onMessage: listeners },
    storage: { local: {
      async get(names) {
        const keys = Array.isArray(names) ? names : [names];
        return Object.fromEntries(keys.filter((key) => key in stored).map((key) => [key, stored[key]]));
      },
      async set(value) { Object.assign(stored, value); },
    } },
    declarativeNetRequest: { async updateDynamicRules(change) { changes.push(change); } },
  };
  const context = { chrome, URL, crypto: webcrypto, fetch: async () => { throw new Error('offline'); },
    AbortSignal, console, setTimeout, clearTimeout };
  runInNewContext(`${source}\nglobalThis.__test = { ruleFor, runCommand, expireBlocks };`, context);
  return { ...context.__test, stored, changes };
}

test('a URL path block matches the chosen site and route only', () => {
  const { ruleFor } = harness();
  const rule = ruleFor('youtube.com/shorts', 10001);
  const pattern = new RegExp(rule.condition.regexFilter);
  assert.equal(pattern.test('https://www.youtube.com/shorts/abc'), true);
  assert.equal(pattern.test('https://youtube.com/watch?v=1'), false);
  assert.equal(pattern.test('https://notyoutube.com/shorts/abc'), false);
  assert.throws(() => ruleFor('file:///etc/passwd', 10002));
  assert.throws(() => ruleFor('https://evil.example/?secret=1', 10003));
});

test('temporary blocks can be removed and do not survive their expiry', async () => {
  const { runCommand, expireBlocks, stored, changes } = harness();
  const result = await runCommand('browser.block', { patterns: ['youtube.com/shorts'], duration_minutes: 1 });
  assert.deepEqual(Array.from(result.blocked), ['youtube.com/shorts']);
  assert.equal(stored.blocks.length, 1);
  assert.equal(changes[0].addRules[0].action.type, 'block');
  await runCommand('browser.unblock', { patterns: ['youtube.com/shorts'] });
  assert.equal(stored.blocks.length, 0);
  await runCommand('browser.block', { patterns: ['youtube.com'], duration_minutes: 1 });
  stored.blocks[0].expiresAt = Date.now() - 1;
  await expireBlocks();
  assert.equal(stored.blocks.length, 0);
  assert.equal(changes.at(-1).removeRuleIds.length, 1);
});
