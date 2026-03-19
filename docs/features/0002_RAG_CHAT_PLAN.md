# 0002 — RAG Chat

## Description

A new **RAG Chat** page in the sidebar where users can converse with Gemini 2.5 Flash. Before the LLM responds, it retrieves the most relevant document chunks from the user's embeddings database via cosine similarity, injecting them as context into the prompt.

## Data Flow

1. User sends a message from the RAG Chat UI.
2. `POST /api/v1/protected/chat` receives `{ message, history }`.
3. The server embeds the user message using the configured `EmbeddingGenerator`.
4. A cosine similarity search over `chunk_embeddings` (JSONB) returns the top-K chunks scoped to the user's documents.
5. A system prompt is constructed with the retrieved chunks as context.
6. Gemini 2.5 Flash is called with the system prompt, conversation history, and user message.
7. The response and source citations are returned to the UI.

## Files Created

- `server/src/lib/rag/search.ts` — Cosine similarity search over JSONB embeddings, joins `chunk_embeddings` → `document_chunks` → `uploaded_documents` scoped by `user_id`.
- `server/src/lib/rag/gemini-chat.ts` — Multi-turn Gemini REST API client for plain-text chat (not JSON mode). Uses `getGeminiChatModel()` from env.
- `server/src/lib/rag/chat.ts` — RAG orchestration: embed query → search → build prompt → call LLM → return `{ reply, sources }`.
- `ui/src/pages/RagChat.tsx` — Chat interface with scrollable message list, auto-resizing textarea, loading state, error display, and collapsible source citations per response.

## Files Modified

- `server/src/lib/env.ts` — Added `getGeminiChatModel()` reading `GEMINI_CHAT_MODEL` (default `gemini-2.5-flash`).
- `server/src/api.ts` — Added `POST /protected/chat` route with input validation, calls `ragChat()`.
- `ui/src/lib/serverComm.ts` — Added `sendChatMessage()`, `ChatMessage`, `ChatSource`, `ChatResponse` types.
- `ui/src/App.tsx` — Added `/rag-chat` route pointing to `RagChat` component.
- `ui/src/components/appSidebar.tsx` — Added "RAG Chat" sidebar item with `MessageSquare` icon.

## Key Decisions

- **No new database tables** for v1. Conversation history is kept in client-side React state.
- **No streaming** for v1. Full response returned at once; SSE can be layered on later.
- **Cosine similarity on JSONB** arrays in raw SQL. Adequate for small-to-medium datasets. Migrating to `pgvector` with HNSW indexes is the natural next step for scale.
- **Gemini roles**: conversation history maps `assistant` → `model` (Gemini's role name).
