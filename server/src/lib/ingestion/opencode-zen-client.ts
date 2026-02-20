import {
  getOpenCodeZenApiKey,
  getOpenCodeZenBaseUrl,
  getOpenCodeZenMaxTokens,
  getOpenCodeZenTemperature,
} from '../env';

type OpenCodeZenCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: unknown;
  };
};

function buildUrl(path: string): string {
  const baseUrl = getOpenCodeZenBaseUrl().replace(/\/+$/, '');
  return `${baseUrl}${path}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : 'Unknown OpenCode Zen error';
}

async function parseJsonResponse(response: Response): Promise<any> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const bodyError =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : typeof payload?.error === 'string'
          ? payload.error
          : `HTTP ${response.status} ${response.statusText}`;
    throw new Error(bodyError);
  }

  return payload;
}

function normalizeCompletionContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  // OpenAI-compatible responses can include structured content parts.
  if (Array.isArray(content)) {
    const combined = content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (part && typeof part === 'object' && typeof (part as any).text === 'string') {
          return (part as any).text;
        }

        return '';
      })
      .join('')
      .trim();

    return combined;
  }

  return '';
}

export async function openCodeZenGenerateJson(
  model: string,
  systemPrompt: string,
  prompt: string
): Promise<string> {
  const apiKey = getOpenCodeZenApiKey();
  const temperature = getOpenCodeZenTemperature();
  const maxTokens = getOpenCodeZenMaxTokens();

  try {
    const response = await fetch(buildUrl('/v1/chat/completions'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
      }),
    });

    const payload = (await parseJsonResponse(response)) as OpenCodeZenCompletionResponse;
    const rawContent = payload.choices?.[0]?.message?.content;
    const output = normalizeCompletionContent(rawContent);

    if (!output) {
      throw new Error('OpenCode Zen completion response was empty');
    }

    return output;
  } catch (error) {
    throw new Error(`OpenCode Zen structurer request failed: ${toErrorMessage(error)}`);
  }
}
