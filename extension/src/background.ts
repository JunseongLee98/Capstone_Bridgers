/**
 * Cadence extension service worker — hosts former Next.js API logic:
 * assignment decomposition (Ollama/OpenAI), Google Calendar events (REST), ICS fetch.
 *
 * UI (web app or side panel) calls via chrome.runtime.sendMessage.
 */
import { decomposeAssignment, type DecomposeEnv } from '../../lib/decompose-assignment';
import { fetchGoogleCalendarEventsRest } from '../../lib/google-calendar-rest';

export type CadenceMessage =
  | {
      type: 'CADENCE_DECOMPOSE';
      payload: { title: string; description?: string; dueDate?: string };
    }
  | {
      type: 'CADENCE_GET_GOOGLE_EVENTS';
      payload: { accessToken: string; timeMin?: string; timeMax?: string };
    }
  | {
      type: 'CADENCE_FETCH_ICS';
      payload: { url: string };
    }
  | {
      type: 'CADENCE_GET_ENV';
      payload?: Record<string, never>;
    };

/** Keys mirrored in options UI / chrome.storage.local */
const STORAGE = {
  openaiApiKey: 'cadence_openai_api_key',
  ollamaBaseUrl: 'cadence_ollama_base_url',
  ollamaModel: 'cadence_ollama_model',
  ollamaApiKey: 'cadence_ollama_api_key',
} as const;

async function loadDecomposeEnv(): Promise<DecomposeEnv> {
  const data = await chrome.storage.local.get([
    STORAGE.openaiApiKey,
    STORAGE.ollamaBaseUrl,
    STORAGE.ollamaModel,
    STORAGE.ollamaApiKey,
  ]);
  return {
    openaiApiKey: data[STORAGE.openaiApiKey] as string | undefined,
    ollamaBaseUrl: data[STORAGE.ollamaBaseUrl] as string | undefined,
    ollamaModel: data[STORAGE.ollamaModel] as string | undefined,
    ollamaApiKey: data[STORAGE.ollamaApiKey] as string | undefined,
  };
}

async function handleMessage(msg: CadenceMessage): Promise<unknown> {
  switch (msg.type) {
    case 'CADENCE_GET_ENV': {
      return loadDecomposeEnv();
    }
    case 'CADENCE_DECOMPOSE': {
      const env = await loadDecomposeEnv();
      return decomposeAssignment(msg.payload, env);
    }
    case 'CADENCE_GET_GOOGLE_EVENTS': {
      const { accessToken, timeMin, timeMax } = msg.payload;
      if (!accessToken) {
        throw new Error('accessToken is required');
      }
      const events = await fetchGoogleCalendarEventsRest(
        accessToken,
        timeMin ? new Date(timeMin) : undefined,
        timeMax ? new Date(timeMax) : undefined
      );
      return { events };
    }
    case 'CADENCE_FETCH_ICS': {
      const { url } = msg.payload;
      if (!url) {
        throw new Error('url is required');
      }
      const target = new URL(url);
      if (target.protocol !== 'https:') {
        throw new Error('Only HTTPS URLs are allowed');
      }
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Cadence Chrome Extension' },
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch calendar: ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      return { body: text };
    }
    default:
      throw new Error(`Unknown message type: ${(msg as { type?: string }).type ?? 'undefined'}`);
  }
}

chrome.runtime.onMessage.addListener(
  (message: CadenceMessage, _sender, sendResponse: (r: unknown) => void) => {
    handleMessage(message)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err: Error) =>
        sendResponse({
          ok: false,
          error: err?.message || String(err),
        })
      );
    return true;
  }
);
