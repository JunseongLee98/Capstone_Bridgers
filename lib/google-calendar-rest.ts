import type { CalendarEvent } from '@/types';
import { SCHEDULE_MAX_HORIZON_DAYS } from '@/lib/schedule-constants';
import { parseLocalDateInput } from '@/lib/date-utils';

/**
 * Fetch primary calendar events via Google Calendar API REST (no googleapis).
 * Used by the Chrome extension service worker and can be used by the Next.js route.
 */
export async function fetchGoogleCalendarEventsRest(
  accessToken: string,
  timeMin?: Date,
  timeMax?: Date
): Promise<CalendarEvent[]> {
  const now = new Date();
  const minTime = timeMin || now;
  const maxTime =
    timeMax ||
    new Date(now.getTime() + SCHEDULE_MAX_HORIZON_DAYS * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    timeMin: minTime.toISOString(),
    timeMax: maxTime.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const err = new Error(text || response.statusText) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const items = (data.items || []) as Array<{
    id?: string;
    summary?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  }>;

  const parseGoogleDate = (value: string | undefined): Date => {
    if (!value) return new Date();
    // Google returns all-day events as YYYY-MM-DD (no time). Parse as LOCAL midnight.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return parseLocalDateInput(value);
    }
    return new Date(value);
  };

  return items.map((event): CalendarEvent => {
    const startRaw = event.start?.dateTime || event.start?.date;
    const endRaw = event.end?.dateTime || event.end?.date;

    return {
      id: event.id || `google-${Date.now()}-${Math.random()}`,
      title: event.summary || '(No title)',
      start: parseGoogleDate(startRaw),
      end: parseGoogleDate(endRaw),
      isScheduled: false,
      color: '#4285f4',
      taskId: undefined,
    };
  });
}
