# Cadence Chrome extension (backend)

This folder contains a **Manifest V3** extension that runs the same backend responsibilities as the Next.js API routes:

- **Assignment decomposition** — Ollama (local) or OpenAI, via `lib/decompose-assignment.ts`
- **Google Calendar events** — REST fetch to `calendar/v3`, via `lib/google-calendar-rest.ts`
- **ICS fetch** — HTTPS fetch (no CORS proxy), replaces `/api/ics/proxy`

## Build

From the repository root:

```bash
npm install
npm run build:extension
```

This bundles `extension/src/background.ts` (and shared `lib/*` code) into `extension/dist/background.js`.

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` directory (the folder that contains `manifest.json` and `dist/` after build)

## Configure LLM keys (extension)

The service worker reads optional keys from **`chrome.storage.local`**:

| Key | Purpose |
|-----|---------|
| `cadence_openai_api_key` | OpenAI API key (if set, OpenAI is used for decompose) |
| `cadence_ollama_base_url` | e.g. `http://localhost:11434` |
| `cadence_ollama_model` | e.g. `llama3.2` |
| `cadence_ollama_api_key` | Optional Ollama cloud API key |

You can set these from the extension **service worker console** for testing:

```js
chrome.storage.local.set({
  cadence_ollama_base_url: 'http://localhost:11434',
  cadence_ollama_model: 'llama3.2'
});
```

Or add a small options page later.

## Messaging API

Send messages from a web page **only if** it is allowed (e.g. extension page) or use **externally_connectable** / **content script** bridge. Typical pattern: the Cadence app’s content script or side panel calls:

```ts
chrome.runtime.sendMessage(extensionId, {
  type: 'CADENCE_DECOMPOSE',
  payload: { title: 'Essay', description: '...', dueDate: '2026-04-01T00:00:00.000Z' }
}, (response) => { ... });
```

Message types:

| `type` | `payload` | Returns |
|--------|-----------|---------|
| `CADENCE_DECOMPOSE` | `{ title, description?, dueDate? }` | `{ subtasks: [...] }` |
| `CADENCE_GET_GOOGLE_EVENTS` | `{ accessToken, timeMin?, timeMax? }` (ISO strings) | `{ events: CalendarEvent[] }` |
| `CADENCE_FETCH_ICS` | `{ url }` (HTTPS only) | `{ body: string }` |
| `CADENCE_GET_ENV` | — | Current stored LLM settings (no secrets redacted — keep dev only) |

Response shape: `{ ok: true, data }` or `{ ok: false, error: string }`.

## Branch

Implemented on branch `chrome_extension` alongside shared modules under `lib/`.
