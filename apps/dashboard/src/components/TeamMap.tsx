'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { DeveloperStatus, Ticket } from '@flowsight/shared';
import { Code2, Globe, Terminal, Video, AlertCircle, Clock } from 'lucide-react';
import { formatDuration, getMinutesSince } from '@flowsight/shared';

interface TeamMapProps {
  developers: DeveloperStatus[];
  tickets: Ticket[];
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

const statusColors = {
  todo: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  blocked: 'bg-red-100 text-red-700',
  in_review: 'bg-yellow-100 text-yellow-700',
  done: 'bg-green-100 text-green-700',
};

export function TeamMap({ developers, tickets }: TeamMapProps) {
  const getTicketForDev = (devId: string, currentTicket?: string) => {
    if (currentTicket) {
      return tickets.find(t => t.ticketId === currentTicket);
    }
    return tickets.find(t => t.assignedTo === devId);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Team Activity</h2>
      
      <div className="space-y-3">
        {developers.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Users className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p>No active developers</p>
          </div>
        ) : (
          developers.map((dev, index) => {
            const ActivityIcon = dev.currentActivity 
              ? activityIcons[dev.currentActivity] 
              : Clock;
            const ticket = getTicketForDev(dev.devId, dev.currentTicket);
            const minutesAgo = dev.lastActiveAt 
              ? getMinutesSince(new Date(dev.lastActiveAt))
              : 999;

            return (
              <motion.div
                key={dev.devId}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 hover:border-primary-300 hover:shadow-md transition-all"
              >
                {/* Avatar */}
                <div className="relative">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-lg">
                    {dev.name.charAt(0).toUpperCase()}
                  </div>
                  {minutesAgo < 5 && (
                    <span className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 border-2 border-white rounded-full"></span>
                  )}
                </div>

                {/* Developer Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{dev.name}</h3>
                    {dev.isBlocked && (
                      <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full">
                        <AlertCircle className="h-3 w-3" />
                        Blocked
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 mt-1">
                    <ActivityIcon className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">{dev.currentApplication || 'Idle'}</span>
                    <span className="text-xs text-gray-400">
                      • {formatDuration(minutesAgo)}
                    </span>
                  </div>

                  {dev.currentFilePath && (
                    <div className="text-xs text-gray-500 mt-1 truncate">
                      {dev.currentFilePath}
                    </div>
                  )}

                  {dev.isBlocked && dev.blockerReason && (
                    <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {dev.blockerReason}
                    </div>
                  )}
                </div>

                {/* Ticket Info */}
                <div className="text-right">
                  {ticket ? (
                    <>
                      <div className="text-sm font-mono font-semibold text-primary-600">
                        {ticket.ticketId}
                      </div>
                      <div className={`text-xs px-2 py-1 rounded-full mt-1 ${statusColors[ticket.status]}`}>
                        {ticket.status.replace('_', ' ')}
                      </div>
                      {ticket.progress > 0 && (
                        <div className="mt-2">
                          <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${ticket.progress}%` }}
                              transition={{ duration: 0.5 }}
                              className="h-full bg-primary-600"
                            />
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">{ticket.progress}%</div>
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-sm text-gray-400">No ticket</span>
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

function Users({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

