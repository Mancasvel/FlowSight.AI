import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./local-agent.css', import.meta.url), 'utf8');

test('unverified external connection controls stay hidden in the local-only release', () => {
  assert.match(markup, /id="localAgentExternalConnections" hidden/);
  assert.match(markup, /id="localAgentUseLocalCalendarBtn"[^>]*hidden/);
  assert.match(styles, /#localAgentExternalConnections\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(styles, /\.local-agent-details \.button\[hidden\]/);
});
