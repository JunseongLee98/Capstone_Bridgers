'use client';

import { useState } from 'react';
import { Task, CalendarEvent, TaskDurationStats } from '@/types';
import { CalendarAIAgent } from '@/lib/ai-agent';
import { Sparkles, Zap } from 'lucide-react';

interface AIAgentPanelProps {
  tasks: Task[];
  existingEvents: CalendarEvent[];
  onScheduleTasks: (events: CalendarEvent[]) => void;
}

export default function AIAgentPanel({
  tasks,
  existingEvents,
  onScheduleTasks,
}: AIAgentPanelProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [stats, setStats] = useState<TaskDurationStats[]>([]);

  const handleAnalyze = () => {
    const taskStats = CalendarAIAgent.getTaskDurationStats(tasks);
    setStats(taskStats);
  };

  const handleDistribute = () => {
    setIsProcessing(true);
    
    // Get tasks that aren't completed
    const incompleteTasks = tasks.filter(task => !task.completedAt);
    
    if (incompleteTasks.length === 0) {
      alert('No incomplete tasks to schedule!');
      setIsProcessing(false);
      return;
    }

    // Calculate date range (next 2 weeks)
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 14);
    endDate.setHours(23, 59, 59, 999);

    // Distribute tasks
    const scheduledEvents = CalendarAIAgent.distributeTasks(
      incompleteTasks,
      existingEvents,
      startDate,
      endDate
    );

    if (scheduledEvents.length === 0) {
      alert('No available time slots found. Try adjusting your calendar or task durations.');
    } else {
      onScheduleTasks(scheduledEvents);
      alert(`Successfully scheduled ${scheduledEvents.length} task events!`);
    }

    setIsProcessing(false);
  };

  return (
    <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <Sparkles className="text-primary-600" size={28} />
        <h2 className="text-2xl font-bold text-gray-800">AI Agent</h2>
      </div>

      <p className="text-gray-600 mb-6">
        The AI agent learns from your task completion times and automatically distributes
        tasks across your calendar's empty slots.
      </p>

      <div className="space-y-4">
        <button
          onClick={handleAnalyze}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-primary-700 rounded-lg hover:bg-primary-50 border-2 border-primary-300 transition-colors font-medium"
        >
          <Zap size={20} />
          Analyze Task Durations
        </button>

        {stats.length > 0 && (
          <div className="bg-white rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-3">Task Duration Statistics</h3>
            <div className="space-y-2">
              {stats.map((stat) => {
                const task = tasks.find(t => t.id === stat.taskId);
                return (
                  <div key={stat.taskId} className="text-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">
                        {task?.title || 'Unknown Task'}
                      </span>
                      <span className="text-gray-600">
                        Avg: {stat.averageDuration} min
                      </span>
                    </div>
                    {stat.completionCount > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        Range: {stat.minDuration}-{stat.maxDuration} min ({stat.completionCount}{' '}
                        completions)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={handleDistribute}
          disabled={isProcessing || tasks.filter(t => !t.completedAt).length === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isProcessing ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Processing...
            </>
          ) : (
            <>
              <Sparkles size={20} />
              Distribute Tasks on Calendar
            </>
          )}
        </button>

        <div className="text-xs text-gray-500 mt-4 p-3 bg-white rounded-lg">
          <strong>How it works:</strong>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Tracks how long each task takes on average</li>
            <li>Finds empty time slots in your calendar</li>
            <li>Distributes tasks evenly across available slots</li>
            <li>Prioritizes high-priority tasks first</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

