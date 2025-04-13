---


## **Design Document: CodeWeaver Agent Mode - Roo-Code Extension Enhancement**

**Version:** 1.1
**Date:** April 12, 2025
**Author:** Gemini (acting as Senior Google SWE)
**Status:** Final Proposed Design

**1. Introduction**

**1.1. Purpose & Scope**
This document details the technical design for "CodeWeaver," a new, optional agentic coding mode integrated within the existing Roo-Code VS Code extension. CodeWeaver aims to provide a high-performance, token-efficient alternative to the default Roo-Code agent logic by leveraging extensive local code analysis, intelligent context retrieval, and flexible multi-model LLM orchestration.

The scope encompasses the architecture of the CodeWeaver mode, detailed design of its core components, the strategy for integration into the Roo-Code extension (`consolidated_code.Mage-Code.typescript.txt` structure considered) with minimal disruption, comprehensive testing procedures, performance considerations, security measures, and a phased implementation plan.

**1.2. Goals & Objectives**

* **Primary:**
    * Implement "CodeWeaver" as a user-selectable agent mode within Roo-Code.
    * Maximize token efficiency in CodeWeaver mode, significantly reducing LLM API costs.
    * Achieve high performance and responsiveness in CodeWeaver mode, especially for local intelligence operations.
* **Secondary:**
    * Provide robust and reliable agentic capabilities (planning, context understanding, code generation/modification, tool use) within CodeWeaver mode.
    * Ensure CodeWeaver is maintainable, testable, and scalable.
* **Constraints:**
    * **Minimal Modification:** Changes to original Roo-Code source files MUST be minimized to absolute necessity (primarily for mode dispatch and configuration), ensuring ease of merging upstream Roo-Code updates.
    * Preserve default Roo-Code mode functionality without regression.

**1.3. Non-Goals**
* Replacing or fundamentally altering the default "Roo-Code" agent logic.
* Achieving 100% feature parity between modes if CodeWeaver's efficiency goals conflict.
* Supporting IDEs other than VS Code in this iteration.
* Implementing advanced, experimental features (e.g., complex agent reflection loops, dynamic LLM fine-tuning) beyond the core design in the initial rollout.

**1.4. Target Audience**
* Developers currently using the Roo-Code extension.
* Developers and teams highly sensitive to LLM API costs.
* Users interested in leveraging local code intelligence for more context-aware AI assistance.
* Users comfortable with potentially higher local resource consumption (CPU, Memory, Disk) in exchange for CodeWeaver's benefits.

**1.5. Definitions**
* **Roo-Code Mode:** The original, default agent logic.
* **CodeWeaver Mode:** The new, optional agent logic detailed in this document.
* **Local Code Intelligence Engine (LCIE):** CodeWeaver component for local code parsing, storage (SQLite, Vector Index), indexing, and real-time synchronization.
* **Relevancy Engine:** CodeWeaver component using hybrid methods (graph, vector, lexical) to find relevant code snippets locally.
* **Multi-Model Orchestrator (MMO):** CodeWeaver component routing LLM requests to different tiers (Local Tier 0, API Tier 1).
* **Agentic Execution Engine (AEE):** The core logic loop for CodeWeaver mode (reactive, tool-using).
* **Token Efficiency:** Minimizing LLM API token usage.
* **Minimal Modification:** Strategy of using abstractions and dispatch points to avoid changing original Roo-Code files unnecessarily.
* **AST:** Abstract Syntax Tree.
* **FTS:** Full-Text Search (specifically SQLite FTS5).
* **ONNX:** Open Neural Network Exchange format for ML models.
* **ORT:** ONNX Runtime execution engine.
* **WASM:** WebAssembly.

**2. Architecture & Integration Strategy**

**2.1. High-Level Overview**
The extension will operate modally ("roo-code" or "codeweaver"), selected via configuration. A dispatch mechanism at key integration points will route control flow to either the original Roo-Code subsystems or the new, largely independent CodeWeaver subsystems. CodeWeaver components reside in a dedicated `src/codeweaver/` directory.

