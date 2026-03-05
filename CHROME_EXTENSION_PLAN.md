# Cadence Chrome Extension – Conversion Plan (Standalone / No Backend)

This document is the **full conversion plan** for turning Cadence into a **standalone Chrome extension** that works with Google Calendar **without** a separate backend server. It includes optional injection into calendar.google.com.

---

## 1. Target Outcome

- **Standalone extension**: No Next.js server; all logic runs in the browser or in the extension’s service worker.
- **Google Calendar**: Sync and show events via Google APIs; OAuth handled inside the extension.
- **ICS subscriptions**: Fetch and parse ICS feeds from the extension (no `/api/ics/proxy`).
- **AI**: Ollama on localhost and/or OpenAI (API key stored in extension).
- **Optional**: Content script on calendar.google.com to add “Break down with AI” / “Add to Cadence” on events.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Chrome Extension (Manifest V3)                                  │
├─────────────────────────────────────────────────────────────────┤
│  side_panel.html (or options.html)  ← Main Cadence UI (React)    │
│  - Calendar view, tasks, settings, ICS list                      │
│  - Uses chrome.storage, messaging to background                  │
├─────────────────────────────────────────────────────────────────┤
│  service_worker (background)                                      │
│  - OAuth (chrome.identity), token refresh                        │
│  - Fetch Google Calendar API, ICS URLs (no CORS)                │
│  - Call Ollama (localhost) / OpenAI                              │
│  - Optional: message handlers for storage / API                  │
├─────────────────────────────────────────────────────────────────┤
│  content_script (optional) – calendar.google.com                 │
│  - Inject “Add to Cadence” / “Break down with AI” on events      │
│  - Communicate with side panel via chrome.runtime messaging       │
└─────────────────────────────────────────────────────────────────┘
```

- **No backend**: All former API routes are either removed or reimplemented in the extension (background script or offscreen document if needed).

---

## 3. Extension Surface

| Surface | Role |
|--------|------|
| **Side panel** | Primary UI: same as current app (calendar, tasks, settings, ICS subscriptions). Opens from toolbar icon. |
| **Options page** | Optional; can mirror side panel or be a minimal “Cadence settings” page. |
| **Background (service worker)** | OAuth, Google Calendar API, ICS fetch, AI (Ollama/OpenAI), token refresh. |
| **Content script** (optional) | Only on `https://calendar.google.com/*`; inject buttons into event UI. |

---

## 4. Phased Conversion Plan

### Phase 1: Extension Shell and Build

**Goal:** Produce a loadable Chrome extension that shows the current UI in a side panel (or options page), with no backend calls yet.

1. **Create extension layout** (e.g. new directory or branch):
   - `extension/`
     - `public/` or `dist/` (built assets)
     - `manifest.json`
     - `src/` (optional; or keep using app/components from a shared package)
2. **manifest.json (Manifest V3):**
   - `manifest_version: 3`
   - `permissions`: `storage`, `identity` (for OAuth), `sidePanel`
   - `host_permissions`: `https://www.googleapis.com/*`, `https://calendar.google.com/*`, optional `https://*` for ICS, optional `http://localhost:11434/*` for Ollama
   - `side_panel.default_path`: e.g. `sidepanel.html`
   - `background`: `service_worker` (single JS bundle)
   - `content_scripts` (optional): match `https://calendar.google.com/*`, inject one JS + one CSS
3. **Build pipeline:**
   - **Option A:** Use **Vite** (or similar) to build the React app into static HTML/JS/CSS; output to `extension/dist/`. No Next.js runtime.
   - **Option B:** Use **CRXJS** (Vite plugin for Chrome extensions) to produce manifest, background, and side panel in one build.
   - **Option C:** Next.js with `output: 'export'` for static HTML, then manually wire entry points to `sidepanel.html` and a background bundle (more custom).
