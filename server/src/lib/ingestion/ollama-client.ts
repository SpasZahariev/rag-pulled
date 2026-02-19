import { getOllamaBaseUrl, getOllamaNumCtx, getOllamaTemperature } from '../env';

type OllamaEmbedResponse = {
  embedding?: unknown;
};

type OllamaGenerateResponse = {
  response?: unknown;
};

function buildUrl(path: string): string {
  const baseUrl = getOllamaBaseUrl().replace(/\/+$/, '');
  return `${baseUrl}${path}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : 'Unknown Ollama error';
}

async function parseJsonResponse(response: Response): Promise<any> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const bodyError =
      typeof payload?.error === 'string'
        ? payload.error
        : `HTTP ${response.status} ${response.statusText}`;
    throw new Error(bodyError);
  }

  return payload;
}

export async function ollamaEmbed(model: string, input: string): Promise<number[]> {
  try {
    const response = await fetch(buildUrl('/api/embeddings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: input,
      }),
    });

    const payload = (await parseJsonResponse(response)) as OllamaEmbedResponse;
    if (!Array.isArray(payload.embedding)) {
      throw new Error('Ollama embedding response did not include a numeric vector');
    }

    const vector = payload.embedding.map((value) => Number(value));
    const allNumbers = vector.every((value) => Number.isFinite(value));
    if (!allNumbers || vector.length === 0) {
      throw new Error('Ollama embedding vector is empty or contains non-numeric values');
    }

    return vector;
  } catch (error) {
    throw new Error(`Ollama embedding request failed: ${toErrorMessage(error)}`);
  }
}

export async function ollamaGenerateJson(
  model: string,
  systemPrompt: string,
  prompt: string
): Promise<string> {
  const numCtx = getOllamaNumCtx();
  const temperature = getOllamaTemperature();

  try {
    const response = await fetch(buildUrl('/api/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: `${systemPrompt}\n\n${prompt}`,
        stream: false,
        options: {
          temperature,
          ...(numCtx ? { num_ctx: numCtx } : {}),
        },
      }),
    });

    const payload = (await parseJsonResponse(response)) as OllamaGenerateResponse;
    if (typeof payload.response !== 'string' || payload.response.trim().length === 0) {
      throw new Error('Ollama generate response was empty');
    }

    return payload.response.trim();
  } catch (error) {
    throw new Error(`Ollama structurer request failed: ${toErrorMessage(error)}`);
  }
}
