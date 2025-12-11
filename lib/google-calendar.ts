import { google } from 'googleapis';
import { CalendarEvent } from '@/types';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

export function getAuthClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback'
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
  });

  return oauth2Client;
}

export function getAuthUrl(): string {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback'
  );

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function getTokensFromCode(code: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback'
  );

  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export async function fetchGoogleCalendarEvents(accessToken: string, timeMin?: Date, timeMax?: Date): Promise<CalendarEvent[]> {
  const auth = getAuthClient(accessToken);
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const minTime = timeMin || now;
  const maxTime = timeMax || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days ahead

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: minTime.toISOString(),
      timeMax: maxTime.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
    });

    const events = response.data.items || [];

    return events.map((event): CalendarEvent => {
      const start = event.start?.dateTime || event.start?.date;
      const end = event.end?.dateTime || event.end?.date;

      return {
        id: event.id || `google-${Date.now()}-${Math.random()}`,
        title: event.summary || '(No title)',
        start: new Date(start || new Date()),
        end: new Date(end || new Date()),
        isScheduled: false,
        color: '#4285f4', // Google Calendar blue
        taskId: undefined,
      };
    });
  } catch (error) {
    console.error('Error fetching Google Calendar events:', error);
    throw error;
  }
}

