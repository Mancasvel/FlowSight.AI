'use client';

import { useEffect, useState, useCallback } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import type { ActivityReport, Developer } from '@/lib/supabase/types';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface UseRealtimeOptions {
  teamId: string;
  onNewReport?: (report: ActivityReport) => void;
  onDeveloperStatusChange?: (developer: Developer) => void;
}

export function useRealtime({ teamId, onNewReport, onDeveloperStatusChange }: UseRealtimeOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!teamId) return;

    const supabase = createBrowserClient();
    
    // Create a channel for this team
    const teamChannel = supabase
      .channel(`team:${teamId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_reports',
          filter: `team_id=eq.${teamId}`,
        },
        (payload: RealtimePostgresChangesPayload<ActivityReport>) => {
          console.log('New report:', payload.new);
          if (onNewReport && payload.new) {
            onNewReport(payload.new as ActivityReport);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'developers',
          filter: `team_id=eq.${teamId}`,
        },
        (payload: RealtimePostgresChangesPayload<Developer>) => {
          console.log('Developer update:', payload.new);
          if (onDeveloperStatusChange && payload.new) {
            onDeveloperStatusChange(payload.new as Developer);
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime status:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    setChannel(teamChannel);

    return () => {
      supabase.removeChannel(teamChannel);
    };
  }, [teamId, onNewReport, onDeveloperStatusChange]);

  const unsubscribe = useCallback(() => {
    if (channel) {
      const supabase = createBrowserClient();
      supabase.removeChannel(channel);
      setChannel(null);
      setIsConnected(false);
    }
  }, [channel]);

  return { isConnected, unsubscribe };
}

// Hook for fetching initial data and listening to realtime updates
export function useTeamActivity(apiKey: string | null) {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>('');
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [reports, setReports] = useState<ActivityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    if (!apiKey) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      try {
        // Get team info
        const teamRes = await fetch(`/api/teams?apiKey=${apiKey}`);
        const teamData = await teamRes.json();
        
        if (!teamRes.ok) {
          throw new Error(teamData.error);
        }
        
        setTeamId(teamData.team.id);
        setTeamName(teamData.team.name);
        setDevelopers(teamData.developers);
        
        // Get reports
        const reportsRes = await fetch(`/api/reports?apiKey=${apiKey}&limit=100`);
        const reportsData = await reportsRes.json();
        
        if (reportsRes.ok) {
          setReports(reportsData.reports);
        }
        
        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }

    fetchData();
  }, [apiKey]);

  // Handle new reports from realtime
  const handleNewReport = useCallback((report: ActivityReport) => {
    setReports(prev => [report, ...prev].slice(0, 100));
  }, []);

  // Handle developer status changes
  const handleDeveloperStatusChange = useCallback((developer: Developer) => {
    setDevelopers(prev => 
      prev.map(d => d.id === developer.id ? developer : d)
    );
  }, []);

  // Set up realtime subscription
  const { isConnected } = useRealtime({
    teamId: teamId || '',
    onNewReport: handleNewReport,
    onDeveloperStatusChange: handleDeveloperStatusChange,
  });

  return {
    teamId,
    teamName,
    developers,
    reports,
    loading,
    error,
    isConnected,
    refresh: () => {
      if (apiKey) {
        setLoading(true);
        fetch(`/api/reports?apiKey=${apiKey}&limit=100`)
          .then(res => res.json())
          .then(data => {
            setReports(data.reports);
            setLoading(false);
          });
      }
    },
  };
}
