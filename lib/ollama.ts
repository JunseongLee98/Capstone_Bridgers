/**
 * Ollama API client for local/cloud LLM calls.
 * Base URL: http://localhost:11434/api (local) or https://ollama.com/api (cloud)
 * @see https://docs.ollama.com/api/chat.md
 */

/** Ollama API root (no trailing slash). Requests go to {baseUrl}/api/chat */
const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.2';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatOptions {
  baseUrl?: string;
  model?: string;
  temperature?: number;
  stream?: boolean;
}

/**
 * Send a chat request to Ollama and return the assistant's reply.
 */
export async function ollamaChat(
  messages: OllamaMessage[],
  options: OllamaChatOptions = {}
): Promise<string> {
  let baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/$/,
    ''
  );
  if (baseUrl.endsWith('/api')) baseUrl = baseUrl.slice(0, -4);
  const model = options.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
  const stream = options.stream ?? false;

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream,
      ...(options.temperature != null && { options: { temperature: options.temperature } }),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Ollama API error ${response.status}: ${text || response.statusText}`);
  }

  const data = await response.json();
  const content = data.message?.content;

  if (content == null || typeof content !== 'string') {
    throw new Error('Ollama response missing message.content');
  }

  return content;
}
