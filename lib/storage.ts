import { Task, CalendarEvent } from '@/types';

const TASKS_KEY = 'cadence_tasks';
const EVENTS_KEY = 'cadence_events';
const GOOGLE_TOKENS_KEY = 'cadence_google_tokens';
const GOOGLE_EVENTS_KEY = 'cadence_google_events';
const ICS_SUBSCRIPTIONS_KEY = 'cadence_ics_subscriptions';

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

  // Google Calendar Tokens
  getGoogleTokens(): { access_token?: string; refresh_token?: string } | null {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem(GOOGLE_TOKENS_KEY);
    return data ? JSON.parse(data) : null;
  },

  saveGoogleTokens(tokens: { access_token?: string; refresh_token?: string }): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(GOOGLE_TOKENS_KEY, JSON.stringify(tokens));
  },

  clearGoogleTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(GOOGLE_TOKENS_KEY);
    localStorage.removeItem(GOOGLE_EVENTS_KEY);
  },

  // ICS Calendar Subscriptions
  getICSSubscriptions(): Array<{ id: string; url: string; name: string }> {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(ICS_SUBSCRIPTIONS_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveICSSubscriptions(subscriptions: Array<{ id: string; url: string; name: string }>): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ICS_SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions));
  },

  addICSSubscription(url: string, name: string): void {
    const subscriptions = this.getICSSubscriptions();
    const newSubscription = {
      id: `ics-sub-${Date.now()}-${Math.random()}`,
      url,
      name: name || new URL(url).hostname,
    };
    this.saveICSSubscriptions([...subscriptions, newSubscription]);
  },

  removeICSSubscription(id: string): void {
    const subscriptions = this.getICSSubscriptions();
    this.saveICSSubscriptions(subscriptions.filter(sub => sub.id !== id));
  },
};

