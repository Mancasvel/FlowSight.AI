// Cloud Sync Service
// Syncs daily summaries and stats to Supabase (NOT individual reports)

import { createServerClient, isSupabaseConfigured } from './supabase/client';
import { getUnsyncedSummaries, markSummariesSynced, getDbStats } from './local-db';

interface SyncResult {
  success: boolean;
  syncedCount: number;
  error?: string;
}

// Sync unsynced daily summaries to Supabase
export async function syncSummariesToCloud(teamId: string): Promise<SyncResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, syncedCount: 0, error: 'Supabase not configured' };
  }

  try {
    const supabase = createServerClient();
    const summaries = getUnsyncedSummaries();
    
    if (summaries.length === 0) {
      return { success: true, syncedCount: 0 };
    }

    // Transform local summaries to Supabase format
    const cloudSummaries = summaries.map((s: any) => ({
      team_id: teamId,
      developer_id: s.developer_id,
      summary_date: s.summary_date,
      summary_text: s.summary_text,
      total_reports: s.total_reports,
      activity_breakdown: {
        coding: s.coding_minutes,
        browsing: s.browsing_minutes,
        meeting: s.meeting_minutes,
        terminal: s.terminal_minutes,
        other: s.other_minutes,
      },
    }));

    // Upsert to Supabase
    const { error } = await supabase
      .from('daily_summaries')
      .upsert(cloudSummaries, {
        onConflict: 'team_id,developer_id,summary_date',
      });

    if (error) {
      console.error('Supabase sync error:', error);
      return { success: false, syncedCount: 0, error: error.message };
    }

    // Mark as synced locally
    const ids = summaries.map((s: any) => s.id);
    markSummariesSynced(ids);

    return { success: true, syncedCount: summaries.length };
  } catch (error: any) {
    console.error('Sync error:', error);
    return { success: false, syncedCount: 0, error: error.message };
  }
}

// Sync team stats to cloud (for billing/analytics)
export async function syncTeamStats(teamId: string): Promise<SyncResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, syncedCount: 0, error: 'Supabase not configured' };
  }

  try {
    const supabase = createServerClient();
    const stats = getDbStats();

    // Update team's usage stats in Supabase
    const { error } = await supabase
      .from('teams')
      .update({
        updated_at: new Date().toISOString(),
        // Could add usage fields if needed for billing
      })
      .eq('id', teamId);

    if (error) {
      return { success: false, syncedCount: 0, error: error.message };
    }

    return { success: true, syncedCount: 1 };
  } catch (error: any) {
    return { success: false, syncedCount: 0, error: error.message };
  }
}

// Full sync job (call this periodically, e.g., every hour or at end of day)
export async function runFullSync(teamId: string) {
  console.log('[Sync] Starting full sync to cloud...');
  
  const summaryResult = await syncSummariesToCloud(teamId);
  console.log(`[Sync] Summaries: ${summaryResult.syncedCount} synced`);
  
  const statsResult = await syncTeamStats(teamId);
  console.log(`[Sync] Stats: ${statsResult.success ? 'updated' : 'failed'}`);
  
  return {
    summaries: summaryResult,
    stats: statsResult,
    timestamp: new Date().toISOString(),
  };
}
