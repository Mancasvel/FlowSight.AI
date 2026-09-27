const DAY_MS = 24 * 60 * 60 * 1000;

export function cleanReportText(value) {
  if (value == null) return '';
  const cleaned = String(value).replace(/[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u30FF\uAC00-\uD7AF]/g, ' ');
  const segments = cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const englishLetters = part.replace(/[^A-Za-z]/g, '').length;
      const latinLetters = part.replace(/[^A-Za-z\u00C0-\u024F]/g, '').length;
      return latinLetters === 0 || englishLetters / latinLetters >= 0.55;
    });
  return (segments.length ? segments.join(' ') : cleaned).replace(/\s+/g, ' ').trim();
}

function asItems(value) {
  return Array.isArray(value) ? value : [];
}

function asSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

function isoDay(value) {
  const match = String(value ?? '').match(/^\d{4}-\d{2}-\d{2}$/);
  return match ? match[0] : '';
}

function reportDays(local) {
  const totals = new Map(asItems(local.daily_totals)
    .filter((day) => isoDay(day.date))
    .map((day) => [day.date, asSeconds(day.total_seconds)]));
  const start = isoDay(local.period_start);
  const end = isoDay(local.period_end);
  const startTime = start ? Date.parse(`${start}T12:00:00Z`) : NaN;
  const endTime = end ? Date.parse(`${end}T12:00:00Z`) : NaN;
  const dates = [];
  if (Number.isFinite(startTime) && Number.isFinite(endTime)
      && endTime >= startTime && endTime - startTime < 31 * DAY_MS) {
    for (let time = startTime; time <= endTime; time += DAY_MS) {
      dates.push(new Date(time).toISOString().slice(0, 10));
    }
  } else {
    dates.push(...[...totals.keys()].sort());
  }
  const max = Math.max(1, ...dates.map((date) => totals.get(date) || 0));
  return dates.map((date) => ({
    date,
    label: new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' })
      .format(new Date(`${date}T12:00:00Z`)),
    seconds: totals.get(date) || 0,
    hours: ((totals.get(date) || 0) / 3600).toFixed(1),
    percentOfPeak: Math.round(((totals.get(date) || 0) / max) * 100),
  }));
}

function reportTone(status) {
  const normalized = status.toLowerCase();
  if (/risk|attention|fragment/.test(normalized)) return 'attention';
  if (/sustained blocks observed/.test(normalized)) return 'positive';
  return 'neutral';
}

