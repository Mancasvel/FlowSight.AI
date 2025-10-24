import { NextRequest, NextResponse } from 'next/server';
import { getTicketsCollection } from '@/lib/mongodb';
import { TicketSchema } from '@flowsight/shared';
import { triggerRealtimeUpdate } from '@/lib/pusher';

/**
 * GET /api/tickets
 * Get all tickets
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');

    const tickets = await getTicketsCollection();
    const query = projectId ? { projectId } : {};
    
    const allTickets = await tickets
      .find(query)
      .sort({ lastUpdatedAt: -1 })
      .toArray();

    return NextResponse.json({ tickets: allTickets });
  } catch (error: any) {
    console.error('Error fetching tickets:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tickets
 * Create or update a ticket
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedTicket = TicketSchema.parse(body);

    const tickets = await getTicketsCollection();
    
    const result = await tickets.findOneAndUpdate(
      { ticketId: validatedTicket.ticketId },
      {
        $set: {
          ...validatedTicket,
          lastUpdatedAt: new Date(),
          createdAt: validatedTicket.createdAt || new Date(),
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    // Trigger real-time update
    if (result) {
      await triggerRealtimeUpdate(
        `project:${result.projectId}`,
        'ticket_update',
        result
      );
    }

    return NextResponse.json({ success: true, ticket: result });
  } catch (error: any) {
    console.error('Error creating/updating ticket:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/tickets
 * Update ticket status
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticketId, status, progress, blockerReason } = body;

    if (!ticketId) {
      return NextResponse.json(
        { error: 'ticketId is required' },
        { status: 400 }
      );
    }

    const tickets = await getTicketsCollection();
    
    const updateData: any = {
      lastUpdatedAt: new Date(),
      lastUpdatedBy: 'pm',
    };

    if (status) updateData.status = status;
    if (progress !== undefined) updateData.progress = progress;
    if (blockerReason !== undefined) updateData.blockerReason = blockerReason;

    const result = await tickets.findOneAndUpdate(
      { ticketId },
      { $set: updateData },
      { returnDocument: 'after' }
    );

    if (!result) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    // Trigger real-time update
    await triggerRealtimeUpdate(
      `project:${result.projectId}`,
      'ticket_update',
      result
    );

    return NextResponse.json({ success: true, ticket: result });
  } catch (error: any) {
    console.error('Error updating ticket:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

