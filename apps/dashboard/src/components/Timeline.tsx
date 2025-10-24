'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { SemanticEvent, formatDuration, getMinutesSince } from '@flowsight/shared';
import { Code2, Globe, Terminal, Video, Clock } from 'lucide-react';

interface TimelineProps {
  events: SemanticEvent[];
}

const activityIcons = {
  coding: Code2,
  browsing: Globe,
  terminal: Terminal,
  meeting: Video,
  testing: Code2,
  debugging: Code2,
  reviewing: Code2,
  idle: Clock,
};

const activityColors = {
  coding: 'bg-blue-100 text-blue-700 border-blue-200',
  browsing: 'bg-purple-100 text-purple-700 border-purple-200',
  terminal: 'bg-green-100 text-green-700 border-green-200',
  meeting: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  testing: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  debugging: 'bg-red-100 text-red-700 border-red-200',
  reviewing: 'bg-pink-100 text-pink-700 border-pink-200',
  idle: 'bg-gray-100 text-gray-700 border-gray-200',
};

export function Timeline({ events }: TimelineProps) {
  const sortedEvents = [...events]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Activity Timeline</h2>
      
      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {sortedEvents.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Clock className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p>No recent activity</p>
          </div>
        ) : (
          sortedEvents.map((event, index) => {
            const ActivityIcon = activityIcons[event.activity] || Clock;
            const colorClass = activityColors[event.activity] || activityColors.idle;
            const minutesAgo = getMinutesSince(new Date(event.timestamp));

            return (
              <motion.div
                key={`${event.devId}-${event.timestamp}-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
              >
                <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center border ${colorClass}`}>
                  <ActivityIcon className="h-5 w-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900 text-sm">
                      {event.devId.split('@')[0]}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDuration(minutesAgo)}
                    </span>
                  </div>

                  <div className="text-sm text-gray-600 mt-1">
                    {event.application || event.activity}
                  </div>

                  {event.ticketId && (
                    <div className="text-xs font-mono text-primary-600 mt-1 font-semibold">
                      {event.ticketId}
                    </div>
                  )}

                  {event.gitBranch && (
                    <div className="text-xs text-gray-500 mt-1 truncate">
                      <span className="font-mono">git:</span> {event.gitBranch}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