export function createStatusReportViewModel(payload, { userName = 'Knowledge worker', todayDate = '' } = {}) {
  const report = payload?.report || {};
  const local = payload?.local_data || {};
  const meta = report.report_meta || {};
  const text = (value) => cleanReportText(value);
  const list = (value) => asItems(value).map(text).filter(Boolean);
  const totalSeconds = asSeconds(local.total_seconds);
  const focusSeconds = asSeconds(local.deep_focus_seconds);
  const days = reportDays(local);
  const period = text(meta.period_label)
    || [isoDay(local.period_start), isoDay(local.period_end)].filter(Boolean).join(' – ')
    || todayDate;
  const status = text(report.overall_health) || 'No assessment available';
  const categories = asItems(local.category_breakdown)
    .map((row) => ({ label: text(row.category) || 'Unlabelled', seconds: asSeconds(row.total_seconds) }))
    .filter((row) => row.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
    .map((row) => ({
      ...row,
      hours: (row.seconds / 3600).toFixed(1),
      percent: totalSeconds ? Math.min(100, Math.round(row.seconds / totalSeconds * 100)) : 0,
    }));

  return {
    title: 'Weekly work review',
    period,
    userName: text(userName) || 'Knowledge worker',
    generatedAt: text(payload?.generated_at) || todayDate,
    summary: text(report.executive_overview || report.work_summary)
      || (totalSeconds ? 'Activity was recorded in this period.' : 'No local activity was recorded in this period.'),
    status,
    statusTone: reportTone(status),
    healthNotes: text(report.health_notes),
    focusTarget: text(report.focus_target || meta.focus_target),
    timelineCaption: text(report.timeline_caption || report.work_summary),
    totalHours: (totalSeconds / 3600).toFixed(1),
    focusHours: (focusSeconds / 3600).toFixed(1),
    focusSessions: Math.max(0, Number(local.deep_focus_sessions) || 0),
    activeDays: Math.max(0, Number(local.active_days) || days.filter((day) => day.seconds > 0).length),
    periodDays: days.length || Math.max(0, Number(local.period_days) || 0),
    empty: totalSeconds === 0,
    days,
    categories,
    actions: list(report.recommendations),
    breakdown: asItems(report.health_breakdown).map((row) => ({
      element: text(row.element) || 'Work area',
      status: text(row.status) || 'Observed',
      notes: text(row.notes),
      owner: text(row.owner_team),
    })),
    knownIssues: list(report.known_issues),
    potentialRisks: list(report.potential_risks),
    observedWork: list(report.observed_work),
    highlights: list(report.work_progress),
    lessons: asItems(report.lessons_learned).map((lesson) => ({
      title: text(lesson.title) || 'Learning',
      body: text(lesson.body),
    })),
    aiPowered: Boolean(payload?.ai_powered),
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function reportList(items, emptyLabel) {
  return items.length
    ? `<ul class="sr-plain-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : `<p class="sr-muted">${escapeHtml(emptyLabel)}</p>`;
}

export function renderStatusReportHtml(model) {
  const days = model.days.map((day) => `
    <div class="sr-day" title="${escapeHtml(day.date)}: ${day.hours}h" aria-label="${escapeHtml(day.date)}: ${day.hours} hours">
      <div class="sr-day-value">${day.seconds ? `${day.hours}h` : '—'}</div>
      <div class="sr-day-track"><span style="height:${day.seconds ? Math.max(7, day.percentOfPeak) : 0}%"></span></div>
      <div class="sr-day-label">${escapeHtml(day.label)}<small>${escapeHtml(day.date.slice(8))}</small></div>
    </div>`).join('');
  const categories = model.categories.length
    ? model.categories.slice(0, 6).map((category) => `
      <div class="sr-category-row">
        <span class="sr-category-name" title="${escapeHtml(category.label)}">${escapeHtml(category.label)}</span>
        <div class="sr-category-track" aria-label="${category.percent}% of tracked time"><span style="width:${Math.max(2, category.percent)}%"></span></div>
        <strong>${category.hours}h</strong>
      </div>`).join('')
    : '<p class="sr-muted">No category time recorded.</p>';
  const actions = model.actions.length
    ? `<ol class="sr-action-list">${model.actions.map((action, index) => `
        <li><span class="sr-action-number">${String(index + 1).padStart(2, '0')}</span><p>${escapeHtml(action)}</p></li>`).join('')}</ol>`
    : '<p class="sr-muted">No specific next move is supported by this period yet. Keep tracking to build a baseline.</p>';
  const breakdown = model.breakdown.length
    ? `<div class="sr-signal-list">${model.breakdown.map((row) => `
        <div class="sr-signal-row"><div class="sr-signal-top"><strong>${escapeHtml(row.element)}</strong><span>${escapeHtml(row.status)}</span></div>
          ${row.notes ? `<p>${escapeHtml(row.notes)}</p>` : ''}
          ${row.owner && row.owner.toLowerCase() !== 'self' ? `<small>Owner: ${escapeHtml(row.owner)}</small>` : ''}
        </div>`).join('')}</div>`
    : '<p class="sr-muted">No work-area detail was generated.</p>';
  const lessons = model.lessons.length
    ? `<div class="sr-lessons">${model.lessons.map((lesson) => `<div><strong>${escapeHtml(lesson.title)}</strong><p>${escapeHtml(lesson.body)}</p></div>`).join('')}</div>`
    : '<p class="sr-muted">No lessons were generated for this period.</p>';

  return `
    <article class="status-report sr-review">
      <header class="sr-review-hero">
        <div class="sr-review-heading"><div><h2>${escapeHtml(model.title)}</h2><p>${escapeHtml(model.period)}</p></div>
          <span class="sr-signal-chip sr-signal-${model.statusTone}">${escapeHtml(model.status)}</span></div>
        <p class="sr-review-meta">${escapeHtml(model.userName)} <span aria-hidden="true">·</span> Generated ${escapeHtml(model.generatedAt)}</p>
      </header>

      <section class="sr-overview" aria-label="Review summary">
        <p>${escapeHtml(model.summary)}</p>
        <div class="sr-stat-line">
          <div><strong>${model.totalHours}<span>h</span></strong><span>Tracked time</span></div>
          <div><strong>${model.focusHours}<span>h</span></strong><span>Sustained focus · ${model.focusSessions} blocks</span></div>
          <div><strong>${model.activeDays}<span>/${model.periodDays}</span></strong><span>Days with activity</span></div>
        </div>
      </section>

      <section class="sr-section sr-next" aria-labelledby="srNextTitle">
        <div class="sr-section-heading"><h3 id="srNextTitle">What to do next</h3><p>Actions suggested by the recorded evidence</p></div>
        ${actions}
      </section>

      <section class="sr-section" aria-labelledby="srEvidenceTitle">
        <div class="sr-section-heading"><h3 id="srEvidenceTitle">The week in view</h3><p>Recorded time, not a productivity score</p></div>
        <div class="sr-evidence-grid">
          <figure class="sr-figure"><figcaption>Activity by day</figcaption>
            ${days ? `<div class="sr-day-chart">${days}</div>` : '<p class="sr-muted">No dated activity available.</p>'}
          </figure>
          <figure class="sr-figure"><figcaption>Time by category</figcaption>${categories}</figure>
        </div>
        ${model.timelineCaption ? `<p class="sr-evidence-note">${escapeHtml(model.timelineCaption)}</p>` : ''}
      </section>

      <section class="sr-section sr-context" aria-labelledby="srContextTitle">
        <div class="sr-section-heading"><h3 id="srContextTitle">How to read the signal</h3></div>
        ${model.healthNotes ? `<p>${escapeHtml(model.healthNotes)}</p>` : '<p class="sr-muted">No additional interpretation was generated.</p>'}
        ${model.focusTarget ? `<p class="sr-focus-target"><strong>Focus target</strong> ${escapeHtml(model.focusTarget)}</p>` : ''}
      </section>

      <section class="sr-section" aria-labelledby="srAreasTitle">
        <div class="sr-section-heading"><h3 id="srAreasTitle">Work-area detail</h3><p>Specific observations behind the review</p></div>
        ${breakdown}
      </section>

      <section class="sr-section sr-detail-grid" aria-label="Observed work and watchpoints">
        <div><h3>Work observed</h3>${reportList(model.observedWork, 'No labelled work was observed.')}
          ${model.highlights.length ? `<h4>Highlights</h4>${reportList(model.highlights, '')}` : ''}</div>
        <div><h3>Watchpoints</h3><h4>Known issues</h4>${reportList(model.knownIssues, 'None flagged.')}
          <h4>Potential risks</h4>${reportList(model.potentialRisks, 'None flagged.')}</div>
      </section>

      <section class="sr-section" aria-labelledby="srLessonsTitle"><div class="sr-section-heading"><h3 id="srLessonsTitle">What this period taught us</h3></div>${lessons}</section>

      <footer class="sr-review-footer"><p>Based on activity stored on this device. ${model.aiPowered ? 'Narrative assisted by local AI.' : 'Structured, rule-based narrative.'} Interpret alongside your own context.</p>
        <button type="button" class="sr-download-btn" id="downloadReportPdfBtn" aria-label="Download weekly work review as PDF">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Download PDF
        </button></footer>
    </article>`;
}
