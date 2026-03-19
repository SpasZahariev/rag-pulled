import { getGeminiApiKey, getGeminiBaseUrl, getGeminiChatModel, getGeminiTemperature } from '../env';
import { logger } from '../logger';

export type ChatRole = 'user' | 'model';

export type ChatTurn = {
  role: ChatRole;
  content: string;
};

type GeminiCandidate = {
  content?: {
    parts?: Array<{ text?: string }>;
    role?: string;
  };
  finishReason?: string;
};

type GeminiGenerateContentResponse = {
  candidates?: GeminiCandidate[];
  error?: { message?: string; code?: number; status?: string };
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Unknown Gemini error';
}

/**
 * Multi-turn chat completion via the Gemini REST API.
 * Unlike geminiGenerateJson, this returns plain text (no responseMimeType constraint)
 * and accepts a full conversation history.
 */
export async function geminiChat(
  systemPrompt: string,
  conversation: ChatTurn[]
): Promise<string> {
  const model = getGeminiChatModel();
  const apiKey = getGeminiApiKey();
  const baseUrl = getGeminiBaseUrl().replace(/\/+$/, '');
  const temperature = getGeminiTemperature();
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = conversation.map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.content }],
  }));

  logger.debug(`[rag][gemini-chat] model=${model} turns=${contents.length}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature },
      }),
    });

    const payload = (await response.json()) as GeminiGenerateContentResponse;

    if (!response.ok) {
      const apiError = payload.error?.message ?? `HTTP ${response.status} ${response.statusText}`;
      throw new Error(apiError);
    }

    const candidate = payload.candidates?.[0];
    const text = candidate?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim();

    if (!text) {
      const finishReason = candidate?.finishReason ?? 'unknown';
      throw new Error(
        `Gemini chat response was empty (finishReason="${finishReason}", model="${model}")`
      );
    }

    return text;
  } catch (error) {
    throw new Error(`Gemini chat request failed: ${toErrorMessage(error)}`);
  }
}
