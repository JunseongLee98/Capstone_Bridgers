'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Task, CalendarEvent } from '@/types';
import { storage } from '@/lib/storage';
import { CalendarAIAgent } from '@/lib/ai-agent';
import Calendar from '@/components/Calendar';
import { v4 as uuidv4 } from 'uuid';
import { Plus, X, Clock, CheckCircle2, Sparkles, Zap, ChevronDown, Menu, Calendar as CalendarIcon, LogOut, Upload, Link2, Trash2, CheckSquare } from 'lucide-react';
import { parseICSFileFromFile, parseICSFileFromFileAsTasks, fetchICSFromURL } from '@/lib/ics-parser';
import { formatMinutesToHoursMinutes } from '@/lib/time-utils';

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasksDropdownOpen, setTasksDropdownOpen] = useState(false);
  const [analyticsDropdownOpen, setAnalyticsDropdownOpen] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    estimatedDuration: 60,
    priority: 'medium' as 'low' | 'medium' | 'high',
    category: '',
    dueDate: undefined as string | undefined, // ISO string format for date input
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [stats, setStats] = useState<any[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [isLoadingGoogleEvents, setIsLoadingGoogleEvents] = useState(false);
  const [isImportingICS, setIsImportingICS] = useState(false);
  const [icsSubscribedEvents, setICSSubscribedEvents] = useState<CalendarEvent[]>([]);
  const [icsSubscriptions, setICSSubscriptions] = useState<Array<{ id: string; url: string; name: string }>>([]);
  const [isLoadingICSSubscription, setIsLoadingICSSubscription] = useState(false);
  const [newSubscriptionUrl, setNewSubscriptionUrl] = useState('');
  const [newSubscriptionName, setNewSubscriptionName] = useState('');
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [conversionDuration, setConversionDuration] = useState(60); // Default duration in minutes

  const tasksDropdownRef = useRef<HTMLDivElement>(null);
  const analyticsDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tasksFileInputRef = useRef<HTMLInputElement>(null);
  
  // Use refs to track latest state for scheduling
  const googleEventsRef = useRef<CalendarEvent[]>([]);
  const icsSubscribedEventsRef = useRef<CalendarEvent[]>([]);
  
  // Keep refs in sync with state
  useEffect(() => {
    googleEventsRef.current = googleEvents;
  }, [googleEvents]);
  
  useEffect(() => {
    icsSubscribedEventsRef.current = icsSubscribedEvents;
  }, [icsSubscribedEvents]);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedTasks = storage.getTasks();
    const savedEvents = storage.getEvents();
    setTasks(savedTasks);
    setEvents(savedEvents);

    // Check for Google Calendar connection
    const tokens = storage.getGoogleTokens();
    if (tokens?.access_token) {
      setGoogleConnected(true);
      fetchGoogleCalendarEvents();
    }

    // Load ICS subscriptions
    const subscriptions = storage.getICSSubscriptions();
    setICSSubscriptions(subscriptions);
    if (subscriptions.length > 0) {
      fetchAllICSSubscriptions(subscriptions);
    }

    // Handle OAuth callback from URL query params
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');
    const refreshToken = urlParams.get('refresh_token');
    
    if (accessToken) {
      storage.saveGoogleTokens({
        access_token: accessToken,
        refresh_token: refreshToken || undefined,
      });
      setGoogleConnected(true);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
      fetchGoogleCalendarEvents();
    }
  }, []);

  // Auto-refresh ICS subscriptions every 30 minutes
  useEffect(() => {
    if (icsSubscriptions.length === 0) return;

    const interval = setInterval(() => {
      fetchAllICSSubscriptions(icsSubscriptions);
    }, 30 * 60 * 1000); // 30 minutes

    return () => clearInterval(interval);
  }, [icsSubscriptions]);

  // Fetch Google Calendar events
  const fetchGoogleCalendarEvents = async () => {
    const tokens = storage.getGoogleTokens();
    if (!tokens?.access_token) return;

    setIsLoadingGoogleEvents(true);
    try {
      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const response = await fetch(
        `/api/calendar/events?access_token=${tokens.access_token}&timeMin=${timeMin}&timeMax=${timeMax}`
      );

      if (response.ok) {
        const data = await response.json();
        const fetchedEvents = data.events.map((event: CalendarEvent) => ({
          ...event,
          start: new Date(event.start),
          end: new Date(event.end),
        }));
        setGoogleEvents(fetchedEvents);
      } else {
        console.error('Failed to fetch Google Calendar events');
        if (response.status === 401) {
          // Token expired, disconnect
          handleDisconnectGoogle();
        }
      }
    } catch (error) {
      console.error('Error fetching Google Calendar events:', error);
    } finally {
      setIsLoadingGoogleEvents(false);
    }
  };

  // Connect to Google Calendar
  const handleConnectGoogle = async () => {
    try {
      const response = await fetch('/api/auth');
      
      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorData = JSON.parse(errorText);
          alert(`Failed to connect: ${errorData.error || 'Unknown error'}. Make sure you have set up GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env.local file.`);
        } catch {
          alert(`Failed to connect: ${response.status} ${response.statusText}. Make sure your API routes are working and environment variables are set.`);
        }
        return;
      }
      
      const data = await response.json();
      
      if (data.error) {
        alert(`Failed to connect: ${data.error}. Make sure you have set up GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env.local file.`);
        return;
      }
      
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        alert('Failed to get authentication URL. Please check your configuration.');
      }
    } catch (error: any) {
      console.error('Error connecting to Google Calendar:', error);
      const errorMessage = error.message || 'Network error';
      alert(`Failed to connect to Google Calendar: ${errorMessage}. Make sure the dev server is running and API routes are accessible.`);
    }
  };

  // Disconnect from Google Calendar
  const handleDisconnectGoogle = () => {
    storage.clearGoogleTokens();
    setGoogleConnected(false);
    setGoogleEvents([]);
  };

  // Handle ICS file import
  const handleImportICS = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.ics') && !file.type.includes('calendar')) {
      alert('Please select a valid ICS calendar file (.ics)');
      return;
    }

    setIsImportingICS(true);
    try {
      const importedEvents = await parseICSFileFromFile(file);
      
      if (importedEvents.length === 0) {
        alert('No events found in the ICS file.');
      } else {
        // Merge with existing events (avoid duplicates by checking IDs)
        const existingIds = new Set(events.map(e => e.id));
        const newEvents = importedEvents.filter(e => !existingIds.has(e.id));
        
        setEvents([...events, ...newEvents]);
        alert(`Successfully imported ${newEvents.length} event(s) from ${file.name}`);
      }
    } catch (error: any) {
      console.error('Error importing ICS file:', error);
      alert(`Failed to import ICS file: ${error.message || 'Unknown error'}`);
    } finally {
      setIsImportingICS(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Handle ICS file import as tasks
  const handleImportTasksFromICS = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.ics') && !file.type.includes('calendar')) {
      alert('Please select a valid ICS calendar file (.ics)');
      return;
    }

    setIsImportingICS(true);
    try {
      const importedTasks = await parseICSFileFromFileAsTasks(file);
      
      if (importedTasks.length === 0) {
        alert('No tasks found in the ICS file.');
      } else {
        // Add each imported task
        for (const taskData of importedTasks) {
          await handleAddTask(taskData);
        }
        alert(`Successfully imported ${importedTasks.length} task(s) from ${file.name}`);
      }
    } catch (error: any) {
      console.error('Error importing tasks from ICS file:', error);
      alert(`Failed to import tasks from ICS file: ${error.message || 'Unknown error'}`);
    } finally {
      setIsImportingICS(false);
      // Reset file input
      if (tasksFileInputRef.current) {
        tasksFileInputRef.current.value = '';
      }
    }
  };

  const triggerTasksFileInput = () => {
    tasksFileInputRef.current?.click();
  };

  // Fetch all ICS subscriptions
  const fetchAllICSSubscriptions = async (subscriptions: Array<{ id: string; url: string; name: string }> = icsSubscriptions) => {
    setIsLoadingICSSubscription(true);
    try {
      const allEvents: CalendarEvent[] = [];
      
      await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            const events = await fetchICSFromURL(subscription.url);
            // Tag events with subscription ID to differentiate them
            const taggedEvents = events.map(event => ({
              ...event,
              id: `ics-sub-${subscription.id}-${event.id}`,
              color: '#8b5cf6', // Purple for subscribed calendars
            }));
            allEvents.push(...taggedEvents);
          } catch (error) {
            console.error(`Failed to fetch subscription ${subscription.name}:`, error);
          }
        })
      );
      
      setICSSubscribedEvents(allEvents);
    } catch (error) {
      console.error('Error fetching ICS subscriptions:', error);
    } finally {
      setIsLoadingICSSubscription(false);
    }
  };

  // Add new ICS subscription
  const handleAddICSSubscription = async () => {
    if (!newSubscriptionUrl.trim()) {
      alert('Please enter a calendar URL');
      return;
    }

    try {
      // Validate URL
      const urlObj = new URL(newSubscriptionUrl);
      
      // Only allow HTTPS for security
      if (urlObj.protocol !== 'https:') {
        alert('Only HTTPS URLs are supported for security reasons');
        return;
      }
      
      // Test fetch to make sure it works
      setIsLoadingICSSubscription(true);
      await fetchICSFromURL(newSubscriptionUrl);
      
      // Add subscription
      const name = newSubscriptionName.trim() || urlObj.hostname;
      storage.addICSSubscription(newSubscriptionUrl, name);
      
      const updatedSubscriptions = storage.getICSSubscriptions();
      setICSSubscriptions(updatedSubscriptions);
      
      // Fetch events from new subscription
      await fetchAllICSSubscriptions(updatedSubscriptions);
      
      setNewSubscriptionUrl('');
      setNewSubscriptionName('');
      setShowSubscriptionDialog(false);
      alert('Calendar subscription added successfully!');
    } catch (error: any) {
      console.error('Error adding subscription:', error);
      const errorMessage = error.message || 'Unknown error';
      alert(`Failed to add subscription: ${errorMessage}\n\nCommon issues:\n- Invalid URL format\n- Calendar feed not publicly accessible\n- CORS restrictions\n- Network connectivity issues`);
    } finally {
      setIsLoadingICSSubscription(false);
    }
  };

  // Remove ICS subscription
  const handleRemoveICSSubscription = async (id: string) => {
    storage.removeICSSubscription(id);
    const updatedSubscriptions = storage.getICSSubscriptions();
    setICSSubscriptions(updatedSubscriptions);
    
    // Remove events from this subscription
    setICSSubscribedEvents(icsSubscribedEvents.filter(e => !e.id.startsWith(`ics-sub-${id}-`)));
    
    // Refresh remaining subscriptions
    if (updatedSubscriptions.length > 0) {
      await fetchAllICSSubscriptions(updatedSubscriptions);
    } else {
      setICSSubscribedEvents([]);
    }
  };

  // Save to localStorage whenever data changes
  useEffect(() => {
    storage.saveTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    storage.saveEvents(events);
  }, [events]);

  // Merge all events for display
  const allEvents = useMemo(() => {
    const localEvents = events.filter(e => !e.id.startsWith('google-') && !e.id.startsWith('ics-sub-'));
    return [...localEvents, ...googleEvents, ...icsSubscribedEvents];
  }, [events, googleEvents, icsSubscribedEvents]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tasksDropdownRef.current && !tasksDropdownRef.current.contains(event.target as Node)) {
        setTasksDropdownOpen(false);
      }
      if (analyticsDropdownRef.current && !analyticsDropdownRef.current.contains(event.target as Node)) {
        setAnalyticsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddTask = async (taskData: {
    title: string;
    description?: string;
    estimatedDuration?: number;
    priority: 'low' | 'medium' | 'high';
    category?: string;
    dueDate?: string;
  }) => {
    const newTask: Task = {
      title: taskData.title,
      description: taskData.description,
      estimatedDuration: taskData.estimatedDuration,
      priority: taskData.priority,
      category: taskData.category,
      dueDate: taskData.dueDate ? new Date(taskData.dueDate) : undefined,
      id: uuidv4(),
      createdAt: new Date(),
      actualDurations: [],
    };
    const updatedTasks = [...tasks, newTask];
    setTasks(updatedTasks);
    setNewTask({
      title: '',
      description: '',
      estimatedDuration: 60,
      priority: 'medium',
      category: '',
      dueDate: undefined,
    });
    setIsAddingTask(false);
    
    // Automatically schedule the newly created task
    scheduleNewTask(newTask);
  };

  // Schedule a single new task immediately
  const scheduleNewTask = (task: Task) => {
    if (task.completedAt) {
      return; // Don't schedule completed tasks
    }

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 14);
    endDate.setHours(23, 59, 59, 999);

    // Use functional update with refs to ensure we have the latest state
    setEvents(prevEvents => {
      // Use refs to get the latest googleEvents and icsSubscribedEvents
      const allExistingEvents = [
        ...prevEvents, 
        ...googleEventsRef.current, 
        ...icsSubscribedEventsRef.current
      ];
      
      // Schedule just this new task
      const scheduledEvents = CalendarAIAgent.distributeTasks(
        [task],
        allExistingEvents,
        startDate,
        endDate
      );

      if (scheduledEvents.length > 0) {
        // Add the scheduled event to the events state
        return [...prevEvents, ...scheduledEvents];
      }
      
      return prevEvents;
    });
  };

  // Auto-distribute tasks function (for manual distribution)
  const autoDistributeTasks = async (tasksToSchedule: Task[] = tasks) => {
    const incompleteTasks = tasksToSchedule.filter(task => !task.completedAt);
    
    if (incompleteTasks.length === 0) {
      return; // No tasks to schedule
    }

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 14);
    endDate.setHours(23, 59, 59, 999);

    // Get current events using functional update to ensure we have latest state
    setEvents(currentEvents => {
      const allExistingEvents = [...currentEvents, ...googleEvents, ...icsSubscribedEvents];
      
      // Filter out already scheduled tasks (those with taskId in events)
      const scheduledTaskIds = new Set(currentEvents.filter(e => e.taskId).map(e => e.taskId));
      const unscheduledTasks = incompleteTasks.filter(task => !scheduledTaskIds.has(task.id));
      
      if (unscheduledTasks.length === 0) {
        return currentEvents; // All tasks already scheduled
      }

      const scheduledEvents = CalendarAIAgent.distributeTasks(
        unscheduledTasks,
        allExistingEvents,
        startDate,
        endDate
      );

      if (scheduledEvents.length > 0) {
        return [...currentEvents, ...scheduledEvents];
      }
      
      return currentEvents;
    });
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks(tasks.filter(task => task.id !== taskId));
    setEvents(events.filter(event => event.taskId !== taskId));
  };

  const handleCompleteTask = (taskId: string, actualDuration: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      const updatedTask = CalendarAIAgent.recordTaskCompletion(task, actualDuration);
      setTasks(tasks.map(t => (t.id === taskId ? updatedTask : t)));
    }
  };

  const handleScheduleTasks = (scheduledEvents: CalendarEvent[]) => {
    setEvents([...events, ...scheduledEvents]);
  };

  const handleAnalyze = () => {
    const taskStats = CalendarAIAgent.getTaskDurationStats(tasks);
    setStats(taskStats);
  };

  const handleDistribute = async () => {
    setIsProcessing(true);
    await autoDistributeTasks();
    
    const incompleteTasks = tasks.filter(task => !task.completedAt);
    if (incompleteTasks.length === 0) {
      alert('No incomplete tasks to schedule!');
    } else {
      alert('Tasks have been distributed on your calendar!');
    }

    setIsProcessing(false);
    setAnalyticsDropdownOpen(false);
  };

  const handleSelectSlot = (slot: { start: Date; end: Date }) => {
    const title = prompt('Enter event title:');
    if (title) {
      const newEvent: CalendarEvent = {
        id: uuidv4(),
        title,
        start: slot.start,
        end: slot.end,
        isScheduled: false,
        color: '#6366f1',
      };
      setEvents([...events, newEvent]);
    }
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    // Calculate suggested duration from event
    const durationMs = event.end.getTime() - event.start.getTime();
    const durationMinutes = Math.round(durationMs / (1000 * 60));
    // Set default duration (use calculated if > 0, otherwise 60 minutes)
    setConversionDuration(durationMinutes > 0 && durationMinutes < 1440 ? durationMinutes : 60);
    setShowEventDialog(true);
  };

  // Convert event to task
  const handleConvertEventToTask = async (event: CalendarEvent) => {
    // Use the user-specified duration
    const dueDate = event.start;
    
    // Create task from event
    const taskData = {
      title: event.title,
      description: event.description,
      estimatedDuration: conversionDuration,
      priority: 'medium' as const,
      category: '',
      dueDate: dueDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
    };

    await handleAddTask(taskData);
    
    // Optionally remove the event (or keep it)
    if (confirm('Task created! Do you want to remove this event from the calendar?')) {
      setEvents(events.filter(e => e.id !== event.id));
      // Also remove from Google events or ICS subscribed events if applicable
      setGoogleEvents(googleEvents.filter(e => e.id !== event.id));
      setICSSubscribedEvents(icsSubscribedEvents.filter(e => e.id !== event.id));
    }
    
    setShowEventDialog(false);
    setSelectedEvent(null);
    setConversionDuration(60); // Reset to default
  };

  // Delete event
  const handleDeleteEvent = (event: CalendarEvent) => {
    if (confirm('Delete this event?')) {
      setEvents(events.filter(e => e.id !== event.id));
      // Also remove from other event sources if applicable
      setGoogleEvents(googleEvents.filter(e => e.id !== event.id));
      setICSSubscribedEvents(icsSubscribedEvents.filter(e => e.id !== event.id));
    }
    setShowEventDialog(false);
    setSelectedEvent(null);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getAverageDuration = (task: Task) => {
    if (task.actualDurations.length === 0) {
      return task.estimatedDuration || 60;
    }
    const sum = task.actualDurations.reduce((acc, d) => acc + d, 0);
    return Math.round(sum / task.actualDurations.length);
  };

  const incompleteTasksCount = tasks.filter(t => !t.completedAt).length;

  return (
    <main className="h-screen flex flex-col bg-gray-50">
      {/* Header with dropdowns */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Cadence</h1>
              <p className="text-sm text-gray-600">AI-powered calendar</p>
            </div>
            
            <div className="flex items-center gap-4 relative">
              {/* ICS File Import & Subscribe */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".ics,text/calendar"
                onChange={handleImportICS}
                className="hidden"
                disabled={isImportingICS}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={triggerFileInput}
                  disabled={isImportingICS}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 border border-purple-300 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50"
                  title="Import ICS calendar file"
                >
                  <Upload size={20} />
                  {isImportingICS ? 'Importing...' : 'Import ICS'}
                </button>
                <button
                  onClick={() => setShowSubscriptionDialog(!showSubscriptionDialog)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white border border-purple-700 rounded-lg hover:bg-purple-700 transition-colors"
                  title="Subscribe to ICS calendar URL"
                >
                  <Link2 size={20} />
                  Subscribe
                </button>
              </div>

              {/* Subscription Dialog */}
              {showSubscriptionDialog && (
                <div className="absolute right-0 top-12 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 p-4">
                  <h3 className="text-lg font-bold text-gray-800 mb-3">Subscribe to Calendar</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Calendar URL *
                      </label>
                      <input
                        type="url"
                        value={newSubscriptionUrl}
                        onChange={(e) => setNewSubscriptionUrl(e.target.value)}
                        placeholder="https://calendar.google.com/calendar/ical/..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Enter a public ICS calendar feed URL
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Calendar Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={newSubscriptionName}
                        onChange={(e) => setNewSubscriptionName(e.target.value)}
                        placeholder="My Calendar"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    {icsSubscriptions.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Subscribed Calendars
                        </label>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {icsSubscriptions.map((sub) => (
                            <div key={sub.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{sub.name}</p>
                                <p className="text-xs text-gray-500 truncate">{sub.url}</p>
                              </div>
                              <button
                                onClick={() => handleRemoveICSSubscription(sub.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Remove subscription"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddICSSubscription}
                        disabled={isLoadingICSSubscription || !newSubscriptionUrl.trim()}
                        className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isLoadingICSSubscription ? 'Adding...' : 'Add Subscription'}
                      </button>
                      <button
                        onClick={() => {
                          setShowSubscriptionDialog(false);
                          setNewSubscriptionUrl('');
                          setNewSubscriptionName('');
                        }}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Google Calendar Connection */}
              {!googleConnected ? (
                <button
                  onClick={handleConnectGoogle}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <CalendarIcon size={20} />
                  Connect Google Calendar
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchGoogleCalendarEvents}
                    disabled={isLoadingGoogleEvents}
                    className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 border border-green-300 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
                    title="Refresh Google Calendar events"
                  >
                    <CalendarIcon size={20} />
                    {isLoadingGoogleEvents ? 'Syncing...' : 'Google Calendar'}
                  </button>
                  <button
                    onClick={handleDisconnectGoogle}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Disconnect Google Calendar"
                  >
                    <LogOut size={18} />
                  </button>
                </div>
              )}

              {/* Tasks Dropdown */}
              <div className="relative" ref={tasksDropdownRef}>
                <button
                  onClick={() => {
                    setTasksDropdownOpen(!tasksDropdownOpen);
                    setAnalyticsDropdownOpen(false);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Menu size={20} />
                  Tasks
                  {incompleteTasksCount > 0 && (
                    <span className="bg-white text-primary-600 text-xs font-bold px-2 py-0.5 rounded-full">
                      {incompleteTasksCount}
                    </span>
                  )}
                  <ChevronDown size={16} />
                </button>
                
                {tasksDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-[calc(100vh-120px)] overflow-y-auto">
                    <div className="p-4 border-b border-gray-200">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-gray-800">Tasks</h2>
                        <div className="flex gap-2">
                          <input
                            ref={tasksFileInputRef}
                            type="file"
                            accept=".ics,text/calendar"
                            onChange={handleImportTasksFromICS}
                            className="hidden"
                            disabled={isImportingICS}
                          />
                          <button
                            onClick={triggerTasksFileInput}
                            disabled={isImportingICS}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                            title="Import tasks from ICS file"
                          >
                            <Upload size={14} />
                            Import ICS
                          </button>
                          <button
                            onClick={() => setIsAddingTask(!isAddingTask)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors"
                          >
                            <Plus size={16} />
                            Add Task
                          </button>
                        </div>
                      </div>

                      {isAddingTask && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (newTask.title.trim()) {
                              handleAddTask(newTask);
                            }
                          }}
                          className="mb-4 p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="space-y-3">
                            <input
                              type="text"
                              value={newTask.title}
                              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                              placeholder="Task title *"
                              required
                            />
                            <textarea
                              value={newTask.description}
                              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                              placeholder="Description"
                              rows={2}
                            />
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Estimated Duration
                              </label>
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  value={newTask.estimatedDuration || ''}
                                  onChange={(e) => {
                                    const value = parseInt(e.target.value) || 0;
                                    setNewTask({ ...newTask, estimatedDuration: value });
                                  }}
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                  placeholder="Minutes"
                                  min="0"
                                />
                                <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 min-w-[140px] flex items-center">
                                  {formatMinutesToHoursMinutes(newTask.estimatedDuration || 0)}
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Due Date (Optional)
                                </label>
                                <input
                                  type="date"
                                  value={newTask.dueDate || ''}
                                  onChange={(e) =>
                                    setNewTask({ ...newTask, dueDate: e.target.value || undefined })
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Priority
                                </label>
                                <select
                                  value={newTask.priority}
                                  onChange={(e) =>
                                    setNewTask({ ...newTask, priority: e.target.value as 'low' | 'medium' | 'high' })
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                >
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                                </select>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                className="flex-1 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
                              >
                                Add
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsAddingTask(false)}
                                className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </form>
                      )}
                    </div>

                    <div className="p-4 space-y-2">
                      {tasks.length === 0 ? (
                        <p className="text-gray-500 text-center py-4 text-sm">No tasks yet</p>
                      ) : (
                        tasks.map((task) => (
                          <div
                            key={task.id}
                            className="p-3 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-semibold text-gray-800 text-sm truncate">{task.title}</h3>
                                  <span
                                    className={`px-1.5 py-0.5 text-xs font-medium rounded border flex-shrink-0 ${getPriorityColor(
                                      task.priority
                                    )}`}
                                  >
                                    {task.priority}
                                  </span>
                                </div>
                                {task.description && (
                                  <p className="text-xs text-gray-600 mb-1 line-clamp-1">{task.description}</p>
                                )}
                                <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                                  <div className="flex items-center gap-1">
                                    <Clock size={12} />
                                    <span>Avg: {formatMinutesToHoursMinutes(getAverageDuration(task))}</span>
                                  </div>
                                  {task.actualDurations.length > 0 && (
                                    <span className="text-gray-400">({task.actualDurations.length} completed)</span>
                                  )}
                                  {task.dueDate && (
                                    <span className="text-orange-600">
                                      Due: {new Date(task.dueDate).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 ml-2">
                                {!task.completedAt && (
                                  <button
                                    onClick={() => {
                                      const duration = prompt('How long did this task actually take? (in minutes)');
                                      if (duration) {
                                        handleCompleteTask(task.id, parseInt(duration));
                                      }
                                    }}
                                    className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                                    title="Mark as completed"
                                  >
                                    <CheckCircle2 size={16} />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteTask(task.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Delete task"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* AI Analytics (single button) */}
              <button
                onClick={async () => {
                  setIsProcessing(true);
                  const taskStats = CalendarAIAgent.getTaskDurationStats(tasks);
                  setStats(taskStats);
                  await autoDistributeTasks();
                  setIsProcessing(false);
                }}
                disabled={isProcessing || incompleteTasksCount === 0}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg hover:from-primary-600 hover:to-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <Sparkles size={20} />
                    AI Analytics
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Full-width Calendar */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full w-full p-4">
          <div className="h-full w-full bg-white rounded-lg shadow-lg p-6">
            <Calendar
              events={allEvents}
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
            />
          </div>
        </div>
      </div>

      {/* Event Dialog - Convert to Task or Delete */}
      {showEventDialog && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Convert Event to Task</h3>
            <div className="mb-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Event:</p>
                <p className="text-lg text-gray-900">{selectedEvent.title}</p>
                {selectedEvent.description && (
                  <p className="text-sm text-gray-600 mt-1">{selectedEvent.description}</p>
                )}
                <div className="mt-2 text-xs text-gray-500">
                  <p>Date: {selectedEvent.start.toLocaleDateString()}</p>
                  <p>Time: {selectedEvent.start.toLocaleTimeString()} - {selectedEvent.end.toLocaleTimeString()}</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Task Duration
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={conversionDuration}
                    onChange={(e) => setConversionDuration(parseInt(e.target.value) || 60)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Minutes"
                    min="0"
                  />
                  <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 min-w-[140px]">
                    {formatMinutesToHoursMinutes(conversionDuration)}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  How long will this task take to complete?
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleConvertEventToTask(selectedEvent)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <CheckSquare size={18} />
                Convert to Task
              </button>
              <button
                onClick={() => handleDeleteEvent(selectedEvent)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 size={18} />
              </button>
              <button
                onClick={() => {
                  setShowEventDialog(false);
                  setSelectedEvent(null);
                  setConversionDuration(60);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

