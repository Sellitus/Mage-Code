# MageCode Module

## Purpose

MageCode is an internal module designed to enhance Roo Code's capabilities by integrating local code intelligence and multi-tiered language model orchestration. It aims to provide more contextually relevant assistance and potentially reduce reliance on external cloud services for certain tasks by leveraging local processing when feasible and efficient.

## Architecture Overview

MageCode consists of several key components working together:

1.  **Local Code Intelligence Engine (LCIE - `src/magecode/intelligence`)**:

    - Responsible for parsing workspace files (`parser`), generating embeddings (`embedding`), storing code elements and relationships (`storage`), and managing vector indices (`vector`).
    - Includes a `SyncService` (`sync`) to watch for file changes and keep the intelligence data up-to-date via a worker pool (`syncWorker.ts`).

2.  **Relevancy Engine (`src/magecode/relevancy`)**:

    - Uses retrievers (`retrievers` - e.g., `VectorRetriever`, `GraphRetriever`) to fetch potentially relevant code snippets from the LCIE based on the user's query and context.
    - Employs scorers (`scoring` - e.g., `HybridScorer`) to rank the retrieved items based on similarity, recency, proximity, etc.

3.  **Multi-Model Orchestrator (MMO - `src/magecode/orchestration`)**:

    - Manages different language model tiers (`tiers` - e.g., `LocalModelTier`, `CloudModelTier`).
    - Uses a `ModelRouter` (`router`) to decide which tier is most appropriate for a given request based on factors like task type, prompt complexity, and user preference (`config/settings.ts`).
    - Handles prompt formatting (`prompt`) and caching (`LRUCache`).
    - Provides fallback logic if a preferred tier fails.

4.  **Agent (`src/magecode/agent.ts`)**:

    - The main entry point for handling user tasks when MageCode mode is active.
    - Orchestrates the overall workflow:
        - Retrieves context using the `RelevancyEngine`.
        - Uses the `MMO` to generate a plan (sequence of steps).
        - Executes the plan step-by-step.
        - Uses registered `Tools` (`src/magecode/tools`) via a `ToolRegistry` to perform actions like reading files.
        - Uses the `MMO` again to generate output for each step based on context and tool results.
        - Manages task state and progress reporting (`context/agentContext.ts`, `utils/progress.ts`).

5.  **Tools (`src/magecode/tools`)**:

    - Self-contained units for specific actions (e.g., `FileReader`). Managed by the `ToolRegistry`.

6.  **Utilities (`src/magecode/utils`)**:
    - Shared utilities like logging (`logging.ts`), custom errors (`errors.ts`), and resource management (`resourceGovernor.ts`).

## Component Interaction Diagram

```mermaid
graph TD
    subgraph User Interaction
        UI(VS Code UI / Commands)
    end

    subgraph Roo-Code Core
        Ext(extension.ts) --> CP(ClineProvider.ts)
    end

    subgraph MageCode (src/magecode)
        Init(initialize.ts) -. Initializes .-> Factory(factory.ts) & CoreServices(DB, VectorIndex, EmbeddingSvc, SyncSvc, Governor)

        Factory -- Creates --> AgentDeps(Agent Dependencies)

        AgentDeps --> Agent(Agent)
        AgentDeps --> MMO(MMO)
        AgentDeps --> Relevancy(RelevancyEngine)
        AgentDeps --> ToolReg(ToolRegistry)

        Agent --> MMO; Agent --> Relevancy; Agent --> ToolReg; Agent --> Logger(Logger)

        MMO --> LocalTier(LocalModelTier); MMO --> CloudTier(CloudModelTier); MMO --> Logger

        Relevancy --> VectorRet(VectorRetriever); Relevancy --> GraphRet(GraphRetriever); Relevancy --> Logger
        VectorRet --> VectorIndex; GraphRet --> DBMgr

        CoreServices --> SyncSvc

        SyncSvc --> Parser(MageParser); SyncSvc --> EmbedSvc(EmbeddingService); SyncSvc --> VectorIndex; SyncSvc --> DBMgr; SyncSvc --> Logger; SyncSvc --> MMO; SyncSvc --> Governor

        ToolReg -- Registers --> Tools(FileReaderTool, etc); ToolReg --> Logger
        Tools --> Logger

        subgraph Core Services
             DBMgr(DatabaseManager); VectorIndex; EmbedSvc(EmbeddingService); SyncSvc(SyncService); Governor(ResourceGovernor)
        end

        subgraph Utils (src/magecode/utils)
            Logger(Logger); Errors(Custom Errors); Progress(ProgressReporter)
        end
    end

    UI --> Ext
    CP -- Triggers --> Init
    Init -- Creates --> CoreServices
    CP -- Uses --> Factory -- Provides --> AgentDeps
    CP -- Uses --> Agent
```

_(Note: Diagram simplified for clarity)_
