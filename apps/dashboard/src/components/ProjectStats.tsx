'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { DeveloperStatus, Ticket, SemanticEvent } from '@flowsight/shared';
import { Users, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';

interface ProjectStatsProps {
  developers: DeveloperStatus[];
  tickets: Ticket[];
  events: SemanticEvent[];
}

export function ProjectStats({ developers, tickets, events }: ProjectStatsProps) {
  const activeDevelopers = developers.filter(d => {
    const lastActive = new Date(d.lastActiveAt);
    const minutesAgo = (Date.now() - lastActive.getTime()) / 1000 / 60;
    return minutesAgo < 30;
  }).length;

  const completedTickets = tickets.filter(t => t.status === 'done').length;
  const blockedTickets = tickets.filter(t => t.status === 'blocked').length;
  const inProgressTickets = tickets.filter(t => t.status === 'in_progress').length;

  const stats = [
    {
      label: 'Active Developers',
      value: activeDevelopers,
      total: developers.length,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      label: 'Completed',
      value: completedTickets,
      total: tickets.length,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      label: 'In Progress',
      value: inProgressTickets,
      total: tickets.length,
      icon: TrendingUp,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
    },
    {
      label: 'Blocked',
      value: blockedTickets,
      total: tickets.length,
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">{stat.label}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                {stat.total > 0 && (
                  <p className="text-sm text-gray-500">/ {stat.total}</p>
                )}
              </div>
            </div>
            <div className={`${stat.bgColor} p-3 rounded-lg`}>
              <stat.icon className={`h-6 w-6 ${stat.color}`} />
            </div>
          </div>

          {stat.total > 0 && (
            <div className="mt-4">
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(stat.value / stat.total) * 100}%` }}
                  transition={{ duration: 0.5, delay: index * 0.1 + 0.2 }}
                  className={`h-full ${stat.bgColor.replace('100', '600')}`}
                />
              </div>
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}

