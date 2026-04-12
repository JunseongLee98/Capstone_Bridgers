import type { CadenceMessage, CadenceResponse } from '@/lib/cadence-messages';

/**
 * Call the Cadence extension background from a panel/options page (extension context only).
 */
export async function cadenceRequest<T = unknown>(message: CadenceMessage): Promise<T> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('Cadence extension API is only available inside the extension.');
  }

  return new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (res: CadenceResponse<T>) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      if (!res || !res.ok) {
        const msg =
          res && 'error' in res && typeof res.error === 'string' ? res.error : 'Unknown error';
        reject(new Error(msg));
        return;
      }
      resolve(res.data as T);
    });
  });
}
