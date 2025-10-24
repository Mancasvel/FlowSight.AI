import { NextRequest, NextResponse } from 'next/server';
import { SemanticEventSchema, EventResponse } from '@flowsight/shared';
import { getEventsCollection } from '@/lib/mongodb';
import { RulesEngine } from '@/lib/rules-engine';
import { triggerRealtimeUpdate } from '@/lib/pusher';

/**
 * POST /api/events
 * Receives semantic events from the agent
 */
export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const authHeader = request.headers.get('authorization');
    const apiKey = authHeader?.replace('Bearer ', '');
    
    if (!apiKey || !validateApiKey(apiKey)) {
      return NextResponse.json(
        { success: false, error: 'Invalid API key' },
        { status: 401 }
      );
    }

    // Parse and validate event
    const body = await request.json();
    const validatedEvent = SemanticEventSchema.parse(body);

    // Store event in MongoDB
    const events = await getEventsCollection();
    const result = await events.insertOne({
      ...validatedEvent,
      timestamp: new Date(validatedEvent.timestamp),
      createdAt: new Date(),
    });

    console.log('Event stored:', result.insertedId);

    // Run through rules engine
    const rulesEngine = new RulesEngine();
    const triggeredActions = await rulesEngine.processEvent(validatedEvent);

    // Trigger real-time update
    await triggerRealtimeUpdate(
      `dev:${validatedEvent.devId}`,
      'event',
      validatedEvent
    );

    // Also trigger project-wide update if ticket is present
    if (validatedEvent.ticketId) {
      // In a real app, you'd look up projectId from the ticket
      await triggerRealtimeUpdate(
        'project:default',
        'event',
        validatedEvent
      );
    }

    const response: EventResponse = {
      success: true,
      eventId: result.insertedId.toString(),
      triggeredActions,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error processing event:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * Validate API key
 * In production, check against database or secure storage
 */
function validateApiKey(apiKey: string): boolean {
  // Simple validation - in production, check against database
  const validPattern = /^fsa_[a-zA-Z0-9]{32,}$/;
  
  if (!validPattern.test(apiKey)) {
    return false;
  }

  // For now, allow all valid format keys
  // TODO: Verify against stored API keys in database
  return true;
}

