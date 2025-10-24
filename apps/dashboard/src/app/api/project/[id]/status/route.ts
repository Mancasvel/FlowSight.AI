import { NextRequest, NextResponse } from 'next/server';
import { getEventsCollection, getTicketsCollection, getProjectsCollection } from '@/lib/mongodb';
import { GetProjectStatusResponse } from '@flowsight/shared';

/**
 * GET /api/project/[id]/status
 * Get aggregated project status with developer activity
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    // Get project info
    const projects = await getProjectsCollection();
    const project = await projects.findOne({ projectId });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Get tickets for this project
    const tickets = await getTicketsCollection();
    const projectTickets = await tickets
      .find({ projectId })
      .sort({ lastUpdatedAt: -1 })
      .toArray();

    // Get recent events (last 24 hours)
    const events = await getEventsCollection();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentEvents = await events
      .find({
        timestamp: { $gte: oneDayAgo },
      })
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();

    // Aggregate developer status
    const developerMap = new Map();
    
    for (const event of recentEvents) {
      if (!developerMap.has(event.devId)) {
        developerMap.set(event.devId, {
          devId: event.devId,
          name: event.devId.split('@')[0] || event.devId,
          email: event.devId,
          currentActivity: event.activity,
          currentTicket: event.ticketId,
          currentApplication: event.application,
          currentFilePath: event.filePath,
          gitBranch: event.gitBranch,
          lastActiveAt: event.timestamp,
          isBlocked: false,
          blockerReason: undefined,
        });
      }
    }

    // Check for blocked tickets
    for (const ticket of projectTickets) {
      if (ticket.status === 'blocked' && ticket.assignedTo) {
        const dev = developerMap.get(ticket.assignedTo);
        if (dev) {
          dev.isBlocked = true;
          dev.blockerReason = ticket.blockerReason;
        }
      }
    }

    const developers = Array.from(developerMap.values());

    const response: GetProjectStatusResponse = {
      project,
      developers,
      tickets: projectTickets,
      recentEvents: recentEvents.map(e => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      })),
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error fetching project status:', error);
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