4. **Entry points:**
   - `sidepanel.html` loads the same React tree as current `app/page.tsx` (or a thin wrapper). Root component stays the same; only data layer (storage, API) will be swapped later.
5. **Deliverable:** Load unpacked extension in `chrome://extensions`; open side panel and see current Cadence UI (tasks/calendar), even if data is empty or still using localStorage.

---

### Phase 2: Storage and Identity

**Goal:** Replace `localStorage` with Chrome storage; prepare for Google OAuth in the extension.

1. **Storage abstraction:**
   - Introduce a small **storage module** used by the app (e.g. `lib/storage.ts` → `lib/storage.extension.ts` or feature-flag implementation).
   - **Extension implementation:** Use `chrome.storage.sync` for preferences (work hours, focus minutes, break minutes) and `chrome.storage.local` for larger data (tasks, events, ICS subscriptions, cached Google/ICS events). Sync has size limits; put big blobs in local.
   - Keep the same key names and value shapes where possible so the rest of the app does not change.
2. **Remove or stub backend URLs:**
   - All `fetch('/api/...')` in the app must be removed or routed to the background script (see Phase 3). For Phase 2, you can stub them (e.g. return empty or mock data) so the UI still runs.
3. **Identity (prepare for OAuth):**
   - Add `chrome.identity` usage only in the **background** script. The UI will ask the background “get Google Calendar token” via `chrome.runtime.sendMessage`.
   - **Optional for Phase 2:** Implement a minimal `getAuthToken` / `launchWebAuthFlow` in the service worker and store tokens in `chrome.storage.local`; UI still doesn’t call Google yet (Phase 3).

**Deliverable:** Side panel uses Chrome storage for tasks, events, settings; no dependency on `localStorage`. Optional: user can “Connect Google” and see a token in storage (no calendar fetch yet).

---

### Phase 3: Google Calendar (No Backend)

**Goal:** Fetch and display Google Calendar events from the extension using only Chrome APIs and Google’s APIs.

1. **OAuth in the extension:**
   - Use **Chrome Identity API**: either `chrome.identity.getAuthToken()` (for Chrome Web Store / Google sign-in) or `chrome.identity.launchWebAuthFlow()` with a Google OAuth URL.
   - For **launchWebAuthFlow**: Redirect URI must be a fixed extension URL, e.g. `https://<extension-id>.chromiumapp.org/`. Register this redirect in Google Cloud Console for the same OAuth client (or create one for the extension).
   - Store `access_token` and `refresh_token` (if any) in `chrome.storage.local`. Implement refresh in the background when the token expires (Google’s refresh endpoint).
2. **Google Calendar API calls:**
   - All requests to `https://www.googleapis.com/calendar/v3/...` must happen in the **background** (service worker) or in an **offscreen document** (if you need a full fetch API with cookies). Service worker can use `fetch()` with `host_permissions: https://www.googleapis.com/*`.
   - Current app uses a Next.js route `/api/calendar/events` that calls `fetchGoogleCalendarEvents(accessToken, timeMin, timeMax)`. Move that function into the extension’s background (or a shared module the background uses). Background exposes a message API, e.g. `{ type: 'GET_GOOGLE_EVENTS', timeMin, timeMax }` → returns events.
   - UI (side panel) no longer calls `fetch('/api/calendar/events')`; it sends a message to the background and gets back the events, then merges them into the same `allEvents` (or equivalent) state as today.
3. **Remove backend auth routes:**
   - Delete or ignore any dependency on `/api/auth` and `/api/auth/callback` from the web app; OAuth is fully in the extension.

**Deliverable:** User can connect Google Calendar from the side panel; events load and show in the Cadence calendar view with no backend.

---

### Phase 4: ICS Subscriptions (No Backend Proxy)

**Goal:** Fetch ICS feeds from arbitrary URLs without a server-side proxy.

