'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Task, CalendarEvent } from '@/types';
import { storage } from '@/lib/storage';
import { CalendarAIAgent } from '@/lib/ai-agent';
import { SCHEDULE_MAX_HORIZON_DAYS } from '@/lib/schedule-constants';
import { formatDateToLocalISO, parseLocalDateInput } from '@/lib/date-utils';
import Calendar from '@/components/Calendar';
import { v4 as uuidv4 } from 'uuid';
import Image from 'next/image';
import { Plus, X, Clock, CheckCircle2, ChevronDown, Menu, Calendar as CalendarIcon, Upload, Link2, Trash2, CheckSquare, Settings, Sparkles } from 'lucide-react';
import { parseICSFileFromFile, parseICSFileFromFileAsTasks, fetchICSFromURL } from '@/lib/ics-parser';
import { formatMinutesToHoursMinutes } from '@/lib/time-utils';

function dedupeCalendarEventsById(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasksDropdownOpen, setTasksDropdownOpen] = useState(false);
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
  const [icsSubscriptions, setICSSubscriptions] = useState<
    Array<{ id: string; url: string; name: string; color?: string }>
  >([]);
  const [isLoadingICSSubscription, setIsLoadingICSSubscription] = useState(false);
  const [newSubscriptionUrl, setNewSubscriptionUrl] = useState('');
  const [newSubscriptionName, setNewSubscriptionName] = useState('');
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false);
  const [openColorMenuId, setOpenColorMenuId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [isDecomposingEvent, setIsDecomposingEvent] = useState(false);
  const [conversionDuration, setConversionDuration] = useState(60); // Default duration in minutes
  const [workHours, setWorkHours] = useState<{ segments: { startHour: number; endHour: number }[] }>({
    segments: [{ startHour: 9, endHour: 18 }],
  });
  const [showWorkHoursDialog, setShowWorkHoursDialog] = useState(false);
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [tempWorkHours, setTempWorkHours] = useState<{ segments: { startHour: number; endHour: number }[] }>({
    segments: [{ startHour: 9, endHour: 18 }],
  });
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [breakAfterEvents, setBreakAfterEvents] = useState(5);
  const [tempBreakAfterEvents, setTempBreakAfterEvents] = useState(5);
  const [focusMinutes, setFocusMinutes] = useState(50);
  const [tempFocusMinutes, setTempFocusMinutes] = useState(50);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [taskDurationMode, setTaskDurationMode] = useState<'preset' | 'custom'>('preset');
  const [taskDurationCustomHours, setTaskDurationCustomHours] = useState(1);
  const [conversionDurationMode, setConversionDurationMode] = useState<'preset' | 'custom'>('preset');
  const [conversionDurationCustomHours, setConversionDurationCustomHours] = useState(1);

  const tasksDropdownRef = useRef<HTMLDivElement>(null);
  const subscriptionColorMenuRef = useRef<HTMLDivElement>(null);
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

  // Color palette for subscribed ICS calendars (pastels + a few stronger options)
  const ICS_SUBSCRIPTION_COLORS = [
    '#bfdbfe', '#93c5fd', '#60a5fa', // blues
    '#bbf7d0', '#86efac', '#4ade80', // greens
    '#fed7aa', '#fdba74', '#fb923c', // oranges
    '#fecaca', '#fca5a5', '#f87171', // reds
    '#e9d5ff', '#d8b4fe', '#c084fc', // purples
    '#fbcfe8', '#f9a8d4', '#f472b6', // pinks
    '#e0e7ff', '#c7d2fe', '#a5b4fc', // indigo
    '#fef3c7', '#fde68a', '#fcd34d', // yellows
  ];

  // Load data from localStorage on mount
  useEffect(() => {
    const savedTasks = storage.getTasks();
    const savedEvents = storage.getEvents();
    setTasks(savedTasks);
    setEvents(savedEvents);

    // Load work hours
    const savedWorkHours = storage.getWorkHours();
    setWorkHours(savedWorkHours);
    setTempWorkHours(savedWorkHours);

    // Load scheduling settings
    setBreakAfterEvents(storage.getBreakAfterEvents());
    setTempBreakAfterEvents(storage.getBreakAfterEvents());
    setFocusMinutes(storage.getFocusMinutes());
    setTempFocusMinutes(storage.getFocusMinutes());

    // Check for Google Calendar connection
    const tokens = storage.getGoogleTokens();
    if (tokens?.access_token) {
      setGoogleConnected(true);
      fetchGoogleCalendarEvents();
    }

    // Load ICS subscriptions
    const rawSubscriptions = storage.getICSSubscriptions();
    // Ensure each subscription has a color assigned
    const subscriptionsWithColors = rawSubscriptions.map((sub, index) => ({
      ...sub,
      color:
        sub.color ||
        ICS_SUBSCRIPTION_COLORS[index % ICS_SUBSCRIPTION_COLORS.length],
    }));
    setICSSubscriptions(subscriptionsWithColors);
    if (subscriptionsWithColors.length > 0) {
      // Persist colors for any existing subscriptions that didn't have one
      storage.saveICSSubscriptions(subscriptionsWithColors);
      fetchAllICSSubscriptions(subscriptionsWithColors);
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

  // Auto-refresh ICS subscriptions more often so they feel live
  useEffect(() => {
    if (icsSubscriptions.length === 0) return;

    const refresh = () => fetchAllICSSubscriptions(icsSubscriptions);
    const intervalMs = 5 * 60 * 1000; // 5 minutes
    const interval = setInterval(refresh, intervalMs);

    // Also refresh when user returns to the tab so calendar is up to date
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [icsSubscriptions]);

  // Fetch Google Calendar events
  const fetchGoogleCalendarEvents = async () => {
    const tokens = storage.getGoogleTokens();
    if (!tokens?.access_token) return;

    setIsLoadingGoogleEvents(true);
    try {
      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(
        now.getTime() + SCHEDULE_MAX_HORIZON_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();

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
  const fetchAllICSSubscriptions = async (
    subscriptions: Array<{ id: string; url: string; name: string; color?: string }> = icsSubscriptions
  ) => {
    setIsLoadingICSSubscription(true);
    try {
      const allEvents: CalendarEvent[] = [];
      
      await Promise.all(
        subscriptions.map(async (subscription, index) => {
          try {
            const events = await fetchICSFromURL(subscription.url);
            // Tag events with subscription ID to differentiate them
            const taggedEvents = events.map(event => ({
              ...event,
              id: `ics-sub-${subscription.id}-${event.id}`,
              color:
                subscription.color ||
                ICS_SUBSCRIPTION_COLORS[index % ICS_SUBSCRIPTION_COLORS.length],
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
      // Normalize and validate URL
      const rawUrl = newSubscriptionUrl.trim();
      let finalUrl = rawUrl;
      let displayName = newSubscriptionName.trim();
      let urlObj = new URL(rawUrl);

      // Support Google Calendar embed URLs by converting them to ICS feed URLs
      if (
        urlObj.hostname === 'calendar.google.com' &&
        urlObj.pathname.startsWith('/calendar/embed')
      ) {
        const src = urlObj.searchParams.get('src');
        if (src) {
          const encodedSrc = encodeURIComponent(src);
          finalUrl = `https://calendar.google.com/calendar/ical/${encodedSrc}/public/basic.ics`;
          urlObj = new URL(finalUrl);

          if (!displayName) {
            displayName = src.includes('@') ? src.split('@')[0] : src;
          }
        }
      }
      
      // Only allow HTTPS for security
      if (urlObj.protocol !== 'https:') {
        alert('Only HTTPS URLs are supported for security reasons');
        return;
      }
      
      // Test fetch to make sure it works
      setIsLoadingICSSubscription(true);
      await fetchICSFromURL(finalUrl);
      
      // Add subscription (color will be auto-assigned from palette)
      const name = displayName || urlObj.hostname;
      storage.addICSSubscription(finalUrl, name);
      
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

  // Set color of an ICS subscription (from palette or custom picker)
  const handleSetICSSubscriptionColor = (id: string, color: string) => {
    setOpenColorMenuId(null);
    setICSSubscriptions(prev => {
      const updated = prev.map(sub =>
        sub.id === id ? { ...sub, color } : sub
      );
      storage.saveICSSubscriptions(updated);
      fetchAllICSSubscriptions(updated);
      return updated;
    });
  };

  // Save to localStorage whenever data changes
  useEffect(() => {
    storage.saveTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    storage.saveEvents(events);
  }, [events]);

  // Merge all events for display. Cadence (local) events must come **last** so react-big-calendar
  // paints them above Google/ICS when times overlap; otherwise task blocks sit underneath and look missing.
  const allEvents = useMemo(() => {
    const localEvents = events.filter(e => !e.id.startsWith('google-') && !e.id.startsWith('ics-sub-'));
    return [...googleEvents, ...icsSubscribedEvents, ...localEvents];
  }, [events, googleEvents, icsSubscribedEvents]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tasksDropdownRef.current && !tasksDropdownRef.current.contains(event.target as Node)) {
        setTasksDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close subscription color palette when clicking outside
  useEffect(() => {
    if (!openColorMenuId) return;
    const close = (e: MouseEvent) => {
      if (subscriptionColorMenuRef.current && !subscriptionColorMenuRef.current.contains(e.target as Node)) {
        setOpenColorMenuId(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openColorMenuId]);

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
      estimatedDuration: CalendarAIAgent.coerceEstimatedMinutes(taskData.estimatedDuration),
      priority: taskData.priority,
      category: taskData.category,
      dueDate: taskData.dueDate ? parseLocalDateInput(taskData.dueDate) : undefined,
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
    setShowAddTaskDialog(false);
    setTaskDurationMode('preset');

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
    const endDate = CalendarAIAgent.computeScheduleEndDate([task], startDate);

    // Use functional update with refs to ensure we have the latest state
    setEvents(prevEvents => {
      const allExistingEvents = dedupeCalendarEventsById([
        ...prevEvents,
        ...googleEventsRef.current,
        ...icsSubscribedEventsRef.current,
      ]);

      const segments =
        workHours.segments.length > 0 &&
        workHours.segments.some((s) => s.startHour < s.endHour)
          ? workHours.segments
          : storage.getWorkHours().segments;

      const breakMinutes = storage.getBreakAfterEvents();
      const focusMinutes = storage.getFocusMinutes();
      const scheduledEvents = CalendarAIAgent.distributeTasks(
        [task],
        allExistingEvents,
        startDate,
        endDate,
        segments,
        breakMinutes,
        focusMinutes
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
    const endDate = CalendarAIAgent.computeScheduleEndDate(incompleteTasks, startDate);

    // Get current events using functional update to ensure we have latest state
    setEvents(currentEvents => {
      const allExistingEvents = dedupeCalendarEventsById([
        ...currentEvents,
        ...googleEvents,
        ...icsSubscribedEvents,
      ]);

      // Filter out already scheduled tasks (those with taskId in events)
      const scheduledTaskIds = new Set(currentEvents.filter(e => e.taskId).map(e => e.taskId));
      const unscheduledTasks = incompleteTasks.filter(task => !scheduledTaskIds.has(task.id));
      
      if (unscheduledTasks.length === 0) {
        return currentEvents; // All tasks already scheduled
      }

      const segments =
        workHours.segments.length > 0 &&
        workHours.segments.some((s) => s.startHour < s.endHour)
          ? workHours.segments
          : storage.getWorkHours().segments;

      const breakMinutes = storage.getBreakAfterEvents();
      const focusMinutes = storage.getFocusMinutes();
      const scheduledEvents = CalendarAIAgent.distributeTasks(
        unscheduledTasks,
        allExistingEvents,
        startDate,
        endDate,
        segments,
        breakMinutes,
        focusMinutes
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

  const isValidWorkHours = (config: { segments: { startHour: number; endHour: number }[] }) => {
    if (!config || !Array.isArray(config.segments) || config.segments.length === 0) {
      return false;
    }
    return config.segments.every(
      (segment) => typeof segment.startHour === 'number' && typeof segment.endHour === 'number' && segment.startHour < segment.endHour
    );
  };

  const isTempWorkHoursValid = isValidWorkHours(tempWorkHours);

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
      dueDate: formatDateToLocalISO(dueDate), // Format as YYYY-MM-DD in device local timezone
    };

    // Create the task object
    const newTask: Task = {
      title: taskData.title,
      description: taskData.description,
      estimatedDuration: CalendarAIAgent.coerceEstimatedMinutes(taskData.estimatedDuration),
      priority: taskData.priority,
      category: taskData.category,
      dueDate: taskData.dueDate ? parseLocalDateInput(taskData.dueDate) : undefined,
      id: uuidv4(),
      createdAt: new Date(),
      actualDurations: [],
    };

    // Add task to state
    const updatedTasks = [...tasks, newTask];
    setTasks(updatedTasks);

    // Close dialog first
    setShowEventDialog(false);
    setSelectedEvent(null);
    setConversionDuration(60); // Reset to default

    // Schedule the task immediately
    scheduleNewTask(newTask);
    
    // Optionally remove the event (or keep it)
    if (confirm('Task created and scheduled! Do you want to remove this event from the calendar?')) {
      setEvents(prevEvents => prevEvents.filter(e => e.id !== event.id));
      // Also remove from Google events or ICS subscribed events if applicable
      setGoogleEvents(prevEvents => prevEvents.filter(e => e.id !== event.id));
      setICSSubscribedEvents(prevEvents => prevEvents.filter(e => e.id !== event.id));
    }
  };

  // Break down event into steps using AI (reads description, creates subtasks, schedules them)
  const handleBreakDownWithAI = async (event: CalendarEvent) => {
    setIsDecomposingEvent(true);
    try {
      const res = await fetch('/api/assignments/decompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: event.title,
          description: event.description ?? undefined,
          dueDate: event.start.toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }
      const { subtasks } = await res.json();
      if (!Array.isArray(subtasks) || subtasks.length === 0) {
        throw new Error('No subtasks returned');
      }

      const ordered = [...subtasks].sort(
        (a: { order: number }, b: { order: number }) => a.order - b.order
      );
      const dueDay = event.start ? parseLocalDateInput(formatDateToLocalISO(event.start)) : undefined;
      const newTasks: Task[] = ordered.map(
        (st: { title: string; description?: string; estimatedMinutes?: number; order: number }) => ({
          id: uuidv4(),
          title: st.title,
          description: st.description,
          estimatedDuration: st.estimatedMinutes ?? 60,
          priority: 'medium',
          category: '',
          dueDate: dueDay,
          planStepOrder: st.order,
          createdAt: new Date(),
          actualDurations: [],
        })
      );

      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      const endDate = CalendarAIAgent.computeScheduleEndDate(newTasks, startDate);
      const allExistingEvents = dedupeCalendarEventsById([
        ...events,
        ...googleEventsRef.current,
        ...icsSubscribedEventsRef.current,
      ]);
      const segments =
        workHours.segments.length > 0 &&
        workHours.segments.some((s) => s.startHour < s.endHour)
          ? workHours.segments
          : storage.getWorkHours().segments;
      const breakMinutes = storage.getBreakAfterEvents();
      const focusMinutes = storage.getFocusMinutes();
      const scheduledEvents = CalendarAIAgent.distributeTasks(
        newTasks,
        allExistingEvents,
        startDate,
        endDate,
        segments,
        breakMinutes,
        focusMinutes
      );

      setTasks(prev => [...prev, ...newTasks]);
      setEvents(prev => [...prev, ...scheduledEvents]);

      setShowEventDialog(false);
      setSelectedEvent(null);
      if (confirm(`${newTasks.length} subtasks created and scheduled. Remove this event from the calendar?`)) {
        setEvents(prevEvents => prevEvents.filter(e => e.id !== event.id));
        setGoogleEvents(prevEvents => prevEvents.filter(e => e.id !== event.id));
        setICSSubscribedEvents(prevEvents => prevEvents.filter(e => e.id !== event.id));
      }
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Failed to break down with AI. Is Ollama running?');
    } finally {
      setIsDecomposingEvent(false);
    }
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
    <main className="h-screen flex flex-col bg-white">
      {/* Header with dropdowns */}
      <header className="p-4">
        <div className="bg-primary-dark rounded-lg shadow-lg p-5">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-[150px]">
                <Image
                  src="/cadence-logo-white.png"
                  alt="Cadence"
                  fill
                  priority
                  className="object-contain"
                />
              </div>
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
              <div className="flex items-center gap-4">
                <button
                  onClick={triggerFileInput}
                  disabled={isImportingICS}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/10 text-white border border-white/25 hover:bg-white/16 transition-colors hover:bg-white/16 hover:border-white/40 hover:text-white disabled:opacity-50 text-s"
                  title="Import ICS calendar file"
                >
                  <Upload size={20} />
                  {isImportingICS ? 'Importing...' : 'Import ICS'}
                </button>
                <button
                  onClick={() => setShowSubscriptionDialog(!showSubscriptionDialog)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/10 text-white border border-white/25 hover:bg-white/16 transition-colors hover:border-white/40 hover:text-white ${showSubscriptionDialog ? "bg-white/20 border-white/50 text-white" : ""} disabled:opacity-50 text-s`}
                  title="Subscribe to ICS calendar URL"
                >
                  <Link2 size={20} />
                  Subscribe
                </button>
              </div>

              {/* Subscription Dialog */}
              {showSubscriptionDialog && (
                <div className="absolute right-0 top-12 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 p-4">
                  <h3 className="text-lg font-bold text-primary mb-3">Subscribe to Calendar</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-primary mb-1">
                        Calendar URL *
                      </label>
                      <input
                        type="url"
                        value={newSubscriptionUrl}
                        onChange={(e) => setNewSubscriptionUrl(e.target.value)}
                        placeholder="ICS or Google embed URL"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Enter a public ICS calendar feed URL or a Google Calendar embed link
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-primary mb-1">
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
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className="text-sm font-medium text-gray-700">
                            Subscribed Calendars
                          </label>
                          <button
                            type="button"
                            onClick={() => fetchAllICSSubscriptions()}
                            disabled={isLoadingICSSubscription}
                            className="text-xs px-2 py-1 text-primary-600 hover:bg-primary-50 rounded border border-primary-200 transition-colors disabled:opacity-50"
                          >
                            {isLoadingICSSubscription ? 'Refreshing…' : 'Refresh all'}
                          </button>
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {icsSubscriptions.map((sub) => (
                            <div
                              key={sub.id}
                              className="flex items-center justify-between p-2 bg-gray-50 rounded"
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span
                                  className="w-3 h-3 rounded-full border border-gray-300 flex-shrink-0"
                                  style={{ backgroundColor: sub.color || '#8b5cf6' }}
                                />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-800 truncate">
                                    {sub.name}
                                  </p>
                                  <p className="text-xs text-gray-500 truncate">{sub.url}</p>
                                </div>
                              </div>
                              <div
                                ref={openColorMenuId === sub.id ? subscriptionColorMenuRef : undefined}
                                className="flex items-center gap-1 ml-2 relative"
                              >
                                <button
                                  type="button"
                                  onClick={() => setOpenColorMenuId(openColorMenuId === sub.id ? null : sub.id)}
                                  className="px-2 py-1 text-xs text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100 transition-colors flex items-center gap-1"
                                  title="Choose calendar color"
                                >
                                  <span
                                    className="w-3.5 h-3.5 rounded border border-gray-300"
                                    style={{ backgroundColor: sub.color || '#8b5cf6' }}
                                  />
                                  Color
                                </button>
                                {openColorMenuId === sub.id && (
                                  <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 min-w-[180px]">
                                    <p className="text-xs font-medium text-gray-600 mb-2">Pick a color</p>
                                    <div className="grid grid-cols-6 gap-1 mb-2">
                                      {ICS_SUBSCRIPTION_COLORS.map((c) => (
                                        <button
                                          key={c}
                                          type="button"
                                          onClick={() => handleSetICSSubscriptionColor(sub.id, c)}
                                          className="w-6 h-6 rounded border-2 border-gray-200 hover:border-gray-400 transition-colors"
                                          style={{ backgroundColor: c }}
                                          title={c}
                                        />
                                      ))}
                                    </div>
                                    <div className="flex items-center gap-2 border-t border-gray-100 pt-2">
                                      <input
                                        type="color"
                                        value={sub.color?.startsWith('#') ? sub.color : '#8b5cf6'}
                                        onChange={(e) => handleSetICSSubscriptionColor(sub.id, e.target.value)}
                                        className="w-8 h-8 cursor-pointer rounded border border-gray-300"
                                        title="Custom color"
                                      />
                                      <span className="text-xs text-gray-500">Custom</span>
                                    </div>
                                  </div>
                                )}
                                <button
                                  onClick={() => handleRemoveICSSubscription(sub.id)}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Remove subscription"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddICSSubscription}
                        disabled={isLoadingICSSubscription || !newSubscriptionUrl.trim()}
                        className="flex-1 px-4 py-2 bg-secondary text-white rounded-lg font-normal hover:bg-secondary/90 disabled:bg-secondary/85 disabled:cursor-not-allowed transition-colors"
                      >
                        {isLoadingICSSubscription ? 'Adding...' : 'Add Subscription'}
                      </button>
                      <button
                        onClick={() => {
                          setShowSubscriptionDialog(false);
                          setNewSubscriptionUrl('');
                          setNewSubscriptionName('');
                        }}
                        className="px-4 py-2 bg-neutral text-primary font-normal rounded-lg hover:bg-neutral/80 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tasks Dropdown */}
              <div className="relative" ref={tasksDropdownRef}>
                <button
                  onClick={() => {
                    setTasksDropdownOpen(!tasksDropdownOpen);
                  }}
                  className={`flex items-center gap-5 px-5 py-2 rounded-lg bg-primary-light text-white font-semibold text-s border border-white/25 transition-colors hover:bg-primary-light/90 hover:text-white ${tasksDropdownOpen ? "bg-primary-light/80 border-white/50 text-white" : ""}`}                >
                  <Menu size={20} />
                  Tasks
                  {incompleteTasksCount > 0 && (
                    <span className="bg-white/90 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
                      {incompleteTasksCount}
                    </span>
                  )}
                  <ChevronDown size={18} />
                </button>
                
                {tasksDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-[calc(100vh-120px)] overflow-y-auto">
                    <div className="p-4 border-b border-gray-200">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-primary">Tasks</h2>
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
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-neutral font-medium text-gray-700 text-xs rounded-lg hover:bg-secondary-inactive/85 transition-colors disabled:opacity-50"
                            title="Import tasks from ICS file"
                          >
                            <Upload size={14} />
                            Import ICS
                          </button>
                          <button
                            onClick={() => {
                              setTaskDurationMode('preset');
                              setIsAddingTask(!isAddingTask);
                            }}
                            className="flex items-center gap-2 px-3.5 py-1.5 bg-secondary font-medium text-white text-sm rounded-lg hover:bg-secondary/90 transition-colors"
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
                                <div className="flex-1 space-y-2">
                                  <select
                                    value={
                                      taskDurationMode === 'preset'
                                        ? String(newTask.estimatedDuration || 60)
                                        : 'custom'
                                    }
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      if (value === 'custom') {
                                        setTaskDurationMode('custom');
                                        setNewTask((prev) => ({
                                          ...prev,
                                          estimatedDuration: Math.max(
                                            15,
                                            Math.round(taskDurationCustomHours * 60)
                                          ),
                                        }));
                                        return;
                                      }
                                      setTaskDurationMode('preset');
                                      const minutes = parseInt(value, 10) || 60;
                                      setNewTask({ ...newTask, estimatedDuration: minutes });
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                  >
                                    {[30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 600].map((mins) => (
                                      <option key={mins} value={mins}>
                                        {formatMinutesToHoursMinutes(mins)}
                                      </option>
                                    ))}
                                    <option value="custom">Custom (hours)</option>
                                  </select>
                                  {taskDurationMode === 'custom' && (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        min={0.5}
                                        step={0.5}
                                        value={taskDurationCustomHours}
                                        onChange={(e) => {
                                          const hours = parseFloat(e.target.value) || 0;
                                          setTaskDurationCustomHours(hours);
                                          const minutes = Math.max(0, Math.round(hours * 60));
                                          setNewTask({ ...newTask, estimatedDuration: minutes });
                                        }}
                                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        placeholder="Hours"
                                      />
                                      <span className="text-xs text-gray-600">hours</span>
                                    </div>
                                  )}
                                </div>
                                <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 min-w-[140px] flex items-center">
                                  {formatMinutesToHoursMinutes(newTask.estimatedDuration || 0)}
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="relative">
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Due Date (Optional)
                                </label>
                                <div className="relative">
                                  <input
                                    type="text"
                                    readOnly
                                    value={newTask.dueDate ? new Date(newTask.dueDate + 'T00:00:00').toLocaleDateString() : 'Select date'}
                                    onClick={() => setShowDueDatePicker(!showDueDatePicker)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent cursor-pointer"
                                    placeholder="Select date"
                                  />
                                  <CalendarIcon 
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" 
                                    size={16} 
                                  />
                                  {showDueDatePicker && (
                                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl z-50 p-3">
                                      <div className="flex justify-between items-center mb-2">
                                        <button
                                          onClick={() => {
                                            const today = new Date();
                                            today.setHours(0, 0, 0, 0);
                                            setNewTask({ ...newTask, dueDate: formatDateToLocalISO(today) });
                                            setShowDueDatePicker(false);
                                          }}
                                          className="text-xs px-2 py-1 bg-primary-50 text-primary-700 rounded hover:bg-primary-100"
                                        >
                                          Today
                                        </button>
                                        <button
                                          onClick={() => {
                                            const tomorrow = new Date();
                                            tomorrow.setDate(tomorrow.getDate() + 1);
                                            tomorrow.setHours(0, 0, 0, 0);
                                            setNewTask({ ...newTask, dueDate: formatDateToLocalISO(tomorrow) });
                                            setShowDueDatePicker(false);
                                          }}
                                          className="text-xs px-2 py-1 bg-primary-50 text-primary-700 rounded hover:bg-primary-100"
                                        >
                                          Tomorrow
                                        </button>
                                        <button
                                          onClick={() => setShowDueDatePicker(false)}
                                          className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded"
                                        >
                                          <X size={14} />
                                        </button>
                                      </div>
                                      <input
                                        type="date"
                                        value={newTask.dueDate || ''}
                                        onChange={(e) => {
                                          setNewTask({ ...newTask, dueDate: e.target.value || undefined });
                                          setShowDueDatePicker(false);
                                        }}
                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                        min={formatDateToLocalISO(new Date())}
                                      />
                                    </div>
                                  )}
                                </div>
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

              {/* Settings (rightmost icon-only) */}
              <button
                onClick={() => {
                  setTempWorkHours(workHours);
                  setTempBreakAfterEvents(breakAfterEvents);
                  setTempFocusMinutes(focusMinutes);
                  setShowSettingsDialog(true);
                }}
                className="ml-1 p-2.5 rounded-full bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-colors"
                title="Settings"
                aria-label="Settings"
              >
                <Settings size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Full-width Calendar */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full w-full p-4">
          <div className="h-full w-full bg-background rounded-lg shadow-lg p-6 flex flex-col min-h-0">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-800">Calendar</h2>
                <p className="text-sm text-gray-500">Click and drag to create events</p>
              </div>
              <button
                onClick={() => {
                  setTaskDurationMode('preset');
                  setShowAddTaskDialog(true);
                  setTasksDropdownOpen(false);
                  setIsAddingTask(false);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-light text-white border border-white/25 font-semibold shadow-md hover:bg-primary-light/90 transition-all"
                title="Add a new task"
              >
                <Plus size={18} />
                Add Task
              </button>
            </div>
            <div className="flex-1 min-h-0">
            <Calendar
              events={allEvents}
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
            />
            </div>
          </div>
        </div>
      </div>

      {/* Add Task Dialog (from calendar) */}
      {showAddTaskDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-primary">Add Task</h3>
                <p className="text-sm text-gray-600">This will be scheduled automatically</p>
              </div>
              <button
                onClick={() => setShowAddTaskDialog(false)}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newTask.title.trim()) {
                  handleAddTask(newTask);
                }
              }}
              className="space-y-4"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Task title *"
                  required
                  autoFocus
                />
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Description"
                  rows={3}
                />

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Estimated Duration
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-2">
                      <select
                        value={
                          taskDurationMode === 'preset'
                            ? String(newTask.estimatedDuration || 60)
                            : 'custom'
                        }
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === 'custom') {
                            setTaskDurationMode('custom');
                            setNewTask((prev) => ({
                              ...prev,
                              estimatedDuration: Math.max(
                                15,
                                Math.round(taskDurationCustomHours * 60)
                              ),
                            }));
                            return;
                          }
                          setTaskDurationMode('preset');
                          const minutes = parseInt(value, 10) || 60;
                          setNewTask({ ...newTask, estimatedDuration: minutes });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        {[30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 600].map((mins) => (
                          <option key={mins} value={mins}>
                            {formatMinutesToHoursMinutes(mins)}
                          </option>
                        ))}
                        <option value="custom">Custom (hours)</option>
                      </select>
                      {taskDurationMode === 'custom' && (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0.5}
                            step={0.5}
                            value={taskDurationCustomHours}
                            onChange={(e) => {
                              const hours = parseFloat(e.target.value) || 0;
                              setTaskDurationCustomHours(hours);
                              const minutes = Math.max(0, Math.round(hours * 60));
                              setNewTask({ ...newTask, estimatedDuration: minutes });
                            }}
                            className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            placeholder="Hours"
                          />
                          <span className="text-xs text-gray-600">hours</span>
                        </div>
                      )}
                    </div>
                    <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 min-w-[140px] flex items-center">
                      {formatMinutesToHoursMinutes(newTask.estimatedDuration || 0)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Due Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={newTask.dueDate || ''}
                      onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value || undefined })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      min={formatDateToLocalISO(new Date())}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={newTask.priority}
                      onChange={(e) =>
                        setNewTask({ ...newTask, priority: e.target.value as 'low' | 'medium' | 'high' })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary/90 transition-colors"
                >
                  Add Task
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddTaskDialog(false)}
                  className="px-4 py-2 bg-neutral text-gray-700 rounded-lg hover:bg-neutral/80 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Event Dialog - Convert to Task or Delete */}
      {showEventDialog && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 my-8 max-h-[85vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Convert Event to Task</h3>
            <div className="mb-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Event:</p>
                <p className="text-lg text-gray-900">{selectedEvent.title}</p>
                {selectedEvent.description && (
                  <p className="text-sm text-gray-600 mt-1 whitespace-pre-line break-words max-h-40 overflow-y-auto pr-1">
                    {selectedEvent.description}
                  </p>
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
                  <div className="flex-1 space-y-2">
                    <select
                      value={
                        conversionDurationMode === 'preset' &&
                        [30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 600].includes(
                          conversionDuration
                        )
                          ? String(conversionDuration)
                          : 'custom'
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === 'custom') {
                          setConversionDurationMode('custom');
                          setConversionDuration(
                            Math.max(15, Math.round(conversionDurationCustomHours * 60))
                          );
                          return;
                        }
                        setConversionDurationMode('preset');
                        const minutes = parseInt(value, 10) || 60;
                        setConversionDuration(minutes);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      {[30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 600].map((mins) => (
                        <option key={mins} value={mins}>
                          {formatMinutesToHoursMinutes(mins)}
                        </option>
                      ))}
                      <option value="custom">Custom (hours)</option>
                    </select>
                    {conversionDurationMode === 'custom' && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0.5}
                          step={0.5}
                          value={conversionDurationCustomHours}
                          onChange={(e) => {
                            const hours = parseFloat(e.target.value) || 0;
                            setConversionDurationCustomHours(hours);
                            const minutes = Math.max(0, Math.round(hours * 60));
                            setConversionDuration(minutes);
                          }}
                          className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          placeholder="Hours"
                        />
                        <span className="text-xs text-gray-600">hours</span>
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 min-w-[140px]">
                    {formatMinutesToHoursMinutes(conversionDuration)}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  How long will this task take to complete?
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleBreakDownWithAI(selectedEvent)}
                disabled={isDecomposingEvent}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isDecomposingEvent ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Breaking down with AI…
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    Break down with AI
                  </>
                )}
              </button>
              <p className="text-xs text-gray-500 text-center">
                Reads the event description and creates multiple subtasks with steps, then schedules them.
              </p>
            </div>
            <div className="flex gap-3 mt-3">
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

      {/* Work Hours Settings Dialog (standalone - kept for any direct links) */}
      {showWorkHoursDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Set Work Hours</h3>
            <p className="text-sm text-gray-600 mb-4">
              Tasks will only be created and scheduled during these hours (Monday–Friday). You can define multiple work
              blocks per day (for example 6–9 AM and 6–9 PM).
            </p>
            <div className="space-y-4">
              {tempWorkHours.segments.map((segment, index) => (
                <div key={index} className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Start Hour
                    </label>
                    <select
                      value={segment.startHour}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        setTempWorkHours({
                          segments: tempWorkHours.segments.map((s, i) =>
                            i === index ? { ...s, startHour: value } : s
                          ),
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      {Array.from({ length: 24 }, (_, i) => i).map((hour) => {
                        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                        const ampm = hour < 12 ? 'AM' : 'PM';
                        return (
                          <option key={hour} value={hour}>
                            {displayHour}:00 {ampm}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Hour
                    </label>
                    <select
                      value={segment.endHour}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        setTempWorkHours({
                          segments: tempWorkHours.segments.map((s, i) =>
                            i === index ? { ...s, endHour: value } : s
                          ),
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      {Array.from({ length: 24 }, (_, i) => i).map((hour) => {
                        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                        const ampm = hour < 12 ? 'AM' : 'PM';
                        return (
                          <option key={hour} value={hour}>
                            {displayHour}:00 {ampm}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  {tempWorkHours.segments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setTempWorkHours({
                          segments: tempWorkHours.segments.filter((_, i) => i !== index),
                        });
                      }}
                      className="px-3 py-2 text-sm text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  const fallbackSegment = { startHour: 9, endHour: 18 };
                  setTempWorkHours({
                    segments: [
                      ...tempWorkHours.segments,
                      fallbackSegment,
                    ],
                  });
                }}
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                + Add work segment
              </button>

              {!isTempWorkHoursValid && (
                <p className="text-sm text-red-600">
                  Each segment must have an end hour after its start hour, and at least one segment is required.
                </p>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  if (isTempWorkHoursValid) {
                    setWorkHours(tempWorkHours);
                    storage.saveWorkHours(tempWorkHours);
                    setShowWorkHoursDialog(false);
                  }
                }}
                disabled={!isTempWorkHoursValid}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setShowWorkHoursDialog(false);
                  setTempWorkHours(workHours);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Dialog */}
      {showSettingsDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-primary mb-1">Settings</h3>
            <p className="text-sm text-gray-600 mb-6">Configure scheduling and calendar behavior</p>
            
            <div className="space-y-6">
              {/* Working Hours */}
              <div>
                <h4 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <Clock size={16} />
                  Working Hours
                </h4>
                <p className="text-xs text-gray-500 mb-2">
                  Tasks are only scheduled during these hours (Mon–Fri). Define one or more work blocks per day.
                </p>
                <div className="space-y-3">
                  {tempWorkHours.segments.map((segment, index) => (
                    <div key={index} className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
                        <select
                          value={segment.startHour}
                          onChange={(e) => {
                            const value = parseInt(e.target.value);
                            setTempWorkHours({
                              segments: tempWorkHours.segments.map((s, i) =>
                                i === index ? { ...s, startHour: value } : s
                              ),
                            });
                          }}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        >
                          {Array.from({ length: 24 }, (_, i) => i).map((hour) => {
                            const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                            const ampm = hour < 12 ? 'AM' : 'PM';
                            return (
                              <option key={hour} value={hour}>
                                {displayHour}:00 {ampm}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">End</label>
                        <select
                          value={segment.endHour}
                          onChange={(e) => {
                            const value = parseInt(e.target.value);
                            setTempWorkHours({
                              segments: tempWorkHours.segments.map((s, i) =>
                                i === index ? { ...s, endHour: value } : s
                              ),
                            });
                          }}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        >
                          {Array.from({ length: 24 }, (_, i) => i).map((hour) => {
                            const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                            const ampm = hour < 12 ? 'AM' : 'PM';
                            return (
                              <option key={hour} value={hour}>
                                {displayHour}:00 {ampm}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      {tempWorkHours.segments.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setTempWorkHours({
                              segments: tempWorkHours.segments.filter((_, i) => i !== index),
                            });
                          }}
                          className="px-2 py-1 text-xs text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const fallbackSegment = { startHour: 9, endHour: 18 };
                      setTempWorkHours({
                        segments: [
                          ...tempWorkHours.segments,
                          fallbackSegment,
                        ],
                      });
                    }}
                    className="text-xs text-primary-600 hover:text-primary-700"
                  >
                    + Add work segment
                  </button>
                </div>
                {!isTempWorkHoursValid && (
                  <p className="text-xs text-red-600 mt-1">
                    Each segment must have an end hour after its start hour, and at least one segment is required.
                  </p>
                )}
              </div>

              {/* Break after events */}
              <div>
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Break After Each Event</h4>
                <p className="text-xs text-gray-500 mb-2">Gap (in minutes) before another task can be scheduled after an event or task</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={tempBreakAfterEvents}
                    onChange={(e) => setTempBreakAfterEvents(Math.max(0, parseInt(e.target.value) || 0))}
                    min={0}
                    max={120}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-600">minutes</span>
                </div>
              </div>

              {/* Focus hours */}
              <div>
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Focus Duration</h4>
                <p className="text-xs text-gray-500 mb-2">How long you feel comfortable focusing on a task. Longer tasks are split into chunks of this size (30 min – 3 hours)</p>
                <select
                  value={tempFocusMinutes}
                  onChange={(e) => setTempFocusMinutes(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                >
                  {[30, 45, 50, 60, 75, 90, 120, 150, 180].map((mins) => (
                    <option key={mins} value={mins}>
                      {mins < 60 ? `${mins} minutes` : mins === 60 ? '1 hour' : `${mins / 60} hours`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  if (isTempWorkHoursValid) {
                    setWorkHours(tempWorkHours);
                    storage.saveWorkHours(tempWorkHours);
                  }
                  setBreakAfterEvents(tempBreakAfterEvents);
                  storage.saveBreakAfterEvents(tempBreakAfterEvents);
                  setFocusMinutes(tempFocusMinutes);
                  storage.saveFocusMinutes(tempFocusMinutes);
                  setShowSettingsDialog(false);
                }}
                disabled={!isTempWorkHoursValid}
                className="flex-1 px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary/90 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setShowSettingsDialog(false);
                  setTempWorkHours(workHours);
                  setTempBreakAfterEvents(breakAfterEvents);
                  setTempFocusMinutes(focusMinutes);
                }}
                className="px-4 py-2 bg-neutral text-gray-700 rounded-lg hover:bg-neutral/90 transition-colors"
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

