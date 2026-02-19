import type { EmbeddingResult } from '../types';

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

export function createEmbeddingGenerator(providerId: string): EmbeddingGenerator {
  if (providerId === 'deterministic-emb-v1') {
    return new DeterministicEmbeddingGenerator();
  }

  // Pipeline-first default: unknown providers fall back to deterministic adapter.
  return new DeterministicEmbeddingGenerator();
}
