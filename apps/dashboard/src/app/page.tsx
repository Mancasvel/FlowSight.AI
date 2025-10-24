'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { TeamMap } from '@/components/TeamMap';
import { Timeline } from '@/components/Timeline';
import { ProjectStats } from '@/components/ProjectStats';
import { usePusher } from '@/hooks/usePusher';
import type { DeveloperStatus, Ticket, SemanticEvent } from '@flowsight/shared';

export default function Home() {
  const [developers, setDevelopers] = useState<DeveloperStatus[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [events, setEvents] = useState<SemanticEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Connect to Pusher for real-time updates
  const { subscribe } = usePusher();

  useEffect(() => {
    // Load initial data
    loadProjectData();

    // Subscribe to real-time updates
    const channel = subscribe('project:default');
    
    channel.bind('event', (data: any) => {
      console.log('New event:', data);
      setEvents(prev => [data.payload, ...prev].slice(0, 100));
      loadProjectData(); // Refresh data
    });

    channel.bind('ticket_update', (data: any) => {
      console.log('Ticket updated:', data);
      loadProjectData(); // Refresh data
    });

    return () => {
      channel.unbind_all();
    };
  }, [subscribe]);

  async function loadProjectData() {
    try {
      const response = await fetch('/api/project/default/status');
      const data = await response.json();
      
      setDevelopers(data.developers || []);
      setTickets(data.tickets || []);
      setEvents(data.recentEvents || []);
      setLoading(false);
    } catch (error) {
      console.error('Error loading project data:', error);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Project Dashboard</h1>
          <button
            onClick={loadProjectData}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Refresh
          </button>
        </div>

        <ProjectStats developers={developers} tickets={tickets} events={events} />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <TeamMap developers={developers} tickets={tickets} />
          </div>
          <div>
            <Timeline events={events} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

