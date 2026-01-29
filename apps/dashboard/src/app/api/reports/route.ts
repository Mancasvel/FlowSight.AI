import { NextResponse } from 'next/server';
import { saveReport, getRecentReports, getDevelopers, registerDeveloper } from '@/lib/local-db';

// POST /api/reports - Receive activity report from DEV Agent
// Stores in LOCAL SQLite (NOT directly to Supabase)
export async function POST(request: Request) {
  try {
    const { 
      apiKey,
      developerId,
      developerName,
      deviceId,
      description, 
      activityType, 
      appName, 
      windowTitle 
    } = await request.json();
    
    if (!description || !activityType) {
      return NextResponse.json(
        { error: 'Description and activity type are required' },
        { status: 400 }
      );
    }

    // If new developer, register them
    if (developerName && deviceId) {
      const devId = developerId || `dev_${deviceId}`;
      registerDeveloper(devId, developerName, deviceId);
    }

    const finalDevId = developerId || `dev_${deviceId}` || 'unknown';
    
    // Save to LOCAL SQLite (fast, no network)
    const reportId = saveReport(
      finalDevId,
      description,
      activityType,
      appName,
      windowTitle
    );
    
    console.log(`[Report] ${finalDevId}: ${description.substring(0, 50)}...`);
    
    return NextResponse.json({
      success: true,
      reportId,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error: any) {
    console.error('Error saving report:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save report' },
      { status: 500 }
    );
  }
}

// GET /api/reports - Get recent reports (from LOCAL SQLite)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const developerId = searchParams.get('developerId');
    const limit = parseInt(searchParams.get('limit') || '50');
    
    const reports = getRecentReports(limit, developerId || undefined);
    const developers = getDevelopers();
    
    // Calculate activity breakdown
    const activityBreakdown: Record<string, number> = {};
    reports.forEach((r: any) => {
      activityBreakdown[r.activity_type] = (activityBreakdown[r.activity_type] || 0) + 1;
    });
    
    return NextResponse.json({
      reports,
      developers,
      stats: {
        total: reports.length,
        breakdown: activityBreakdown,
      },
    });
    
  } catch (error: any) {
    console.error('Error getting reports:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get reports' },
      { status: 500 }
    );
  }
}