1. **Where to fetch:**
   - Extension **background** (service worker) can fetch any URL if you request broad `host_permissions` (e.g. `https://*/*` or list common calendar domains). Then CORS does not apply to the extension origin.
   - Alternatively request optional host permission at runtime when the user adds a subscription; then background fetches that URL.
2. **Implementation:**
   - Move `fetchICSFromURL` (or equivalent) into the background. It should:
     - `fetch(url)` from the service worker (no proxy).
     - Parse the response body as text and run the same ICS parsing logic you use today (e.g. ical.js). If ical.js is heavy, you can run it in an **offscreen document** and pass the raw text there, then return parsed events via messaging.
   - Background exposes a message, e.g. `{ type: 'FETCH_ICS', url }` → returns `CalendarEvent[]`.
   - UI: when loading subscriptions or when “Refresh all” is clicked, send one message per subscription and merge results into `icsSubscribedEvents`.
3. **Remove `/api/ics/proxy`:**
   - No more proxy; all ICS fetch is from the extension.

**Deliverable:** Adding an ICS (or Google embed) subscription and refreshing works from the side panel with no backend.

---

### Phase 5: AI (Ollama + OpenAI) in the Extension

**Goal:** “Break down with AI” and any other AI features run from the extension; no backend `/api/assignments/decompose`.

1. **Ollama (localhost):**
   - Background script can `fetch('http://localhost:11434/api/chat', { ... })` if the extension has host permission for `http://localhost:11434/*`. Add to `host_permissions` or use optional permission and `chrome.permissions.request()` when user enables “Use local Ollama”.
   - Reuse the same prompt and response parsing as current `app/api/assignments/decompose/route.ts`; only the HTTP call moves to the background. Background message, e.g. `{ type: 'DECOMPOSE_ASSIGNMENT', title, description, dueDate }` → call Ollama → return `{ subtasks }`.
2. **OpenAI:**
   - User stores an API key in extension options (e.g. in `chrome.storage.local`). Background sends it in `Authorization` and calls `https://api.openai.com/v1/chat/completions` from the service worker. Same request/response shape as current decompose route.
   - Prefer not to ship the key in code; always read from storage at runtime.
3. **UI:**
   - “Break down with AI” in the side panel sends the message to the background; background chooses Ollama vs OpenAI (e.g. from settings), then returns subtasks. UI then creates tasks and runs the same distribution logic as today (all in the extension, no API).

**Deliverable:** Assignment decomposition works from the side panel using either local Ollama or OpenAI, with no backend.

---

### Phase 6: Optional – Content Script on Google Calendar

**Goal:** Buttons on calendar.google.com (e.g. “Add to Cadence”, “Break down with AI”) that send event data to the extension.

1. **Content script:**
   - `content_scripts` in manifest: `matches: ['https://calendar.google.com/*']`, one JS file, one CSS file. Script runs in the page context (or isolated world); avoid conflicting with Google’s JS.
2. **Injection:**
   - Find Google Calendar’s event popover/side panel in the DOM (selectors may change; use robust selectors or a small mutation observer). When an event is opened, add a small “Add to Cadence” (and optionally “Break down with AI”) button.
   - On click: read event title, description, start/end from the DOM (or from the page’s JS if you can access it). Send to background via `chrome.runtime.sendMessage({ type: 'ADD_EVENT_TO_CADENCE', event })`. Background can then add to `chrome.storage.local` and/or open the side panel. Optionally trigger “Break down with AI” by sending the same payload the side panel would use.
3. **Side panel coordination:**
   - If the side panel is open, you can use `chrome.runtime.sendMessage` from the content script and have the side panel’s script listen and update UI. If the panel is closed, background updates storage and the next time the user opens the panel they see the new event/tasks.

**Deliverable:** On calendar.google.com, when viewing an event, user sees “Add to Cadence” (and optionally “Break down with AI”); data flows into the extension without leaving the page.

---

## 5. File and Directory Structure (Suggested)

