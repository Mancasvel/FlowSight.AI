// The native app is the authority. The extension performs only commands that
// arrive through the loopback bridge after the user confirms them in FlowSight.
const POLL_ALARM = 'flowsight-poll';
let polling = false;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ruleFor(pattern, id) {
  if (typeof pattern !== 'string' || pattern.length > 240 || /\s/.test(pattern)) {
    throw new Error('Use a domain or HTTP(S) URL path without spaces.');
  }
  if (pattern.includes('://') && !/^https?:\/\//i.test(pattern)) {
    throw new Error('Only HTTP(S) domains and paths can be blocked.');
  }
  const url = new URL(/^https?:\/\//i.test(pattern) ? pattern : `https://${pattern}`);
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error('Only HTTP(S) domains and paths can be blocked.');
  }
  const host = escapeRegex(url.hostname);
  const includeSubdomains = !url.hostname.startsWith('www.');
  const domain = `${includeSubdomains ? '(?:[^/]+\\.)?' : ''}${host}`;
  const path = url.pathname === '/' ? '(?:[/?#]|$)'
    : `${escapeRegex(url.pathname)}${url.pathname.endsWith('/') ? '' : '(?:[/?#]|$)'}`;
  return {
    id,
    priority: 1,
    action: { type: 'block' },
    condition: { regexFilter: `^https?://${domain}(?::[0-9]+)?${path}`, resourceTypes: ['main_frame'] },
  };
}

async function expireBlocks() {
  const { blocks = [] } = await chrome.storage.local.get('blocks');
  const now = Date.now();
  const expired = blocks.filter((block) => block.expiresAt <= now);
  if (!expired.length) return;
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: expired.map((block) => block.id) });
  await chrome.storage.local.set({ blocks: blocks.filter((block) => block.expiresAt > now) });
}

async function releaseBlocksAfterDisconnect() {
  const { lastConnectedAt = 0, blocks = [] } = await chrome.storage.local.get(['lastConnectedAt', 'blocks']);
  if (!blocks.length || Date.now() - lastConnectedAt < 75000) return;
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: blocks.map((block) => block.id) });
  await chrome.storage.local.set({ blocks: [] });
}

async function runCommand(name, args) {
  if (name === 'browser.unblock_all') {
    const { blocks = [] } = await chrome.storage.local.get('blocks');
    if (blocks.length) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: blocks.map((block) => block.id) });
      await chrome.storage.local.set({ blocks: [] });
    }
    return { unblockedAll: true };
  }
  if (name === 'browser.list_tabs') {
    const tabs = await chrome.tabs.query({});
    const { closedTabs = [] } = await chrome.storage.local.get('closedTabs');
    return {
      tabs: tabs.filter((tab) => /^https?:\/\//i.test(tab.url || '')).map((tab) => ({
        id: tab.id, title: tab.title || '', url: tab.url, active: tab.active,
      })),
      restorable: closedTabs.map((tab) => ({ restoreId: tab.restoreId, title: tab.title, url: tab.url })),
    };
  }
  if (name === 'browser.block') {
    const { blocks = [], nextRuleId = 10000 } = await chrome.storage.local.get(['blocks', 'nextRuleId']);
    const expiresAt = Date.now() + args.duration_minutes * 60000;
    const incoming = [...new Set(args.patterns)];
    const replaced = blocks.filter((block) => incoming.includes(block.pattern));
    const kept = blocks.filter((block) => !incoming.includes(block.pattern));
    const additions = incoming.map((pattern, index) => ({ pattern, id: nextRuleId + index, expiresAt }));
    const addRules = additions.map((block) => ruleFor(block.pattern, block.id));
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: replaced.map((block) => block.id), addRules,
    });
    await chrome.storage.local.set({ blocks: [...kept, ...additions], nextRuleId: nextRuleId + additions.length });
    return { blocked: incoming, expiresAt: new Date(expiresAt).toISOString() };
  }
  if (name === 'browser.unblock') {
    const { blocks = [] } = await chrome.storage.local.get('blocks');
    const removed = blocks.filter((block) => args.patterns.includes(block.pattern));
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removed.map((block) => block.id) });
    await chrome.storage.local.set({ blocks: blocks.filter((block) => !args.patterns.includes(block.pattern)) });
    return { unblocked: removed.map((block) => block.pattern) };
  }
  if (name === 'browser.close_tab') {
    const tab = await chrome.tabs.get(args.tab_id);
    if (!/^https?:\/\//i.test(tab.url || '')) throw new Error('Only ordinary web pages can be closed.');
    const restoreId = crypto.randomUUID();
    const { closedTabs = [] } = await chrome.storage.local.get('closedTabs');
    const record = { restoreId, url: tab.url, title: tab.title || tab.url, windowId: tab.windowId, index: tab.index };
    await chrome.storage.local.set({ closedTabs: [...closedTabs, record].slice(-50) });
    await chrome.tabs.remove(tab.id);
    return { closed: record };
  }
  if (name === 'browser.restore_tab') {
    const { closedTabs = [] } = await chrome.storage.local.get('closedTabs');
    const tab = closedTabs.find((item) => item.restoreId === args.restore_id);
    if (!tab) throw new Error('That restore record was not found.');
    let created;
    try {
      created = await chrome.tabs.create({ url: tab.url, windowId: tab.windowId, index: tab.index, active: true });
    } catch (_) {
      created = await chrome.tabs.create({ url: tab.url, active: true });
    }
    await chrome.storage.local.set({ closedTabs: closedTabs.filter((item) => item.restoreId !== args.restore_id) });
    return { restoredTabId: created.id, url: tab.url };
  }
  throw new Error('Unsupported browser command.');
}

async function flushResults(port, token) {
  const { pendingResults = [] } = await chrome.storage.local.get('pendingResults');
  const remaining = [];
  for (const result of pendingResults) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/result`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FlowSight-Token': token },
        body: JSON.stringify(result), signal: AbortSignal.timeout(8000),
      });
      if (!response.ok && response.status !== 404) remaining.push(result);
    } catch (_) {
      remaining.push(result);
    }
  }
  if (remaining.length !== pendingResults.length) await chrome.storage.local.set({ pendingResults: remaining });
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    await expireBlocks();
    const { port, token } = await chrome.storage.local.get(['port', 'token']);
    if (!port || !token) { await releaseBlocksAfterDisconnect(); return; }
    await flushResults(port, token);
    const response = await fetch(`http://127.0.0.1:${port}/next`, {
      headers: { 'X-FlowSight-Token': token }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) { await releaseBlocksAfterDisconnect(); return; }
    await chrome.storage.local.set({ lastConnectedAt: Date.now() });
    const { command } = await response.json();
    if (!command) return;
    let result;
    try {
      result = { id: command.id, ok: true, result: await runCommand(command.name, command.arguments) };
    } catch (error) {
      result = { id: command.id, ok: false, error: String(error.message || error) };
    }
    const { pendingResults = [] } = await chrome.storage.local.get('pendingResults');
    await chrome.storage.local.set({ pendingResults: [...pendingResults, result].slice(-20) });
    await flushResults(port, token);
  } catch (_) {
    // FlowSight may be closed. Never keep a site blocked indefinitely.
    await releaseBlocksAfterDisconnect().catch(() => {});
  } finally {
    polling = false;
  }
}

chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 }); poll(); });
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 }); poll(); });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === POLL_ALARM) poll(); });
chrome.runtime.onMessage.addListener((message) => { if (message?.type === 'poll-now') poll(); });
chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
poll();
