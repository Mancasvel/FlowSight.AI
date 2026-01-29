import { NextResponse } from 'next/server';
import { runFullSync } from '@/lib/cloud-sync';
import { generateAllDailySummaries } from '@/lib/summary-generator';
import { getDbStats, cleanupOldReports } from '@/lib/local-db';

// POST /api/sync - Trigger sync to cloud
export async function POST(request: Request) {
  try {
    const { action, teamId, date } = await request.json();
    
    switch (action) {
      case 'generate-summaries': {
        // Generate daily summaries using local Ollama
        await generateAllDailySummaries(date);
        return NextResponse.json({ 
          success: true, 
          message: 'Summaries generated',
        });
      }
      
      case 'sync-to-cloud': {
        // Sync summaries to Supabase
        if (!teamId) {
          return NextResponse.json(
            { error: 'Team ID required for cloud sync' },
            { status: 400 }
          );
        }
        const result = await runFullSync(teamId);
        return NextResponse.json({ 
          success: true, 
          ...result,
        });
      }
      
      case 'cleanup': {
        // Clean up old reports (keep local DB small)
        const daysToKeep = 7; // Keep 7 days of raw reports locally
        const deleted = cleanupOldReports(daysToKeep);
        return NextResponse.json({ 
          success: true, 
          deletedReports: deleted,
        });
      }
      
      case 'full': {
        // Full daily routine: generate summaries, sync to cloud, cleanup
        if (!teamId) {
          return NextResponse.json(
            { error: 'Team ID required' },
            { status: 400 }
          );
        }
        
        // 1. Generate summaries
        await generateAllDailySummaries(date);
        
        // 2. Sync to cloud
        const syncResult = await runFullSync(teamId);
        
        // 3. Cleanup old data
        const deleted = cleanupOldReports(7);
        
        return NextResponse.json({ 
          success: true,
          summariesGenerated: true,
          syncResult,
          cleanedUp: deleted,
        });
      }
      
      default:
        return NextResponse.json(
          { error: 'Unknown action. Use: generate-summaries, sync-to-cloud, cleanup, or full' },
          { status: 400 }
        );
    }
    
  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    );
  }
}

// GET /api/sync - Get sync status
export async function GET() {
  try {
    const stats = getDbStats();
    
    return NextResponse.json({
      localDb: stats,
      lastSync: null, // Could track this in config table
      status: stats.unsyncedSummaries > 0 ? 'pending' : 'synced',
    });
    
  } catch (error: any) {
    console.error('Status error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get status' },
      { status: 500 }
    );
  }
}
