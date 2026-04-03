const KEYS = {
  googleOAuthClientId: 'cadence_google_oauth_client_id',
  openaiApiKey: 'cadence_openai_api_key',
  ollamaBaseUrl: 'cadence_ollama_base_url',
  ollamaModel: 'cadence_ollama_model',
} as const;

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

async function init(): Promise<void> {
  const redirect = `https://${chrome.runtime.id}.chromiumapp.org`;
  (document.getElementById('redirect-uri') as HTMLPreElement).textContent = redirect;

  const data = await chrome.storage.local.get([
    KEYS.googleOAuthClientId,
    KEYS.openaiApiKey,
    KEYS.ollamaBaseUrl,
    KEYS.ollamaModel,
  ]);

  (document.getElementById('client-id') as HTMLInputElement).value =
    (data[KEYS.googleOAuthClientId] as string) || '';
  (document.getElementById('openai-key') as HTMLInputElement).value =
    (data[KEYS.openaiApiKey] as string) || '';
  (document.getElementById('ollama-url') as HTMLInputElement).value =
    (data[KEYS.ollamaBaseUrl] as string) || '';
  (document.getElementById('ollama-model') as HTMLInputElement).value =
    (data[KEYS.ollamaModel] as string) || '';

  document.getElementById('save')?.addEventListener('click', async () => {
    const status = $('status');
    status.textContent = '';
    await chrome.storage.local.set({
      [KEYS.googleOAuthClientId]: (document.getElementById('client-id') as HTMLInputElement).value.trim(),
      [KEYS.openaiApiKey]: (document.getElementById('openai-key') as HTMLInputElement).value.trim(),
      [KEYS.ollamaBaseUrl]: (document.getElementById('ollama-url') as HTMLInputElement).value.trim() || 'http://localhost:11434',
      [KEYS.ollamaModel]: (document.getElementById('ollama-model') as HTMLInputElement).value.trim() || 'llama3.2',
    });
    status.textContent = 'Saved.';
  });
}

init().catch(console.error);
