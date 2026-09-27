import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';

import { createStatusReportViewModel, renderStatusReportHtml } from './status-report.mjs';
import { renderStatusReportPdf } from './status-report-pdf.mjs';

// Synthetic activity only: these numbers are fixtures, not a customer report.
function syntheticReport() {
  return {
    generated_at: '2026-09-27 12:00',
    ai_powered: true,
    local_data: {
      period_start: '2026-09-21',
      period_end: '2026-09-27',
      period_days: 7,
      total_seconds: 36_000,
      deep_focus_seconds: 10_800,
      deep_focus_sessions: 2,
      active_days: 2,
      daily_totals: [
        { date: '2026-09-21', total_seconds: 14_400 },
        { date: '2026-09-24', total_seconds: 21_600 },
      ],
      category_breakdown: [
        { category: 'Planning', total_seconds: 21_600 },
        { category: 'Build', total_seconds: 14_400 },
      ],
    },
    report: {
      executive_overview: 'Ten hours were recorded across two days.',
      overall_health: 'Fragmented eligible work',
      health_notes: 'Two sustained blocks were observed.',
      timeline_caption: 'Activity was concentrated on Thursday.',
      recommendations: ['Reserve a planning block.', 'Review the observed short breaks.'],
      health_breakdown: [{ element: 'Planning', status: 'Observed', owner_team: 'Self', notes: 'Six hours recorded.' }],
      known_issues: ['Coverage is sparse.'],
      potential_risks: ['This period may under-represent work.'],
      observed_work: ['Planning tasks recorded.'],
      work_progress: ['Build work increased.'],
      lessons_learned: [{ title: 'Label work', body: 'Labels improved continuity.' }],
    },
  };
}

test('the review and PDF model use the report period, including days with zero recorded time', () => {
  const model = createStatusReportViewModel(syntheticReport(), { userName: 'Sample user' });
  assert.equal(model.days.length, 7);
  assert.equal(model.days[1].date, '2026-09-22');
  assert.equal(model.days[1].seconds, 0);
  assert.equal(model.days[3].seconds, 21_600);
  assert.equal(model.categories[0].percent, 60);
  assert.equal(model.statusTone, 'attention');
  assert.equal(model.activeDays, 2);
});

test('actions lead the evidence and untrusted report text is escaped', () => {
  const payload = syntheticReport();
  payload.report.recommendations[0] = 'Review <script>alert(1)</script> breaks.';
  const html = renderStatusReportHtml(createStatusReportViewModel(payload));
  assert.ok(html.indexOf('What to do next') < html.indexOf('The week in view'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('2026-09-22: 0.0 hours'));
});

test('an empty period does not invent positive signals or actions', () => {
  const payload = syntheticReport();
  payload.local_data.total_seconds = 0;
  payload.local_data.deep_focus_seconds = 0;
  payload.local_data.active_days = 0;
  payload.local_data.daily_totals = [];
  payload.local_data.category_breakdown = [];
  payload.report.recommendations = [];
  payload.report.overall_health = 'No sustained-work signal';
  const model = createStatusReportViewModel(payload);
  assert.equal(model.empty, true);
  assert.equal(model.statusTone, 'neutral');
  assert.equal(model.days.length, 7);
  assert.equal(model.actions.length, 0);
  assert.ok(renderStatusReportHtml(model).includes('No specific next move is supported'));
});

test('a concise review keeps its charts and findings within two PDF pages', () => {
  const model = createStatusReportViewModel(syntheticReport());
  const doc = renderStatusReportPdf(new jsPDF(), model);
  assert.ok(doc.internal.getNumberOfPages() <= 2);
});

test('PDF paginates long report copy without drawing text below the footer', () => {
  const payload = syntheticReport();
  const long = 'Review each observed block before changing the schedule. '.repeat(23);
  payload.report.recommendations = Array.from({ length: 5 }, (_, index) => `Action ${index + 1}: ${long} END_ACTION_${index + 1}`);
  payload.report.health_breakdown = Array.from({ length: 6 }, (_, index) => ({
    element: `Work area ${index + 1}`,
    status: 'Observed',
    notes: `${long} END_AREA_${index + 1}`,
  }));
  payload.report.lessons_learned = Array.from({ length: 4 }, (_, index) => ({ title: `Lesson ${index + 1}`, body: long }));
  const model = createStatusReportViewModel(payload);
  const doc = new jsPDF({ compress: false });
  const drawn = [];
  const originalText = doc.text.bind(doc);
  doc.text = (value, x, y, ...rest) => {
    drawn.push({ value: String(value), y });
    assert.ok(y <= 291, `text baseline ${y} exceeded the page footer`);
    return originalText(value, x, y, ...rest);
  };
  renderStatusReportPdf(doc, model);
  assert.ok(doc.internal.getNumberOfPages() >= 3);
  assert.ok(doc.output('arraybuffer').byteLength > 20_000);
  assert.ok(drawn.some((entry) => entry.value.includes('END_ACTION_5')));
  assert.ok(drawn.some((entry) => entry.value.includes('END_AREA_6')));
});
