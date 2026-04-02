import { NextRequest, NextResponse } from 'next/server';
import { decomposeAssignment } from '@/lib/decompose-assignment';

/**
 * POST /api/assignments/decompose
 *
 * Uses Ollama (local or OLLAMA_BASE_URL) when configured; otherwise OpenAI if OPENAI_API_KEY is set.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, description, dueDate } = body as {
    title?: string;
    description?: string;
    dueDate?: string;
  };

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  try {
    const result = await decomposeAssignment(
      { title, description, dueDate },
      {
        openaiApiKey: process.env.OPENAI_API_KEY,
        ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
        ollamaModel: process.env.OLLAMA_MODEL,
        ollamaApiKey: process.env.OLLAMA_API_KEY,
      }
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error decomposing assignment:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to decompose assignment.';
    const status =
      message === 'Failed to call language model.' || message.includes('language model')
        ? 502
        : message === 'title is required'
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
