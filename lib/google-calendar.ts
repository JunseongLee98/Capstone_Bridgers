import { google } from 'googleapis';
import { CalendarEvent } from '@/types';
import { fetchGoogleCalendarEventsRest } from '@/lib/google-calendar-rest';

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
  try {
    return await fetchGoogleCalendarEventsRest(accessToken, timeMin, timeMax);
  } catch (error) {
    console.error('Error fetching Google Calendar events:', error);
    throw error;
  }
}

