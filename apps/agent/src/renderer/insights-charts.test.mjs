import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  bucketFocusEntriesByHour,
  buildTaskBreakdown,
  focusBarPercent,
  focusChartSlots,
  formatChartHour,
  taskColorForCategory,
  taskSharePercent,
} from './insights-charts.mjs';

process.env.TZ = 'Europe/Madrid';

test('task colors follow the activity type, not the ranking', () => {
  const actualCategories = ['Analysis', 'Research', 'General', 'Communication', 'Browsing', 'Coding'];
  const actualColors = actualCategories.map(taskColorForCategory);
  assert.equal(new Set(actualColors).size, actualCategories.length);
  const theme = readFileSync(new URL('./mobile-theme.css', import.meta.url), 'utf8');
  for (const color of actualColors) {
    const token = color.match(/^var\((--task-color-[a-z]+)\)$/)?.[1];
    assert.ok(token, `${color} should use a semantic theme token`);
    assert.equal(theme.split(`${token}:`).length - 1, 2, `${token} must exist in light and dark themes`);
  }
  assert.equal(taskColorForCategory('Coding'), 'var(--task-color-coding)');
  assert.equal(taskColorForCategory('Code Review'), 'var(--task-color-review)');
  assert.equal(taskColorForCategory('Design'), 'var(--task-color-design)');
  assert.notEqual(taskColorForCategory('Coding'), taskColorForCategory('Design'));

  const data = {
    ticket_breakdown: [
      { ticket: 'FS-1', total_seconds: 150 },
      { ticket: 'FS-2', total_seconds: 50 },
    ],
    entries: [
      { ticket: 'FS-1', category: 'Coding', duration_seconds: 120 },
      { ticket: 'FS-1', category: 'Debugging', duration_seconds: 30 },
      { ticket: 'FS-2', category: 'Design', duration_seconds: 50 },
      { ticket: null, category: 'Planning', duration_seconds: 80 },
    ],
  };
  const items = buildTaskBreakdown(data);
  assert.equal(items.find(item => item.label === 'FS-1').category, 'Coding');
  assert.equal(items.find(item => item.label === 'FS-2').category, 'Design');
  assert.equal(items.find(item => item.label === 'Planning').category, 'Planning');
  assert.equal(taskColorForCategory(items.find(item => item.label === 'FS-1').category), 'var(--task-color-coding)');
  assert.equal(taskSharePercent(48, 100), 48);
  assert.equal(taskSharePercent(150, 100), 100);
  assert.equal(taskSharePercent(10, 0), 0);
});

test('focus durations span the real local hours, including outside office hours', () => {
  const byHour = bucketFocusEntriesByHour([
    { time: '2026-09-28T07:20:00Z', duration_seconds: 3000 },
    { time: '2026-09-28T21:30:00Z', duration_seconds: 3600 },
  ], '2026-09-28');
  assert.equal(byHour[8], 1800);
  assert.equal(byHour[9], 1200);
  assert.equal(byHour[22], 1800);
  assert.equal(byHour[23], 1800);
  const slots = focusChartSlots(byHour);
  assert.equal(slots[0].hour, 7);
  assert.equal(slots.at(-1).hour, 23);
  assert.equal(formatChartHour(slots.at(-1).hour), '11pm');
});

test('hourly focus bars retain a fixed 60-minute scale', () => {
  assert.equal(focusBarPercent(0), 0);
  assert.equal(focusBarPercent(1406), 39);
  assert.equal(focusBarPercent(3569), 99);
  assert.equal(focusBarPercent(3600), 100);
  assert.equal(focusBarPercent(4500), 100);
  assert.equal(focusBarPercent(Number.NaN), 0);

  const sustainedDay = new Array(24).fill(0);
  sustainedDay[1] = 1500;
  sustainedDay.fill(3600, 2, 13);
  sustainedDay[13] = 2400;
  sustainedDay[14] = 900;
  sustainedDay[15] = 600;
  assert.equal(sustainedDay.reduce((sum, seconds) => sum + seconds, 0), 45_000);
  const slots = focusChartSlots(sustainedDay);
  assert.equal(slots[0].hour, 0);
  assert.equal(slots.at(-1).hour, 16);
  assert.equal(slots.filter(slot => focusBarPercent(slot.seconds) >= 90).length, 11);
});

test('focus time crossing midnight is clipped to the displayed local date', () => {
  const entries = [{ time: '2026-09-28T22:10:00Z', duration_seconds: 1800 }];
  const today = bucketFocusEntriesByHour(entries, '2026-09-29');
  assert.equal(today[0], 600);
  assert.equal(today.reduce((sum, seconds) => sum + seconds, 0), 600);
  const yesterday = bucketFocusEntriesByHour(entries, '2026-09-28');
  assert.equal(yesterday[23], 1200);
});

test('repeated local hour at DST change keeps both intervals', () => {
  const byHour = bucketFocusEntriesByHour([
    { time: '2026-10-25T01:30:00Z', duration_seconds: 3600 },
  ], '2026-10-25');
  assert.equal(byHour[2], 3600);
  assert.equal(byHour.reduce((sum, seconds) => sum + seconds, 0), 3600);
});
