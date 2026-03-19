import { getEmbeddingProvider } from '../env';
import { logger } from '../logger';
import { createEmbeddingGenerator } from '../ingestion/adapters/embedding-generator';
import { searchSimilarChunks, type SearchResult } from './search';
import { geminiChat, type ChatTurn } from './gemini-chat';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChatSource = {
  documentName: string;
  chunkText: string;
  similarity: number;
};

export type RagChatResponse = {
  reply: string;
  sources: ChatSource[];
};

const TOP_K = 5;

function buildSystemPrompt(chunks: SearchResult[]): string {
  const contextBlocks = chunks
    .map(
      (chunk, i) =>
        `[Source ${i + 1}: ${chunk.documentName}]\n${chunk.text}`
    )
    .join('\n\n---\n\n');

  return `You are a helpful assistant that answers questions based on the user's uploaded documents.

Use the following retrieved document excerpts to answer the user's question. If the excerpts don't contain enough information to answer, say so honestly rather than making things up.

When you reference information from the documents, mention which source document it came from.

--- RETRIEVED CONTEXT ---
${contextBlocks}
--- END CONTEXT ---`;
}

export async function ragChat(
  userId: string,
  message: string,
  history: ChatMessage[]
): Promise<RagChatResponse> {
  const embeddingProvider = getEmbeddingProvider();
  const generator = createEmbeddingGenerator(embeddingProvider);

  logger.info(`[rag][chat] embedding query, provider=${embeddingProvider}`);
  const queryEmbedding = await generator.embed(message);

  logger.info(`[rag][chat] searching for similar chunks, userId=${userId} topK=${TOP_K}`);
  const searchResults = await searchSimilarChunks(queryEmbedding.vector, userId, TOP_K);

  if (searchResults.length === 0) {
    logger.info('[rag][chat] no chunks found, responding without context');
  }

  const systemPrompt = searchResults.length > 0
    ? buildSystemPrompt(searchResults)
    : 'You are a helpful assistant. The user has not uploaded any documents yet, or no relevant content was found. Let them know they should upload documents first for RAG-powered answers.';

  const conversation: ChatTurn[] = [];
  for (const msg of history) {
    conversation.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      content: msg.content,
    });
  }
  conversation.push({ role: 'user', content: message });

  logger.info(`[rag][chat] calling Gemini with ${searchResults.length} context chunks`);
  const reply = await geminiChat(systemPrompt, conversation);

  const sources: ChatSource[] = searchResults.map((r) => ({
    documentName: r.documentName,
    chunkText: r.text,
    similarity: r.similarity,
  }));

  return { reply, sources };
}
