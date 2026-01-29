import { NextResponse } from 'next/server';

// In-memory store for activity reports (in production, use MongoDB)
const activityReports: any[] = [];
const MAX_REPORTS = 1000;

export async function POST(request: Request) {
  try {
    const report = await request.json();
    
    // Add received timestamp
    const enrichedReport = {
      ...report,
      receivedAt: new Date().toISOString(),
    };
    
    // Store report
    activityReports.unshift(enrichedReport);
    
    // Keep only last MAX_REPORTS
    if (activityReports.length > MAX_REPORTS) {
      activityReports.pop();
    }
    
    console.log([Activity] \$\{report.dev_id\}: \$\{report.description?.substring(0, 100)\}...);
    
    return NextResponse.json({ success: true, reportId: Date.now() });
  } catch (error) {
    console.error('Error processing activity report:', error);
    return NextResponse.json({ error: 'Failed to process report' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const devId = searchParams.get('devId');
  const limit = parseInt(searchParams.get('limit') || '50');
  
  let reports = activityReports;
  
  // Filter by dev if specified
  if (devId) {
    reports = reports.filter(r => r.dev_id === devId);
  }
  
  // Return limited reports
  return NextResponse.json({
    reports: reports.slice(0, limit),
    total: reports.length,
    devs: [...new Set(activityReports.map(r => r.dev_id))]
  });
}
