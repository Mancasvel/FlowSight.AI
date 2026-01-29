// Summary Generator
// Uses local Ollama to generate daily summaries from activity reports

import { getReportsForDate, saveDailySummary, getDevelopers } from './local-db';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const SUMMARY_MODEL = process.env.SUMMARY_MODEL || 'phi3:3.8b';

interface ActivityReport {
  id: number;
  developer_id: string;
  description: string;
  activity_type: string;
  created_at: string;
}

// Generate summary using local Ollama
async function generateSummaryWithOllama(reports: ActivityReport[]): Promise<string> {
  if (reports.length === 0) {
    return 'No activity recorded for this day.';
  }

  // Prepare activity descriptions for the model
  const activityList = reports
    .map(r => `- [${r.activity_type}] ${r.description}`)
    .join('\n');

  const prompt = `You are a productivity analyst. Based on the following developer activity log, write a brief 2-3 sentence summary of what the developer accomplished today. Be specific and professional.

Activity Log:
${activityList}

Summary:`;

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.5,
          num_predict: 200,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();
    return data.response?.trim() || 'Summary generation failed.';
  } catch (error) {
    console.error('Ollama error:', error);
    // Fallback to simple stats-based summary
    return generateStatsSummary(reports);
  }
}

// Fallback summary without AI
function generateStatsSummary(reports: ActivityReport[]): string {
  const typeCounts: Record<string, number> = {};
  
  reports.forEach(r => {
    typeCounts[r.activity_type] = (typeCounts[r.activity_type] || 0) + 1;
  });

  const mainActivity = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])[0];

  return `${reports.length} activities recorded. Primary focus: ${mainActivity?.[0] || 'various'} (${mainActivity?.[1] || 0} sessions).`;
}

// Calculate time breakdown (assuming ~2 min per report on average)
function calculateTimeBreakdown(reports: ActivityReport[]) {
  const MINUTES_PER_REPORT = 2;
  const breakdown = {
    coding: 0,
    browsing: 0,
    meeting: 0,
    terminal: 0,
    documentation: 0,
    other: 0,
  };

  reports.forEach(r => {
    const type = r.activity_type as keyof typeof breakdown;
    if (type in breakdown) {
      breakdown[type] += MINUTES_PER_REPORT;
    } else {
      breakdown.other += MINUTES_PER_REPORT;
    }
  });

  return breakdown;
}

// Generate daily summary for a developer
export async function generateDeveloperDailySummary(
  developerId: string,
  date: string
): Promise<void> {
  const reports = getReportsForDate(date, developerId) as ActivityReport[];
  
  if (reports.length === 0) {
    return; // No activity, skip summary
  }

  const summaryText = await generateSummaryWithOllama(reports);
  const breakdown = calculateTimeBreakdown(reports);

  saveDailySummary(developerId, date, summaryText, {
    totalReports: reports.length,
    codingMinutes: breakdown.coding,
    browsingMinutes: breakdown.browsing,
    meetingMinutes: breakdown.meeting,
    terminalMinutes: breakdown.terminal,
    otherMinutes: breakdown.other + breakdown.documentation,
  });
}

// Generate team-wide daily summary
export async function generateTeamDailySummary(date: string): Promise<void> {
  const reports = getReportsForDate(date) as ActivityReport[];
  
  if (reports.length === 0) {
    return;
  }

  // Group by developer for team summary
  const devActivities: Record<string, ActivityReport[]> = {};
  reports.forEach(r => {
    if (!devActivities[r.developer_id]) {
      devActivities[r.developer_id] = [];
    }
    devActivities[r.developer_id].push(r);
  });

  // Create team overview
  const devCount = Object.keys(devActivities).length;
  const totalReports = reports.length;
  
  const teamPrompt = `Based on ${totalReports} activity reports from ${devCount} developers, create a brief team productivity summary for the day.`;
  
  let summaryText: string;
  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        prompt: teamPrompt,
        stream: false,
        options: { temperature: 0.5, num_predict: 150 },
      }),
    });
    const data = await response.json();
    summaryText = data.response?.trim() || `Team recorded ${totalReports} activities across ${devCount} developers.`;
  } catch {
    summaryText = `Team recorded ${totalReports} activities across ${devCount} developers.`;
  }

  const breakdown = calculateTimeBreakdown(reports);

  saveDailySummary(null, date, summaryText, {
    totalReports,
    codingMinutes: breakdown.coding,
    browsingMinutes: breakdown.browsing,
    meetingMinutes: breakdown.meeting,
    terminalMinutes: breakdown.terminal,
    otherMinutes: breakdown.other + breakdown.documentation,
  });
}

// Run end-of-day summary generation for all developers
export async function generateAllDailySummaries(date?: string): Promise<void> {
  const targetDate = date || new Date().toISOString().split('T')[0];
  
  console.log(`[Summary] Generating summaries for ${targetDate}...`);

  // Get all developers
  const developers = getDevelopers() as { id: string; name: string }[];

  // Generate individual summaries
  for (const dev of developers) {
    await generateDeveloperDailySummary(dev.id, targetDate);
    console.log(`[Summary] Generated for ${dev.name}`);
  }

  // Generate team summary
  await generateTeamDailySummary(targetDate);
  console.log(`[Summary] Team summary generated`);
}
