import { ollamaChat } from '@/lib/ollama';
import type { OllamaMessage } from '@/lib/ollama';

export interface DecomposeInput {
  title: string;
  description?: string;
  dueDate?: string;
}

export interface DecomposeSubtask {
  title: string;
  description?: string;
  estimatedMinutes?: number;
  order: number;
}

export interface DecomposeResult {
  subtasks: DecomposeSubtask[];
}

/** Runtime config for LLM (env vars in Node, chrome.storage in extension). */
export interface DecomposeEnv {
  groqApiKey?: string;
  groqModel?: string;
  openaiApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  ollamaApiKey?: string;
}

function getProvider(env: DecomposeEnv): 'groq' | 'ollama' | 'openai' {
  if (env.groqApiKey && env.groqApiKey !== '') {
    return 'groq';
  }
  if (env.openaiApiKey && env.openaiApiKey !== '') {
    return 'openai';
  }
  return 'ollama';
}

function buildUserPrompt(input: DecomposeInput): string {
  const { title, description, dueDate } = input;
  return `
You are an expert study-planning assistant for university students.

Given an assignment, break it down into small, actionable subtasks that a student can schedule on their calendar.

Assignment:
- Title: ${title}
- Due date: ${dueDate ?? 'not specified'}
- Description (may be from Canvas): ${description ?? 'none'}

Guidelines:
- Output 3–10 concrete subtasks.
- Make each subtask small and specific (e.g. "Read section 1.1 and take notes", "Draft outline", "Write introduction", "Create test cases", etc.).
- Include a rough estimated duration in minutes for each subtask (e.g. 45, 60, 90). For large assignments, split work across multiple days.
- Order the subtasks in a sensible sequence from 1..N.
- Do NOT include calendar dates; just describe the work.

Return ONLY valid JSON with this shape (no markdown, no code fence):
{
  "subtasks": [
    {
      "title": "string",
      "description": "string",
      "estimatedMinutes": 60,
      "order": 1
    }
  ]
}
`;
}

/**
 * Core assignment decomposition used by the Next.js API route and the Chrome extension background.
 */
export async function decomposeAssignment(
  input: DecomposeInput,
  env: DecomposeEnv = {}
): Promise<DecomposeResult> {
  if (!input.title?.trim()) {
    throw new Error('title is required');
  }

  const provider = getProvider(env);
  const userPrompt = buildUserPrompt(input);

  const messages: OllamaMessage[] = [
    { role: 'system', content: 'You are a helpful study planner. Reply only with valid JSON.' },
    { role: 'user', content: userPrompt },
  ];

  let content: string;

  if (provider === 'groq') {
    const key = env.groqApiKey!;
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model:
          env.groqModel ||
          (typeof process !== 'undefined' ? process.env?.GROQ_MODEL : undefined) ||
          'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a helpful study planner that returns strict JSON.' },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('Groq API error:', response.status, errorText);
      throw new Error('Failed to call language model.');
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message?.content;
    if (!msg || typeof msg !== 'string') {
      throw new Error('Unexpected model response format.');
    }
    content = msg;
  } else if (provider === 'ollama') {
    const baseUrlRaw =
      env.ollamaBaseUrl && env.ollamaBaseUrl !== ''
        ? env.ollamaBaseUrl
        : typeof process !== 'undefined' && process.env?.OLLAMA_BASE_URL
          ? process.env.OLLAMA_BASE_URL
          : 'http://localhost:11434';
    const baseUrl = baseUrlRaw.startsWith('http') ? baseUrlRaw : `http://${baseUrlRaw}`;
    const model =
      env.ollamaModel ||
      (typeof process !== 'undefined' ? process.env?.OLLAMA_MODEL : undefined) ||
      'llama3.2';

    content = await ollamaChat(messages, {
      baseUrl,
      model,
      temperature: 0.3,
      stream: false,
      apiKey: env.ollamaApiKey,
    });
  } else {
    const key = env.openaiApiKey!;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: 'You are a helpful study planner that returns strict JSON.' },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error('Failed to call language model.');
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message?.content;
    if (!msg || typeof msg !== 'string') {
      throw new Error('Unexpected model response format.');
    }
    content = msg;
  }

  const trimmed = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  let parsed: { subtasks?: unknown[] };
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    console.error('Failed to parse model JSON:', e, content);
    throw new Error('Model did not return valid JSON.');
  }

  if (!Array.isArray(parsed.subtasks)) {
    throw new Error('Model response missing "subtasks" array.');
  }

  return { subtasks: parsed.subtasks as DecomposeSubtask[] };
}
