import { NextRequest, NextResponse } from 'next/server';
import { ollamaChat } from '@/lib/ollama';

/**
 * POST /api/assignments/decompose
 *
 * Uses Ollama (local or OLLAMA_BASE_URL) when configured; otherwise OpenAI if OPENAI_API_KEY is set.
 *
 * Body:
 * {
 *   title: string;
 *   description?: string;
 *   dueDate?: string; // ISO string
 * }
 *
 * Response:
 * {
 *   subtasks: Array<{
 *     title: string;
 *     description?: string;
 *     estimatedMinutes?: number;
 *     order: number;
 *   }>
 * }
 */
function getProvider(): 'ollama' | 'openai' | 'groq' {
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== '') return 'groq';
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== '') return 'openai';
  return 'ollama';
}

export async function POST(request: NextRequest) {
  const provider = getProvider();

  const body = await request.json();
  const { title, description, dueDate } = body as {
    title?: string;
    description?: string;
    dueDate?: string;
  };

  if (!title) {
    return NextResponse.json(
      { error: 'title is required' },
      { status: 400 }
    );
  }

  const userPrompt = `
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

  try {
    let content: string;

    if (provider === 'groq') {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
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
        return NextResponse.json({ error: 'Failed to call language model.' }, { status: 502 });
      }

      const data = await response.json();
      const msg = data.choices?.[0]?.message?.content;
      if (!msg || typeof msg !== 'string') {
        return NextResponse.json({ error: 'Unexpected model response format.' }, { status: 500 });
      }
      content = msg;
    } else if (provider === 'ollama') {
      const baseUrl =
        process.env.OLLAMA_BASE_URL && process.env.OLLAMA_BASE_URL !== ''
          ? process.env.OLLAMA_BASE_URL
          : 'http://localhost:11434';
      content = await ollamaChat(
        [
          { role: 'system', content: 'You are a helpful study planner. Reply only with valid JSON.' },
          { role: 'user', content: userPrompt },
        ],
        {
          baseUrl: baseUrl.startsWith('http') ? baseUrl : `http://${baseUrl}`,
          model: process.env.OLLAMA_MODEL ?? 'llama3.2',
          temperature: 0.3,
          stream: false,
        }
      );
    } else {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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
        return NextResponse.json(
          { error: 'Failed to call language model.' },
          { status: 502 }
        );
      }

      const data = await response.json();
      const msg = data.choices?.[0]?.message?.content;
      if (!msg || typeof msg !== 'string') {
        return NextResponse.json(
          { error: 'Unexpected model response format.' },
          { status: 500 }
        );
      }
      content = msg;
    }

    // Strip optional markdown code fence if present
    const trimmed = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    let parsed: { subtasks?: unknown[] };
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      console.error('Failed to parse model JSON:', e, content);
      return NextResponse.json(
        { error: 'Model did not return valid JSON.' },
        { status: 500 }
      );
    }

    if (!Array.isArray(parsed.subtasks)) {
      return NextResponse.json(
        { error: 'Model response missing "subtasks" array.' },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Error decomposing assignment:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to decompose assignment.',
      },
      { status: 500 }
    );
  }
}