```mermaid
graph TD
    subgraph VSCode Extension Process
        UI[VSCode UI / Commands] --> Activation[extension.ts activate];
        Activation --> ConfigRead{Read agentMode};
        ConfigRead -- "codeweaver" --> InitCW[Initialize CodeWeaver Services];
        ConfigRead -- "roo-code" --> InitRC[Use Roo-Code Services];

        InitCW --> CW_Provider(ClineProvider - CW Mode);
        InitRC --> RC_Provider(ClineProvider - RC Mode);

        subgraph Task Execution
            UserTask --> Dispatcher{Task Dispatcher (in ClineProvider)};
            Dispatcher -- "codeweaver" --> CW_Agent[CodeWeaver Agent (IAgent)];
            Dispatcher -- "roo-code" --> RC_Agent[Roo-Code Agent (Cline)];

            CW_Agent -- Uses --> CW_Deps[CodeWeaver Dependencies (IContextRetriever, ILLMOrchestrator)];
            RC_Agent -- Uses --> RC_Deps[Roo-Code Dependencies (Wrappers / Original)];

            CW_Deps --> CW_Services[CodeWeaver Services (LCIE, Relevancy, MMO)];
            RC_Deps --> Orig_Services[Original Roo-Code Services];

            CW_Services --> Files[(Workspace Files)];
            Orig_Services --> Files;
            CW_Services --> LocalDB[(Local DB / Index)];
            CW_Services --> LocalLLM[Local Tier 0 LLM];
            CW_Services --> API_LLM[API Tier 1 LLM];
            Orig_Services --> API_LLM;
        end
    end

    style LocalDB fill:#lightgrey,stroke:#333,stroke-width:2px
    style LocalLLM fill:#lightgrey,stroke:#333,stroke-width:2px
    style CW_Services fill:#lightblue,stroke:#333,stroke-width:2px
    style CW_Agent fill:#lightblue,stroke:#333,stroke-width:2px
```

**2.2. Mode Selection Mechanism**
* **Setting:** `roo-code.agentMode` defined in `package.json` (`contributes.configuration`) and schema files (`src/schemas/index.ts` or equivalent). Type: `string`, Enum: `["roo-code", "codeweaver"]`, Default: `"roo-code"`, Scope: `window`.
* **Access:** A shared utility function `getAgentMode()` in `src/codeweaver/config/settings.ts` reads this setting using `vscode.workspace.getConfiguration('roo-code').get('agentMode', 'roo-code')`. This function should be used consistently where mode detection is needed.

**2.3. Integration Points & Abstraction (Minimal Core Edits)**
* **Target Files:** Anticipated minimal edits primarily in:
    * `extension.ts`: For conditional initialization of CodeWeaver's LCIE and ToolRegistry based on `agentMode`.
    * `src/providers/cline-provider/ClineProvider.ts` (or equivalent): To implement the dependency factory (`_createAgentDependencies`) and task dispatch logic (`_dispatchAgentTask`).
* **Minimal Change Strategy:** Avoid altering method signatures or core logic flow within `Cline.ts` (the original agent). Use wrapper classes and dependency injection via `ClineProvider`.
* **Core Interfaces (`src/codeweaver/interfaces/index.ts`):**
    * `IAgent`: Defines `runTask`. Implemented by `CodeWeaverAgent` and conceptually by `Cline` (or a thin wrapper if needed).
    * `IContextRetriever`: Defines `getContext`. Implemented by `CodeWeaverContextRetriever` and `RooCodeContextRetriever`.
    * `ILLMOrchestrator`: Defines `makeApiRequest`. Implemented by `CodeWeaverLLMOrchestrator` and `RooCodeLLMOrchestrator`.
