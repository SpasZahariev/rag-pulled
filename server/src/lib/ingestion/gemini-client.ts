import { getGeminiApiKey, getGeminiBaseUrl, getGeminiTemperature } from '../env';

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

export async function geminiGenerateJson(
  model: string,
  systemPrompt: string,
  prompt: string
): Promise<string> {
  const apiKey = getGeminiApiKey();
  const baseUrl = getGeminiBaseUrl().replace(/\/+$/, '');
  const temperature = getGeminiTemperature();
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature,
          responseMimeType: 'application/json',
        },
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
        `Gemini response was empty (finishReason="${finishReason}", model="${model}")`
      );
    }

    return text;
  } catch (error) {
    throw new Error(`Gemini structurer request failed: ${toErrorMessage(error)}`);
  }
}
