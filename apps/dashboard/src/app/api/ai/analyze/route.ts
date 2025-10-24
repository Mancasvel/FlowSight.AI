import { NextRequest, NextResponse } from 'next/server';
import { getEventsCollection } from '@/lib/mongodb';
import { getAIAnalyzer, AIAnalyzer } from '@/lib/ai/analyzer';
import { SemanticEvent } from '@flowsight/shared';

/**
 * POST /api/ai/analyze
 * On-demand AI analysis of developer activity
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { devId, ticketId, analysisType, timeRange } = body;

    if (!devId && !ticketId) {
      return NextResponse.json(
        { error: 'Either devId or ticketId is required' },
        { status: 400 }
      );
    }

    // Validate API key or session
    // TODO: Add proper authentication

    // Build query
    const query: any = {};
    if (devId) query.devId = devId;
    if (ticketId) query.ticketId = ticketId;

    // Default time range: last 24 hours
    const endTime = timeRange?.end ? new Date(timeRange.end) : new Date();
    const startTime = timeRange?.start 
      ? new Date(timeRange.start)
      : new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

    query.timestamp = {
      $gte: startTime,
      $lte: endTime,
    };

    // Fetch events
    const events = await getEventsCollection();
    const eventsList = await events
      .find(query)
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();

    if (eventsList.length === 0) {
      return NextResponse.json({
        error: 'No events found for the specified criteria',
      }, { status: 404 });
    }

    // Get AI analyzer (use project-specific config if available)
    const projectId = body.projectId || 'default';
    const config = await AIAnalyzer.getProjectConfig(projectId);
    const analyzer = getAIAnalyzer(config);

    // Perform analysis based on type
    let result: any;

    switch (analysisType) {
      case 'blocker':
        result = await analyzer.analyzeBlocker(eventsList as SemanticEvent[]);
        break;

      case 'productivity':
        result = await analyzer.analyzeProductivity(eventsList as SemanticEvent[]);
        break;

      case 'ticket':
        if (!ticketId) {
          return NextResponse.json(
            { error: 'ticketId required for ticket analysis' },
            { status: 400 }
          );
        }
        result = await analyzer.analyzeTicket(eventsList as SemanticEvent[], ticketId);
        break;

      default:
        // Default: comprehensive analysis
        result = {
          blocker: await analyzer.analyzeBlocker(eventsList as SemanticEvent[]),
          productivity: await analyzer.analyzeProductivity(eventsList as SemanticEvent[]),
        };
    }

    return NextResponse.json({
      success: true,
      analysis: result,
      metadata: {
        eventsAnalyzed: eventsList.length,
        timeRange: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
        },
        devId,
        ticketId,
      },
    });

  } catch (error: any) {
    console.error('AI analysis error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'AI analysis failed',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/analyze/status
 * Check if AI is configured and available
 */
export async function GET(request: NextRequest) {
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  return NextResponse.json({
    available: hasOpenRouter || hasOpenAI,
    providers: {
      openrouter: hasOpenRouter,
      openai: hasOpenAI,
    },
    models: {
      default: process.env.DEFAULT_AI_MODEL || 'openai/gpt-4-turbo-preview',
    },
  });
}