```
extension/
├── manifest.json
├── sidepanel.html
├── src/
│   ├── sidepanel/
│   │   ├── main.tsx           # React entry for side panel
│   │   ├── App.tsx            # Current app/page.tsx content
│   │   └── ...
│   ├── background/
│   │   └── service-worker.ts  # OAuth, Google API, ICS fetch, AI
│   ├── content/
│   │   └── calendar-inject.ts # Optional: inject into calendar.google.com
│   ├── lib/
│   │   ├── storage.ts         # chrome.storage wrapper (same interface as current)
│   │   ├── ai-agent.ts        # Unchanged logic; called from background
│   │   └── ics-parser.ts      # Used by background
│   └── shared/
│       └── types.ts
├── public/
│   └── icons/                 # 16, 48, 128 for extension
└── package.json               # Vite + CRXJS or custom build
```

You can keep `app/`, `components/`, and most of `lib/` from the current repo and import them into `extension/src/sidepanel` and `extension/src/background` so logic is shared and only the “platform” (storage, fetch, OAuth) is extension-specific.

---

## 6. Manifest V3 Sketch

```json
{
  "manifest_version": 3,
  "name": "Cadence",
  "version": "1.0.0",
  "description": "AI-powered calendar and task scheduling with Google Calendar.",
  "permissions": [
    "storage",
    "identity",
    "sidePanel"
  ],
  "host_permissions": [
    "https://www.googleapis.com/*",
    "https://calendar.google.com/*",
    "https://*/*",
    "http://localhost:11434/*"
  ],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://calendar.google.com/*"],
      "js": ["content/calendar-inject.js"],
      "css": ["content/calendar-inject.css"]
    }
  ],
  "action": {
    "default_title": "Open Cadence"
  }
}
```

Use optional permissions where possible (e.g. `https://*/*` or `http://localhost:11434/*`) and request them when the user adds an ICS subscription or enables Ollama.

---

## 7. Implementation Checklist (Order)

- [ ] **Phase 1:** New `extension/` (or branch), manifest, build (Vite/CRXJS), side panel entry that loads current React app; load unpacked in Chrome.
- [ ] **Phase 2:** Storage abstraction over `chrome.storage`; replace all `localStorage` usage; remove or stub `fetch('/api/...')` so UI runs without backend.
- [ ] **Phase 3:** OAuth in background; Google Calendar fetch in background; UI requests events via messaging; merge Google events into calendar view.
- [ ] **Phase 4:** ICS fetch in background (and optional offscreen for ical.js); “Refresh all” and subscription add/remove use background; remove proxy.
- [ ] **Phase 5:** Decompose API in background (Ollama + OpenAI); “Break down with AI” calls background; store API key in extension storage.
- [ ] **Phase 6 (optional):** Content script on calendar.google.com; inject buttons; message background/side panel to add event or run AI.

---

## 8. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Google Calendar DOM changes | Content script selectors break. Prefer minimal injection; rely on “Open Cadence” and do most work in the side panel. |
| ical.js size in extension | Lazy-load in offscreen document or background; keep service worker bundle small. |
| Ollama not running | Show clear message in UI (“Ollama not detected”); fallback to OpenAI if key is set. |
| Token refresh in service worker | Implement robust refresh in background; persist refresh_token and use it when access_token expires. |

---

## 9. References

- [Chrome Extension MV3 – Side panel](https://developer.chrome.com/docs/extensions/reference/sidePanel/)
- [Chrome Identity (OAuth)](https://developer.chrome.com/docs/extensions/reference/identity/)
- [Chrome Storage](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Optional host permissions](https://developer.chrome.com/docs/extensions/mv3/permission_warnings/#optional_permissions)
- [CRXJS Vite plugin](https://crxjs.dev/vite-plugin) (optional build tool)

---

This plan is the “harder” standalone version: no backend, optional injection. Implementation can follow the phases above and the checklist in §7.
