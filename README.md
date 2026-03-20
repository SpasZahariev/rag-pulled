# RagPull: Full-Stack RAG Application

An end-to-end Retrieval-Augmented Generation (RAG) platform built to demonstrate a production-ready, local-first architecture for document ingestion, semantic search, and AI-driven chat. 

This project was built to showcase a robust technical foundation integrating modern frontend frameworks with a scalable, async backend processing pipeline.

## 🚀 Key Features

*   **Asynchronous Document Ingestion:** A robust backend worker queue built on PostgreSQL orchestrates the extraction, chunking, and embedding of various document types (PDF, CSV, TXT, etc.).
*   **Local AI Integration:** Leverages local LLMs via Ollama (`qwen2.5:14b-instruct` for document structuring, `mxbai-embed-large` for embeddings) for entirely private, offline processing.
*   **RAG Chat Interface:** An intuitive chat UI where users can query their uploaded knowledge base. The AI responses include precise citations, revealing exactly which document chunks and vector match percentages informed the answer.
*   **Production-Ready Architecture:** Designed with a decoupled frontend (React/Vite) and backend (Hono API), complete with authentication (Firebase) and a relational database (PostgreSQL/Drizzle), ensuring a smooth path from local development to cloud deployment.

## 🛠️ Tech Stack

*   **Frontend:** React, TypeScript, Vite, Tailwind CSS, ShadCN UI
*   **Backend:** Node.js, Hono API, background worker processes
*   **Database & ORM:** PostgreSQL, Drizzle ORM (handling both application data and vector storage/queues)
*   **AI & Embeddings:** Ollama (Local LLMs), pluggable provider architecture
*   **Authentication:** Firebase Auth (with local emulator support)
*   **Deployment:** Cloudflare Pages & Workers ready

## ⚡ Architecture & Processing Flow

The core of RagPull is its asynchronous ingestion pipeline and subsequent semantic search capabilities. Here is how data flows through the system:

```mermaid
flowchart TD
    %% Styling
    classDef user fill:#e2e8f0,stroke:#64748b,color:#0f172a
    classDef frontend fill:#bae6fd,stroke:#3b82f6,color:#0f172a
    classDef api fill:#fef08a,stroke:#0ea5e9,color:#0f172a
    classDef worker fill:#fed7aa,stroke:#eab308,color:#0f172a
    classDef db fill:#bbf7d0,stroke:#22c55e,color:#0f172a
    classDef ai fill:#fbcfe8,stroke:#ec4899,color:#0f172a

    %% Nodes
    User(("User")):::user
    
    subgraph Frontend [React UI]
        UploadUI["Upload Interface"]:::frontend
        ChatUI["RAG Chat Interface"]:::frontend
    end

    subgraph Backend [Hono API]
        UploadRoute["POST /uploads"]:::api
        ChatRoute["POST /chat"]:::api
    end

    subgraph QueueWorker [Async Processing]
        Worker["Background Worker"]:::worker
        Structurer["Document Structurer<br/>(Qwen2.5)"]:::ai
        Embedder["Embedding Model<br/>(mxbai-embed)"]:::ai
    end

    subgraph Database [PostgreSQL]
        AppDB[("App Data<br/>(Users, Jobs)")]:::db
        VectorDB[("Vector Store<br/>(pgvector)")]:::db
    end

    %% Upload Flow
    User -->|Uploads Document| UploadUI
    UploadUI -->|Multipart File| UploadRoute
    UploadRoute -->|Enqueues Job| AppDB
    
    %% Ingestion Flow
    AppDB -->|Claims Job| Worker
    Worker -->|Extracts Text| Structurer
    Structurer -->|Structured Chunks| Worker
    Worker -->|Generates Vectors| Embedder
    Embedder -->|Embeddings| Worker
    Worker -->|Persists Chunks & Vectors| VectorDB

    %% Chat Flow
    User -->|Asks Question| ChatUI
    ChatUI -->|Query| ChatRoute
    ChatRoute -->|Embeds Query| Embedder
    Embedder -->|Query Vector| ChatRoute
    ChatRoute -->|Semantic Search| VectorDB
    VectorDB -->|Top K Chunks| ChatRoute
    ChatRoute -->|Generates Answer| AIModel["LLM Generator"]:::ai
    AIModel -->|Response + Citations| ChatUI
```

## 📸 Application Showcase

*(Please take the screenshots as discussed and place them in the `docs/images/` folder. They will automatically render here once added).*

### The Dashboard
The central hub for navigating the application.

![Home Page](docs/images/home.png)

### Data Ingestion
The interface for uploading documents, complete with real-time, granular progress tracking as the background worker processes the queue.

![Upload Processing](docs/images/upload.png)

### Semantic Search & Chat
The conversational interface for querying the knowledge base. Notice the "Sources" expansion, which provides transparency into the RAG process by showing the exact matched chunks.

![RAG Chat Interface](docs/images/chat.png)

## 💻 Local Development

Everything needed to run RagPull is containerized or embedded for a seamless local developer experience.

1.  **Install dependencies:**
    ```bash
    pnpm install
    ```
2.  **Start all services:**
    This single command spins up the frontend, backend API, async worker, embedded PostgreSQL database, and local Firebase Auth emulator.
    ```bash
    pnpm run dev
    ```
3.  **Local AI Setup:**
    Ensure Ollama is installed and the required models are pulled:
    ```bash
    ollama pull qwen2.5:14b-instruct
    ollama pull mxbai-embed-large
    ```

For detailed setup, port management, and production deployment guides, refer to the `docs/` directory.
