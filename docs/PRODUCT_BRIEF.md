# Product Brief: Local-First RAG Workspace

## 1) Project Overview / Description
Build a one-stop web application where each user has a private workspace to upload personal/project data, automatically generate embeddings, store vectors in the project's local embedded Postgres instance, and chat with an LLM powered by retrieval-augmented generation (RAG).

The system must run fully local in development with zero required cloud cost and provide a simple end-to-end flow: ingest data -> index data -> chat with grounded responses.

## 2) Target Audience
- Developers and technical users who want a private, local RAG environment.
- Teams prototyping internal knowledge assistants before production deployment.
- Cost-sensitive users who want offline/local-first experimentation.

## 3) Primary Benefits / Features
- **User workspace pages**: authenticated user area to manage uploaded content.
- **Data ingestion**: upload common files/text and register them for processing.
- **Embedding pipeline**: background/simple trigger to chunk data, create embeddings, and write vectors + metadata into embedded Postgres.
- **RAG chat page**: text chat UI that retrieves relevant context and augments LLM responses.
- **Traceable responses**: show cited chunks/sources used for each answer when possible.
- **Local-only operation**: no mandatory paid APIs; support local model providers and optional MCP-tool-enabled integrations.

## 4) High-Level Tech / Architecture
- **Frontend**: React (Vite) + Tailwind + shadcn/ui for upload and chat experiences.
- **Auth**: Firebase Auth for user identity and per-user data scoping.
- **API layer**: Hono server endpoints for upload, indexing, retrieval, and chat orchestration.
- **Data layer**: embedded Postgres in this repo as the vector + metadata store (RAG index).
- **RAG flow**:
  1. User uploads data.
  2. Backend parses/chunks content.
  3. Embeddings are generated via local model/provider.
  4. Chunks + embeddings are stored in embedded Postgres.
  5. Chat requests run retrieval on user-scoped vectors and inject context into LLM prompts.
- **Runtime constraints**: development environment is Linux/NixOS + Wayland/Hyprland + Ghostty + Nushell; all core workflows should be CLI-friendly and local-first.
