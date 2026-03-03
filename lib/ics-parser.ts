import ICAL from 'ical.js';
import { CalendarEvent } from '@/types';
import { formatDateToLocalISO } from '@/lib/date-utils';

/**
 * Parse ICS file content and convert to CalendarEvent array
 */
export function parseICSFile(icsContent: string): CalendarEvent[] {
  try {
    const jcalData = ICAL.parse(icsContent);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');
    
    const events: CalendarEvent[] = [];
    
    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent);
      
      // Get event properties (ensure they're strings)
      const summaryValue = vevent.getFirstPropertyValue('summary');
      const summary = typeof summaryValue === 'string' ? summaryValue : '(No title)';
      
      const descriptionValue = vevent.getFirstPropertyValue('description');
      const description = typeof descriptionValue === 'string' ? descriptionValue : '';
      
      const startTime = event.startDate;
      const endTime = event.endDate;
      
      // Get UID or generate one
      const uidValue = vevent.getFirstPropertyValue('uid');
      const uid = typeof uidValue === 'string' ? uidValue : `event-${Date.now()}-${Math.random()}`;
      
      // Handle all-day events
      if (event.isRecurring()) {
        // For recurring events, expand the next 365 days
        const iterator = event.iterator();
        const now = ICAL.Time.now();
        const oneYearLater = now.clone();
        oneYearLater.adjust(365, 0, 0, 0);
        
        let occurrence;
        while ((occurrence = iterator.next()) && occurrence.compare(oneYearLater) < 0) {
          const eventStart = occurrence;
          const duration = event.duration;
          const eventEnd = eventStart.clone();
          eventEnd.addDuration(duration);
          
          const eventData: CalendarEvent = {
            id: `ics-${uid}-${eventStart.toUnixTime()}`,
            title: summary,
            start: eventStart.toJSDate(),
            end: eventEnd.toJSDate(),
            isScheduled: false,
            color: '#8b5cf6', // Purple color for imported ICS events
          };
          if (description) {
            eventData.description = description;
          }
          events.push(eventData);
        }
      } else {
        // Single event
        const eventData: CalendarEvent = {
          id: `ics-${uid}`,
          title: summary,
          start: startTime.toJSDate(),
          end: endTime.toJSDate(),
          isScheduled: false,
          color: '#8b5cf6', // Purple color for imported ICS events
        };
        if (description) {
          eventData.description = description;
        }
        events.push(eventData);
      }
    }
    
    return events;
  } catch (error) {
    console.error('Error parsing ICS file:', error);
    throw new Error('Failed to parse ICS file. Please check the file format.');
  }
}

/**
 * Read and parse an ICS file from a File object
 */
export async function parseICSFileFromFile(file: File): Promise<CalendarEvent[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const events = parseICSFile(content);
        resolve(events);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Parse ICS file content and convert to Task array
 * Events from ICS are converted to tasks with duration calculated from event times
 */
export function parseICSFileAsTasks(icsContent: string): Array<{
  title: string;
  description?: string;
  estimatedDuration?: number;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string; // ISO date string
}> {
  try {
    const jcalData = ICAL.parse(icsContent);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');
    
    const tasks: Array<{
      title: string;
      description?: string;
      estimatedDuration?: number;
      priority: 'low' | 'medium' | 'high';
      dueDate?: string;
    }> = [];
    
    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent);
      
      // Get event properties
      const summaryValue = vevent.getFirstPropertyValue('summary');
      const title = typeof summaryValue === 'string' ? summaryValue : '(No title)';
      
      const descriptionValue = vevent.getFirstPropertyValue('description');
      const description = typeof descriptionValue === 'string' ? descriptionValue : undefined;
      
      const startTime = event.startDate.toJSDate();
      const endTime = event.endDate.toJSDate();
      
      // Calculate duration in minutes
      const durationMs = endTime.getTime() - startTime.getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));
      
      // Use end date as due date (for tasks, due date is typically when it should be completed)
      const dueDate = formatDateToLocalISO(endTime); // Just the local date part
      
      // Check for priority in categories or classification
      let priority: 'low' | 'medium' | 'high' = 'medium';
      const categoriesValue = vevent.getFirstPropertyValue('categories');
      if (typeof categoriesValue === 'string') {
        const categories = categoriesValue.toLowerCase();
        if (categories.includes('high') || categories.includes('urgent')) {
          priority = 'high';
        } else if (categories.includes('low')) {
          priority = 'low';
        }
      }
      
      tasks.push({
        title,
        description,
        estimatedDuration: durationMinutes > 0 ? durationMinutes : 60, // Default to 60 min if no duration
        priority,
        dueDate,
      });
    }
    
    return tasks;
  } catch (error) {
    console.error('Error parsing ICS file as tasks:', error);
    throw new Error('Failed to parse ICS file. Please check the file format.');
  }
}

/**
 * Read and parse an ICS file from a File object as tasks
 */
export async function parseICSFileFromFileAsTasks(file: File): Promise<Array<{
  title: string;
  description?: string;
  estimatedDuration?: number;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
}>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const tasks = parseICSFileAsTasks(content);
        resolve(tasks);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Fetch and parse ICS file from a URL
 * Uses proxy API route to avoid CORS issues
 */
export async function fetchICSFromURL(url: string): Promise<CalendarEvent[]> {
  try {
    // Use proxy API route to avoid CORS issues
    const proxyUrl = `/api/ics/proxy?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch calendar: ${response.status} ${response.statusText}`);
    }
    
    const content = await response.text();
    return parseICSFile(content);
  } catch (error: any) {
    console.error(`Error fetching ICS from URL ${url}:`, error);
    throw error;
  }
}

