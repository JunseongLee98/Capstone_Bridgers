/**
 * Injects Cadence side panel (iframe) on Google Calendar.
 */
const FRAME_ID = 'cadence-calendar-panel-frame';
const TOGGLE_ID = 'cadence-calendar-toggle';

function inject(): void {
  if (document.getElementById(FRAME_ID)) return;

  const style = document.createElement('style');
  style.textContent = `
    #${FRAME_ID} {
      position: fixed;
      top: 0;
      right: 0;
      width: min(400px, 100vw);
      height: 100vh;
      border: none;
      z-index: 2147483646;
      box-shadow: -6px 0 32px rgba(15, 23, 42, 0.15);
      background: #fff;
    }
    #${FRAME_ID}.cadence-hidden { display: none !important; }
    #${TOGGLE_ID} {
      position: fixed;
      bottom: 88px;
      right: 16px;
      z-index: 2147483647;
      padding: 10px 16px;
      border-radius: 999px;
      border: none;
      background: #4f46e5;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: system-ui, sans-serif;
      box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);
    }
    #${TOGGLE_ID}:hover { filter: brightness(1.05); }
  `;
  document.head.appendChild(style);

  const iframe = document.createElement('iframe');
  iframe.id = FRAME_ID;
  iframe.title = 'Cadence';
  iframe.src = chrome.runtime.getURL('panel.html');

  const toggle = document.createElement('button');
  toggle.id = TOGGLE_ID;
  toggle.type = 'button';
  toggle.textContent = 'Cadence';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.addEventListener('click', () => {
    const hidden = iframe.classList.toggle('cadence-hidden');
    toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    toggle.textContent = hidden ? 'Cadence' : 'Hide';
  });

  document.documentElement.appendChild(iframe);
  document.documentElement.appendChild(toggle);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inject);
} else {
  inject();
}
