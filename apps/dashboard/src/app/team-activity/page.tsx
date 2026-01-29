'use client';

import { useEffect, useState, useCallback } from 'react';

interface ActivityReport {
  id: number;
  developer_id: string;
  developer_name: string;
  description: string;
  activity_type: string;
  created_at: string;
}

interface Developer {
  id: string;
  name: string;
  is_online: number;
  last_seen_at: string;
}

interface Stats {
  total: number;
  breakdown: Record<string, number>;
}

const ACTIVITY_COLORS: Record<string, string> = {
  coding: '#2e7d32',
  browsing: '#1976d2',
  meeting: '#7b1fa2',
  terminal: '#f57c00',
  documentation: '#00838f',
  idle: '#9e9e9e',
  other: '#757575',
};

export default function TeamActivityPage() {
  const [reports, setReports] = useState<ActivityReport[]>([]);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, breakdown: {} });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [syncStatus, setSyncStatus] = useState<any>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/reports?limit=100');
      const data = await res.json();
      
      setReports(data.reports || []);
      setDevelopers(data.developers || []);
      setStats(data.stats || { total: 0, breakdown: {} });
      setLoading(false);
    } catch (error) {
      console.error('Fetch error:', error);
      setLoading(false);
    }
  }, []);

  const fetchSyncStatus = async () => {
    try {
      const res = await fetch('/api/sync');
      const data = await res.json();
      setSyncStatus(data);
    } catch (error) {
      console.error('Sync status error:', error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchSyncStatus();
    
    if (autoRefresh) {
      const interval = setInterval(fetchData, 5000);
      return () => clearInterval(interval);
    }
  }, [fetchData, autoRefresh]);

  const handleSync = async (action: string) => {
    setSyncing(true);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, teamId: 'local' }),
      });
      const result = await res.json();
      
      if (result.success) {
        alert(`${action} completed successfully`);
        fetchSyncStatus();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      alert('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const onlineDevs = developers.filter(d => d.is_online).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-medium text-gray-900">FlowSight PM Dashboard</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-green-600 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                {onlineDevs} online
              </span>
              <span className="text-sm text-gray-500">|</span>
              <span className="text-sm text-gray-500">
                {syncStatus?.localDb?.totalReports || 0} local reports
              </span>
              {syncStatus?.localDb?.unsyncedSummaries > 0 && (
                <>
                  <span className="text-sm text-gray-500">|</span>
                  <span className="text-sm text-orange-600">
                    {syncStatus.localDb.unsyncedSummaries} pending sync
                  </span>
                </>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input 
                type="checkbox" 
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              Auto-refresh
            </label>
            <button
              onClick={fetchData}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title="Refresh"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="text-sm text-gray-500 uppercase tracking-wide mb-1">Team Members</div>
            <div className="text-3xl font-light text-gray-900">{developers.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="text-sm text-gray-500 uppercase tracking-wide mb-1">Online Now</div>
            <div className="text-3xl font-light text-green-600">{onlineDevs}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="text-sm text-gray-500 uppercase tracking-wide mb-1">Total Reports</div>
            <div className="text-3xl font-light text-blue-600">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="text-sm text-gray-500 uppercase tracking-wide mb-1">Main Activity</div>
            <div className="text-xl font-light text-purple-600">
              {Object.entries(stats.breakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || '-'}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="text-sm text-gray-500 uppercase tracking-wide mb-1">Storage</div>
            <div className="text-lg font-light text-gray-600">Local SQLite</div>
          </div>
        </div>

        {/* Sync Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Data Management</h3>
              <p className="text-sm text-gray-500">Generate summaries and sync to cloud</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleSync('generate-summaries')}
                disabled={syncing}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {syncing ? 'Processing...' : 'Generate Summaries'}
              </button>
              <button
                onClick={() => handleSync('sync-to-cloud')}
                disabled={syncing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Sync to Cloud
              </button>
              <button
                onClick={() => handleSync('cleanup')}
                disabled={syncing}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
              >
                Cleanup Old Data
              </button>
            </div>
          </div>
        </div>

        {/* Team Members */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-medium text-gray-900">Team Members</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {developers.length > 0 ? (
              developers.map(dev => {
                const devReports = reports.filter(r => r.developer_id === dev.id);
                const lastReport = devReports[0];
                
                return (
                  <div key={dev.id} className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full ${dev.is_online ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                      <div>
                        <div className="font-medium text-gray-900">{dev.name}</div>
                        <div className="text-sm text-gray-500">
                          {dev.is_online ? 'Online' : `Last seen ${dev.last_seen_at || 'never'}`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {lastReport && (
                        <>
                          <span 
                            className="inline-block text-xs px-2 py-1 rounded text-white"
                            style={{ backgroundColor: ACTIVITY_COLORS[lastReport.activity_type] || ACTIVITY_COLORS.other }}
                          >
                            {lastReport.activity_type}
                          </span>
                          <div className="text-xs text-gray-500 mt-1">{devReports.length} reports</div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-6 py-12 text-center text-gray-500">
                No team members yet. Developers will appear when they connect with the DEV Agent.
              </div>
            )}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="font-medium text-gray-900">Activity Feed (Local)</h2>
            <span className="text-sm text-gray-500">{reports.length} reports</span>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {reports.length > 0 ? (
              reports.map(report => (
                <div 
                  key={report.id}
                  className="px-6 py-4 border-b border-gray-100 hover:bg-gray-50"
                  style={{ borderLeftWidth: '4px', borderLeftColor: ACTIVITY_COLORS[report.activity_type] || ACTIVITY_COLORS.other }}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium text-gray-900">{report.developer_name}</span>
                    <span className="text-xs text-gray-500 font-mono">{report.created_at}</span>
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{report.description}</p>
                  <span 
                    className="inline-block text-xs px-2 py-1 rounded text-white"
                    style={{ backgroundColor: ACTIVITY_COLORS[report.activity_type] || ACTIVITY_COLORS.other }}
                  >
                    {report.activity_type}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-6 py-12 text-center text-gray-500">
                No activity reports yet. Reports will appear here in real-time when developers connect.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