* **Dependency Factory (`ClineProvider._createAgentDependencies`):**
    * Takes `mode: AgentMode` as input.
    * If `mode === 'codeweaver'`, instantiates and returns `CodeWeaverContextRetriever` and `CodeWeaverLLMOrchestrator` (requires access to initialized CodeWeaver services).
    * If `mode === 'roo-code'`, instantiates and returns *real* `RooCodeContextRetriever` and `RooCodeLLMOrchestrator` wrappers (passing original Roo-Code services needed for delegation).
    * Returns common dependencies like the shared `logger`.
* **Task Dispatch (`ClineProvider._dispatchAgentTask` or equivalent):**
    * Reads `agentMode`.
    * Calls `_createAgentDependencies(mode)`.
    * Instantiates `CodeWeaverAgent` (passing deps) or `Cline` (passing original required services) based on `mode`.
    * Calls `agentHandler.runTask(...)`.

**2.4. New CodeWeaver Directory Structure (`src/codeweaver/`)**
All new code resides here, organized by component: `agent`, `config`, `context`, `intelligence` (with subdirs), `interfaces`, `orchestration`, `relevancy` (with subdirs), `tools`, `utils`, `log`, `tests` (with subdirs).

**2.5. Conditional Activation/Resource Management**
* In `extension.ts` `activate()`:
    * Read `agentMode`.
    * If `"codeweaver"`:
        * Instantiate `LocalCodeIntelligenceEngine`.
        * Call `await intelligenceEngine.initialize()`. If successful:
            * Add `intelligenceEngine` disposable to `context.subscriptions`.
            * Instantiate `ToolRegistry` (passing `intelligenceEngine`). Add disposable to `context.subscriptions`.
            * Instantiate `LocalModelService`. Call `initialize()` async (don't block activation). Add disposable.
    * Instantiate `ClineProvider`, passing necessary dependencies (including conditionally initialized CodeWeaver services or accessors).
* Ensure `deactivate()` function properly calls `dispose()` on all CodeWeaver services added to `context.subscriptions`.

**2.6. Settings UI Integration (`webview-ui/.../SettingsView.tsx`)**
* Implement the `agentMode` radio group/dropdown control.
* Implement state management and message passing (`postMessage`) to save the selected mode to VS Code configuration.
* Use conditional rendering (`{agentMode === 'codeweaver' && ...}`) to display the dedicated CodeWeaver settings section (populated in Story 24).

**3. CodeWeaver Mode: Detailed Component Design**

**3.1. Local Code Intelligence Engine (LCIE) (`src/codeweaver/intelligence/`)**
* **Orchestrator:** `IntelligenceEngine` class facade. Manages lifecycle and coordination of sub-components. Provides public query API. Handles initialization and disposal.
* **Parser (`parser/`):**
    * Service: `TreeSitterParser`.
    * Library: `web-tree-sitter`.
    * Runtime: WASM.
    * Grammars: Load required language `.wasm` files (Python, TS, JS, Java initially) from `assets/grammars/` relative to `extensionUri`. Use configurable mapping from `languageId` to filename.
    * Execution: Run parsing within `worker_threads` managed by the `IntelligenceEngine` or `SyncService`.
    * Features: Incremental parsing capability (implement later for optimization), error tolerance.
* **Data Store (`storage/`):**
    * Service: `SqliteDB`.
    * Library: `better-sqlite3`.
    * Features: Manages connection (`codeweaver_index.db` in `context.storageUri`), applies schema (`schema.sql`), provides transactional query/execution helpers, enables WAL mode, enforces FKs. Caches prepared statements.
    * Schema (`schema.sql`): Tables `files`, `code_elements` (with hierarchy, hashes), `embeddings_meta` (maps `element_id` to `storage_ref`, includes `vector_hash`), `graph_edges` (source/target IDs/names, type). `code_elements_fts` virtual table + triggers.
* **Vector Index (`storage/`):**
    * Service: `VectorIndexService`. Facade over chosen implementation.
    * Interface: `IVectorIndex` (`buildIndex`, `search`, `saveIndex`, `loadIndex`, `clearIndex`, `getSize`, `isReady`).
    * Implementation: `FaissVectorIndex` (using `node-faiss`, preferred for performance if stable) OR `VoyVectorIndex` (using `voy-search`, simpler integration). Choice depends on implementation phase benchmarks/stability. Stores index file alongside SQLite DB. Implements `buildIndex` using a **full rebuild strategy initially** for simplicity and consistency (clear + add all current vectors from DB). Note need for future incremental strategy.
* **Embedding Generator (`embedding/`):**
    * Service: `OnnxEmbeddingGenerator`.
    * Library: `onnxruntime-node`, `@xenova/transformers` (or compatible tokenizer).
    * Model: Load quantized code embedding model (e.g., ONNX export of MiniLM code variant, Jina code embeddings) specified in config (`localEmbeddingModelFilename`) from `assets/models/`.
    * Features: Initializes ORT session (CPU recommended) & Tokenizer. `generateEmbeddings` method handles tokenization, tensor creation, inference (`session.run`), mean pooling w/ attention mask, L2 normalization. Handles errors. Provides embedding dimension.
* **Synchronization (`sync/`):**
    * Service: `FileWatcherService`, `SyncQueue`.
    * Watcher: Uses `vscode.workspace.createFileSystemWatcher` with basic configurable ignores. Pushes events (`create`, `change`, `delete`) with `uri` to queue.
    * Queue: Uses `async-queue`. Processes tasks sequentially (configurable concurrency `syncConcurrency`). Wraps processor (`IntelligenceEngine.processSyncTask`) with error handling. Logs queue length periodically (basic resource monitoring).
    * Processor (`IntelligenceEngine.processSyncTask`): Core logic. **Runs all DB operations within a single transaction per file.** Handles delete (remove from DB, queue vector cleanup later), create/change (read, hash check, parse, extract elements/relationships, diff elements vs DB, delete old/insert new elements, update graph edges, generate/cache embeddings for changed, update `embeddings_meta`). Triggers asynchronous vector index rebuild *after* successful transaction commit. Logs detailed steps and errors.

**3.2. Relevancy & Context Retrieval Engine (`src/codeweaver/relevancy/`, `src/codeweaver/context/`)**
* **Orchestrator:** `RelevancyEngine` class. Manages retrievers, runs them in parallel, ranks results.
* **Retrievers (`retrievers/`):** Implement `IRetriever` interface.
    * `VectorRetriever`: Takes `RetrievalInput`, generates query embedding (`OnnxEmbeddingGenerator`), searches `VectorIndexService`, maps results (`storage_ref` -> `element_id` via `SqliteDB`), calculates similarity score, returns `RetrieverResult[]`.
    * `GraphRetriever`: Takes `RetrievalInput`, finds element(s) near cursor (`IntelligenceEngine`), traverses code graph (calls, imports, etc.) using `IntelligenceEngine` queries up to configured depth, assigns scores based on distance/type, returns `RetrieverResult[]`.
    * `LexicalRetriever`: Takes `RetrievalInput`, extracts keywords, calls `IntelligenceEngine.searchCode` (FTS query), assigns score, returns `RetrieverResult[]`.
* **Ranking (`scoring/ranker.ts`):** `rankResults` function. Takes raw `RetrieverResult[]`. Groups by `elementId`. Calculates final score using configurable weights (`relevancyWeights` config) and source boost multiplier. Sorts by final score, returns top N (`maxContextSnippets` config).
* **Context Assembler (`context/contextAssembler.ts`):** `ContextAssembler` class. Takes ranked `RetrieverResult[]`, description, history, `targetTokenLimit`. Fetches element content (`IntelligenceEngine.getElementContent`). Uses `tiktoken` utils (`utils/tokenizer.ts`) to count tokens and truncate snippets (`MAX_SNIPPET_TOKENS` cap) and history (`MAX_HISTORY_TOKENS` cap) to fit overall limit. Assembles `RetrievedContext` object.
* **Facade (`context/contextRetriever.ts`):** `CodeWeaverContextRetriever` class. Implements `IContextRetriever`. Takes `RetrievalInput`, calls `RelevancyEngine.getRelevantContext`, then `ContextAssembler.assembleContext`. Returns `RetrievedContext`.

**3.3. Multi-Model Orchestrator (MMO) (`src/codeweaver/orchestration/`)**
* **Orchestrator:** `CodeWeaverLLMOrchestrator` class. Implements `ILLMOrchestrator`.
* **Tier 0 (`localModelService.ts`):** `LocalModelService` class. Manages local ONNX LLM (e.g., Phi-3 from config `localLLMFilename`). Initializes ORT session (CPU) & Tokenizer. `runInference` method **is complex and initially returns a stub response**, requires full generation loop implementation later. Provides `isReady()`.
* **Tier 1 (API):** Uses `vscode.lm.sendChatRequest`.
* **Routing Logic (`makeApiRequest`):** Takes `prompt`, `options`. Checks `options.taskTypeHint`. If hint matches internal types (`ROUTE`, `SUMMARIZE_CHUNK`, `CLASSIFY`) AND `LocalModelService.isReady()`, call Tier 0 `runInference` (stub). Otherwise (or if local fails/disabled), call Tier 1 `callTier1Api` helper (uses `vscode.lm.sendChatRequest`, handles streaming response via async generator). Logs routing decisions.
* **API Management:** Tier 1 keys managed by VS Code / Copilot subscription. `SecretStorage` needed only if accessing other non-`vscode.lm` APIs.

**3.4. Agentic Execution Engine (AEE) (`src/codeweaver/agent.ts`)**
* **Agent:** `CodeWeaverAgent` class. Implements `IAgent`.
* **Loop Type:** **Reactive Loop** based on LLM responses (text and `tool_calls`).
* **State:** Manages `currentHistory: LanguageModelChatMessage[]`.
* **`runTask(initialPrompt, config)`:**
    1.  Initialize history with user prompt. Set turn limit.
    2.  Loop:
        * Derive current goal (e.g., from last user message or summary).
        * Get context: `contextRetriever.getContext(...)`.
        * Build prompt: `buildPromptMessages(context.snippets, currentHistory)` (includes system instructions, tool definitions).
        * Call LLM: `llmOrchestrator.makeApiRequest(...)`.
        * Process response: Use helper `processLLMResponseAndExtractTools` to get text and `tool_calls`.
        * Append assistant text response to history, post chunked updates to UI.
        * If `toolCalls`: Append `tool_calls` message to history. Iterate through calls. Assume `vscode.lm` framework invokes the corresponding registered tool (via `ToolRegistry`). Log initiation. Append placeholder `tool_results` messages to history (or actual results if framework provides them). Continue loop.
        * If no `toolCalls`: Assume final response, post to UI, return `TaskResult`.
    3.  Handle max turns / errors.
* **Helpers:** `deriveCurrentGoal`, `buildPromptMessages`, `processLLMResponseAndExtractTools`, `postMessageToUI` (stub).

**3.5. Tooling (`src/codeweaver/tools/`)**
* **Registry:** `ToolRegistry` class. Instantiated once during activation if CodeWeaver enabled.
* **Tool Definition:** Define tools (`readFile`, `applyFileSystemEdit`, `runTerminalCommand`, potentially `searchCode`, `getDiagnostics`) with name, description.
* **Registration:** `registerTools` method calls `vscode.lm.registerTool` for each tool.
* **`invoke` Function:** Implement for each tool within `registerTool`. Parse arguments robustly. **Implement mandatory `vscode.window.showWarningMessage` confirmation for `applyFileSystemEdit` and `runTerminalCommand` before executing action.** Use underlying VS Code APIs. Return structured result/error.
* **Disposal:** `dispose` method unregisters tools.

**4. Data Models & Schemas (Conceptual)**

* **SQLite (`schema.sql`):** Tables `files`, `code_elements`, `embeddings_meta`, `graph_edges`, `code_elements_fts` with appropriate columns, types, indices, FKs (`ON DELETE CASCADE`).
* **Vector Index:** Stores `(storage_ref: string, vector: number[])`. `storage_ref` links to `embeddings_meta`.
* **Configuration (`package.json`/`settings.json`):** `roo-code.agentMode`, `roo-code.codeweaver.*` (nested object for specific settings like filenames, limits, weights, concurrency).
* **Agent Plan (If explicit planning added later):** JSON array of `PlanStep` objects (action, goal, toolName, args, prompt).

**5. Performance & Resource Management Strategy**

* **KPIs:** Indexing Time (Initial Full Scan, Incremental Update p90), Relevancy Query Latency (p90), Context Assembly Time, LLM Call Latency (Tier 0 stub, Tier 1 E2E), Token Counts (Tier 0 vs Tier 1 per task), CPU Usage (Extension Host, Workers - Peak/Avg), Memory Usage (Peak/Avg), Disk Usage (DB + Index Size).
* **Optimization Techniques:**
    * **Backgrounding:** `worker_threads` for ALL heavy CPU tasks (parsing, embedding, indexing, local LLM inference).
    * **Incremental Processing:** Tree-sitter parsing, Sync queue handling changes, *Future: Incremental Vector Index updates*.
    * **Efficient Libraries:** `better-sqlite3` (WAL mode), `web-tree-sitter` (WASM), `onnxruntime-node` (native bindings), Faiss (native bindings preferred).
    * **Database Tuning:** Proper SQLite indexing, query optimization, prepared statement caching, WAL mode.
    * **Concurrency Control:** Configurable `syncConcurrency` for `SyncQueue`.
    * **Model Quantization:** Use INT4/INT8 for local embedding and Tier 0 models.
    * **Caching:** In-memory caching for frequently accessed ASTs, embeddings, query results (use LRU cache with size limits).
    * **Throttling/Debouncing:** For file system events, potentially for background task execution based on system load (advanced).
* **Monitoring:** Integrate `PerfTimer`. Log KPIs. Provide UI status (indexing progress, queue length). Consider Node.js `perf_hooks` or `process.memoryUsage()` for deeper inspection (use carefully).

**6. Security Considerations**

* **Threat Model:** Prompt Injection (via code/docs), Tool Abuse (FS write, terminal exec), Data Privacy (Local DB/Index access, API data transmission), Dependency Vulnerabilities (npm, WASM, ONNX), Local Model Execution Risks.
* **Mitigation:**
    * **Input Sanitization:** Validate/sanitize context snippets before inclusion in prompts (e.g., limit length, escape sequences - complex).
    * **Tool Confirmation:** Mandatory modal `vscode.window.showWarningMessage` confirmation within `vscode.lm.registerTool`'s `invoke` for sensitive tools (`applyFileSystemEdit`, `runTerminalCommand`).
    * **API Key Security:** Rely on VS Code/Copilot auth for `vscode.lm`. Use `vscode.SecretStorage` for any other external API keys.
    * **Local Storage:** Use `context.storageUri` (workspace) or `context.globalStorageUri` (global but extension-specific) for DB/Index files to leverage VS Code's permission model. Avoid world-writable locations.
    * **Data Transmission:** Be transparent about what data is sent to Tier 1 APIs.
    * **Dependencies:** Use `npm audit` regularly. Vet external libraries.
    * **Local Models:** Source ONNX models from trusted repositories (e.g., HuggingFace official). Log model paths clearly. Sandboxing ORT is likely infeasible in standard extension host.

**7. Testing Strategy**

* **Framework:** Jest.
* **Location:** All new tests in `src/codeweaver/tests/`. **Do not modify existing Roo-Code tests.**
* **Unit Tests:** High coverage (>85%) for all new modules/classes/utils. Mock dependencies heavily. Test algorithms, logic, edge cases, error handling.
* **Integration Tests:** Test interactions between CodeWeaver components (e.g., `SyncService` -> `Parser` -> `Storage`). Test the mode dispatch logic in minimally modified Roo-Code files using mocked interfaces.
* **E2E Tests (`vscode-test`):** Define core CodeWeaver user scenarios (enable mode, index project, ask RAG question, perform tool-based refactor). Mock external LLM APIs. Verify UI interactions and file system changes. Run full Roo-Code E2E suite to check for regressions.
* **Optional E2E-LLM Tests:** Separate suite (`e2e-llm/`) gated by ENV vars. Make limited calls to real (cheap/local) LLMs to validate prompt effectiveness, plan parsing (if used), and basic function calling integration.

**8. Metrics & Monitoring**

* Implement an opt-in, privacy-conscious telemetry system.
* Track anonymized KPIs: `agentMode` usage, CodeWeaver feature usage, task types, success/error rates, P50/P90 latencies, token counts by tier.
* Use metrics dashboards (if infrastructure allows) or log analysis to guide optimization and identify issues.

**9. Phased Rollout Plan (CodeWeaver Mode)**

1.  **Phase 0 (Stories 1-4): Foundation & Integration Plumbing.** Setup structure, config, interfaces, stubs, dispatch logic, UI toggle. *Goal: Basic mode switching works.*
2.  **Phase 1 (Stories 5-14): Local Intelligence Engine.** Implement SQLite, Parser, Watcher/Queue, Vector Index (rebuild), Embedder (ONNX), Engine Facade, Sync DB logic, Query API. *Goal: Local DB populates/syncs, queryable.*
3.  **Phase 2 (Stories 15-18): RAG Pipeline.** Implement Retrievers (Vector, Graph, Lexical), Ranking, Context Assembler (with Tiktoken). *Goal: Relevant context can be retrieved and assembled.*
4.  **Phase 3 (Stories 19-21): Basic Agent Wiring.** Implement Tier 1 Orchestrator pass-through, Basic Agent structure, Roo-Code Wrappers. *Goal: Agent can perform basic RAG Q&A using Tier 1.*
5.  **Phase 4 (Stories 22-24): Multi-Model Efficiency.** Implement Tier 0 Local LLM Service (stubbed generation), Orchestrator Routing, Settings UI/Config for local models/tuning. *Goal: Routing works, settings available.*
6.  **Phase 5 (Stories 26-29): Full Agentic Flow & Tools.** Implement Tool Registry/Registration (with confirmation), Reactive Agent Loop (handling tool calls), Graph Edge Sync logic. *Goal: Agent performs multi-step tasks using tools.*
7.  **Phase 6 (Story 30+): Benchmarking, Optimization, Beta.** Implement performance timers, document strategy, gather baseline metrics. Optimize based on data (vector index strategy, query tuning, generation loop implementation). Prepare for beta testing.

**10. Future Considerations**

* Implement incremental vector index updates.
* Implement full local LLM generation loop in `LocalModelService`.
* More sophisticated agent planning/reflection capabilities.
* Advanced context handling (summarization, virtual context).
* Caching strategies for queries and embeddings.
* Resource limiting/throttling based on system load.
* Support for user-provided local models.
* Integration with build/test/debug workflows.

**11. Open Questions & Flexibility Points**

* Optimal vector index library choice (Faiss vs. Voy vs. others) based on performance and cross-platform stability.
* Specific code embedding and Tier 0 LLM models to use (requires benchmarking/evaluation).
* Best strategy for efficient `getElementContent` retrieval.
* Scalability limits of SQLite/Vector Index/Sync process on extremely large monorepos.
* Robustness of LLM response parsing for tool calls across different Tier 1 models.
* Feasibility of sandboxing ONNX Runtime.

---
