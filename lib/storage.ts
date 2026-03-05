import { Task, CalendarEvent } from '@/types';

const TASKS_KEY = 'cadence_tasks';
const EVENTS_KEY = 'cadence_events';
const ICS_SUBSCRIPTIONS_KEY = 'cadence_ics_subscriptions';
const WORK_HOURS_KEY = 'cadence_work_hours';
const BREAK_AFTER_EVENTS_KEY = 'cadence_break_after_events';
const FOCUS_MINUTES_KEY = 'cadence_focus_minutes';

// Default pastel color palette for subscribed ICS calendars (easy on the eyes)
const ICS_SUBSCRIPTION_COLORS = [
  '#bfdbfe', // pastel blue
  '#bbf7d0', // pastel green
  '#fed7aa', // pastel orange
  '#fecaca', // pastel red
  '#e9d5ff', // pastel purple
  '#fbcfe8', // pastel pink
];

export const storage = {
  // Tasks
  getTasks(): Task[] {
    if (typeof window === 'undefined') return [];
    
    const data = localStorage.getItem(TASKS_KEY);
    if (!data) return [];
    
    const tasks = JSON.parse(data);
    return tasks.map((task: any) => ({
      ...task,
      createdAt: new Date(task.createdAt),
      completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
      dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
    }));
  },

  saveTasks(tasks: Task[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  },

  // Events
  getEvents(): CalendarEvent[] {
    if (typeof window === 'undefined') return [];
    
    const data = localStorage.getItem(EVENTS_KEY);
    if (!data) return [];
    
    const events = JSON.parse(data);
    return events.map((event: any) => ({
      ...event,
      start: new Date(event.start),
      end: new Date(event.end),
    }));
  },

  saveEvents(events: CalendarEvent[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
  },

  // ICS Calendar Subscriptions
  getICSSubscriptions(): Array<{ id: string; url: string; name: string; color?: string }> {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(ICS_SUBSCRIPTIONS_KEY);
    const parsed: Array<{ id: string; url: string; name: string; color?: string }> = data ? JSON.parse(data) : [];
    return parsed;
  },

  saveICSSubscriptions(subscriptions: Array<{ id: string; url: string; name: string; color?: string }>): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ICS_SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions));
  },

  addICSSubscription(url: string, name: string, color?: string): void {
    const subscriptions = this.getICSSubscriptions();
    const assignedColor =
      color ||
      ICS_SUBSCRIPTION_COLORS[subscriptions.length % ICS_SUBSCRIPTION_COLORS.length];

    const newSubscription = {
      id: `ics-sub-${Date.now()}-${Math.random()}`,
      url,
      name: name || new URL(url).hostname,
      color: assignedColor,
    };
    this.saveICSSubscriptions([...subscriptions, newSubscription]);
  },

  removeICSSubscription(id: string): void {
    const subscriptions = this.getICSSubscriptions();
    this.saveICSSubscriptions(subscriptions.filter(sub => sub.id !== id));
  },

  // Work Hours (default 9AM–6PM)
  getWorkHours(): { startHour: number; endHour: number } {
    if (typeof window === 'undefined') return { startHour: 9, endHour: 18 };
    const data = localStorage.getItem(WORK_HOURS_KEY);
    return data ? JSON.parse(data) : { startHour: 9, endHour: 18 };
  },

  saveWorkHours(workHours: { startHour: number; endHour: number }): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(WORK_HOURS_KEY, JSON.stringify(workHours));
  },

  // Break after events (minutes) - gap before next task can be scheduled
  getBreakAfterEvents(): number {
    if (typeof window === 'undefined') return 5;
    const data = localStorage.getItem(BREAK_AFTER_EVENTS_KEY);
    return data !== null ? parseInt(data, 10) : 5;
  },

  saveBreakAfterEvents(minutes: number): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(BREAK_AFTER_EVENTS_KEY, String(minutes));
  },

  // Focus minutes (30–180) - max comfortable task chunk, default 50
  getFocusMinutes(): number {
    if (typeof window === 'undefined') return 50;
    const data = localStorage.getItem(FOCUS_MINUTES_KEY);
    const val = data !== null ? parseInt(data, 10) : 50;
    return Math.max(30, Math.min(180, val));
  },

  saveFocusMinutes(minutes: number): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(FOCUS_MINUTES_KEY, String(Math.max(30, Math.min(180, minutes))));
  },
};

