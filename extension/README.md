# Cadence Chrome extension

Run Cadence **on [Google Calendar](https://calendar.google.com)** without opening the separate Cadence web app.

## What you get

- **Side panel** (iframe) injected on `calendar.google.com` — toggle with the **Cadence** floating button.
- **Tasks**, **multi-segment work hours**, **break / focus** settings — stored in `chrome.storage.local` (same keys as the web app where possible).
- **Connect Google** — OAuth in the extension (`chrome.identity.launchWebAuthFlow`). Uses your **OAuth Client ID** from the options page. Add the shown **redirect URI** in Google Cloud Console.
- **Distribute** — schedules tasks with `CalendarAIAgent` using Google busy times + ICS feeds + existing Cadence blocks.
- **AI breakdown** — `CADENCE_DECOMPOSE` in the service worker (Ollama / OpenAI keys from options).
- **ICS HTTPS** feeds — fetched in the background (no Next.js proxy).

## Build

From the repository root:

```bash
npm install
npm run build:extension
```

Outputs:

- `extension/dist/background.js` — service worker  
- `extension/dist/content.js` — injects panel + toggle  
- `extension/dist/panel.js` + `panel.css` — React UI  
- `extension/dist/options.js` + `options.css` — settings page  

## Load in Chrome

1. `chrome://extensions` → **Developer mode** → **Load unpacked** → select the **`extension/`** folder (contains `manifest.json` and `dist/` after build).

2. Open **https://calendar.google.com** — click **Cadence** (bottom-right) to show/hide the panel.

3. **Extension options** (right-click the extension icon → **Options**, or the **Options** button in the panel):

   - Copy the **Authorized redirect URI** into your [Google Cloud OAuth client](https://console.cloud.google.com/apis/credentials) (Web or Desktop client).
   - Paste **OAuth Client ID**, optional **OpenAI** key, **Ollama** URL/model.
   - **Save**.

4. In the panel, **Connect Google** and sign in. Then add tasks, ICS URLs, and **Distribute**.

## Shared code

- `lib/cadence-messages.ts` — message types for UI ↔ background.  
- `lib/cadence-request.ts` — `cadenceRequest()` helper (extension pages only).  
- `lib/decompose-assignment.ts`, `lib/google-calendar-rest.ts`, `lib/ai-agent.ts` — used by the service worker and/or panel bundle.

## Note on scheduled blocks

Scheduled **Cadence** blocks are listed in the panel and stored locally. They are **not** automatically inserted as native Google Calendar events yet (that can be added via Calendar API `events.insert` in a follow-up).
