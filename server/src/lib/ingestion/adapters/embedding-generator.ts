import type { EmbeddingResult } from '../types';
import { getOllamaEmbeddingModel } from '../../env';
import { ollamaEmbed } from '../ollama-client';

export interface EmbeddingGenerator {
  id: string;
  dimensions: number;
  embed(input: string): Promise<EmbeddingResult>;
}

class DeterministicEmbeddingGenerator implements EmbeddingGenerator {
  id = 'deterministic-emb-v1';
  dimensions = 128;

  async embed(input: string): Promise<EmbeddingResult> {
    const vector = new Array<number>(this.dimensions).fill(0);

    for (let i = 0; i < input.length; i += 1) {
      const vectorIndex = i % this.dimensions;
      const code = input.charCodeAt(i);
      vector[vectorIndex] += (code % 31) / 31;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    const normalized = vector.map((value) => value / magnitude);

    return {
      model: this.id,
      dimensions: this.dimensions,
      vector: normalized,
    };
  }
}

class OllamaEmbeddingGenerator implements EmbeddingGenerator {
  id = 'ollama-emb-v1';
  dimensions = 0;
  private readonly model = getOllamaEmbeddingModel();

  async embed(input: string): Promise<EmbeddingResult> {
    try {
      const vector = await ollamaEmbed(this.model, input);
      this.dimensions = vector.length;

      return {
        model: this.model,
        dimensions: vector.length,
        vector,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown embedding failure';
      console.error(
        `[ingestion][embedding] provider=${this.id} model=${this.model} failed: ${reason}`
      );
      throw new Error(
        `Embedding generation failed for provider "${this.id}" and model "${this.model}": ${reason}`
      );
    }
  }
}

export function createEmbeddingGenerator(providerId: string): EmbeddingGenerator {
  if (providerId === 'ollama-emb-v1') {
    return new OllamaEmbeddingGenerator();
  }

  if (providerId === 'deterministic-emb-v1') {
    return new DeterministicEmbeddingGenerator();
  }

  throw new Error(`Unknown embedding provider "${providerId}"`);
}
