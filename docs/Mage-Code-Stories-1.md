---

**Preamble: Testing Strategy & Notes**

* **Framework:** All new tests will use **Jest**, aligning with the existing Roo-Code project setup (`jest.config.js`).
* **Location:** All new test files **MUST** be placed within the `src/codeweaver/tests/` directory structure (e.g., `src/codeweaver/tests/unit/intelligence/storage/sqliteDb.test.ts`). Create subdirectories (`unit`, `integration`, `e2e`) as needed.
* **Minimal Modification Constraint:** Existing Roo-Code tests (`src/**/__tests__/*.test.ts`, `evals/**/test/*.test.ts`, etc.) **MUST NOT** be modified unless an unavoidable change to a core Roo-Code file (which this plan actively minimizes) necessitates it. After any minimal core change, run the *entire* Roo-Code test suite to ensure no regressions were introduced.
* **Mocking:** Employ extensive mocking (`jest.fn`, `jest.spyOn`, `jest.mock`) for VS Code APIs (`vscode.*`), Node.js built-ins (`fs`, `path`, `crypto`), external libraries (`better-sqlite3`, `web-tree-sitter`, `onnxruntime-node`, `@xenova/transformers`, `tiktoken`, `async-queue`, vector library), dependent CodeWeaver services, and original Roo-Code services/functions where necessary for isolation in unit and integration tests.
* **Test Types:**
    * **Unit Tests:** Focus on individual functions, classes, and algorithms within a single module. Verify logic, edge cases, and error handling. Aim for high code coverage (>85%) for new CodeWeaver modules.
    * **Integration Tests:** Verify interactions *between* CodeWeaver components (e.g., `IntelligenceEngine` -> `RelevancyEngine`) or between minimally modified Roo-Code files and the new CodeWeaver interfaces/stubs (e.g., `ClineProvider` dispatch logic). Mock external boundaries.
    * **End-to-End (E2E) Tests:** Utilize the `vscode-test` framework (or Roo-Code's existing E2E setup). Define key user scenarios specifically for CodeWeaver mode (e.g., enable mode, open project, wait for index, ask question requiring local context, request refactor using tools). These tests validate the complete flow, including VS Code API interactions. Mock external LLM APIs to control cost and flakiness during automated runs.
    * **Optional E2E-LLM Tests:** Maintain a separate, conditionally run E2E test suite (`e2e-llm/`) gated by environment variables (`RUN_LLM_TESTS=true`, API keys). This suite makes limited calls to actual (inexpensive or local) LLMs to validate prompt formatting, plan parsing (if used), and basic function calling beyond mocks. Mark these tests clearly.
* **Logging:** Implement comprehensive logging throughout all CodeWeaver modules using a shared logger instance (to be created or injected, potentially wrapping Roo-Code's existing logger). Use distinct levels (`info`, `warn`, `error`, `debug`) and structured logging where feasible.

---

please review the plan and fill in any gaps you may find, and make sure you understand the full purpose, you can refer to the file docs/Mage-Code-DesDoc-1.md if needed

---

**Phase 0: Foundation & Integration Plumbing**

---

**Story 1: Setup CodeWeaver Directory Structure & Basic Configuration**

- **Goal:** Create the CodeWeaver module's file structure and add the `agentMode` configuration setting to Roo-Code's configuration schema and defaults.
- **Files to Create:**
    - `src/codeweaver/` (root directory)
    - `src/codeweaver/agent/`
    - `src/codeweaver/config/`
    - `src/codeweaver/context/`
    - `src/codeweaver/intelligence/` (and subdirs: `embedding`, `parser`, `storage`, `sync`)
    - `src/codeweaver/interfaces/`
    - `src/codeweaver/orchestration/`
    - `src/codeweaver/relevancy/` (and subdirs: `retrievers`, `scoring`)
    - `src/codeweaver/tools/`
    - `src/codeweaver/utils/`
    - `src/codeweaver/log/` (Optional: for shared logger if needed)
    - `src/codeweaver/tests/` (and subdirs: `unit`, `integration`, `e2e`, `e2e-llm` [optional])
    - `src/codeweaver/interfaces/index.ts` (Empty file initially)
    - `src/codeweaver/config/settings.ts`
- **Files to Modify (Minimal):**
    - `src/schemas/index.ts` (or equivalent Roo-Code settings definition file, e.g., `roo-config.ts`) - **Minimal Change**
    - `evals/packages/types/src/roo-code-defaults.ts` (or equivalent defaults file) - **Minimal Change**
- **Implementation Steps:**

    1.  **Create Directories:** Execute file system commands (`mkdir -p ...`) to create the complete directory structure listed above, including nested test directories.
    2.  **Define Setting:** Locate the primary configuration object definition in `src/schemas/index.ts` (or identified equivalent). Within the `properties` of the main configuration object (likely under `roo-code`), add the `agentMode` property:
        ```typescript
        // Example within src/schemas/index.ts properties for 'roo-code' configuration section
        agentMode: {
          type: "string",
          enum: ["roo-code", "codeweaver"],
          default: "roo-code",
          description: "Selects the agent logic mode. 'roo-code' uses the original logic. 'codeweaver' uses the new high-efficiency, local-intelligence mode.",
          scope: "window", // Or "machine" if preferred persistence
          order: 1 // Place it prominently in settings UI
        },
        ```
    3.  **Set Default:** Locate the default settings object in `evals/packages/types/src/roo-code-defaults.ts` (or equivalent). Add the property `agentMode: "roo-code"` to this object.
    4.  **Create Initial Files:** Create the empty `src/codeweaver/interfaces/index.ts`. Create `src/codeweaver/config/settings.ts` with initial types and functions:

        ```typescript
        // src/codeweaver/config/settings.ts
        import * as vscode from "vscode"
        // Assuming a logger instance can be obtained or imported
        import { logger } from "../log/logger" // Placeholder path

        export type AgentMode = "roo-code" | "codeweaver"

        // Get the effective configuration, preferring Roo-Code's service if available
        function getConfiguration(configService?: any): vscode.WorkspaceConfiguration {
        	// TODO: Integrate with Roo-Code's config service if passed and has appropriate methods
        	// if (configService && ...) { return configService.getConfiguration(); }
        	return vscode.workspace.getConfiguration("roo-code") // Fallback
        }

        export function getAgentMode(configService?: any): AgentMode {
        	const config = getConfiguration(configService)
        	try {
        		return config.get<AgentMode>("agentMode", "roo-code")
        	} catch (error) {
        		logger.error("Failed to read agentMode setting, defaulting to 'roo-code'.", error)
        		return "roo-code"
        	}
        }

        // Define interfaces for structured settings (details in Story 24)
        export interface RelevancyWeights {
        	graph: number
        	vector: number
        	lexical: number
        	sourceBoost: number
        }
        export interface CodeWeaverSpecificSettings {
        	localEmbeddingModelFilename: string | null
        	localLLMFilename: string | null
        	maxContextSnippets: number
        	relevancyWeights: RelevancyWeights
        	syncConcurrency: number
        	// Add other settings later
        }
        export interface CodeWeaverSettings extends CodeWeaverSpecificSettings {
        	enabled: boolean
        }

        // Function to get detailed CodeWeaver settings (implemented fully in Story 24)
        export function getCodeWeaverSettings(configService?: any): CodeWeaverSettings {
        	const config = getConfiguration(configService)
        	const codeWeaverSubConfig = config.get<object>("codeweaver") ?? {}
        	const mode = getAgentMode(config)

        	const getSetting = <T>(key: keyof CodeWeaverSpecificSettings, defaultValue: T): T => {
        		return (codeWeaverSubConfig as any)[key] ?? defaultValue
        	}

        	// Use defaults defined here initially, will be read properly in Story 24
        	const defaultWeights: RelevancyWeights = { graph: 1.0, vector: 0.6, lexical: 0.3, sourceBoost: 1.5 }

        	return {
        		enabled: mode === "codeweaver",
        		localEmbeddingModelFilename: getSetting("localEmbeddingModelFilename", "embedding_model.onnx"),
        		localLLMFilename: getSetting("localLLMFilename", "tier0_llm.onnx"),
        		maxContextSnippets: getSetting("maxContextSnippets", 15),
        		relevancyWeights: getSetting("relevancyWeights", defaultWeights),
        		syncConcurrency: getSetting("syncConcurrency", 1),
        	}
        }
        ```

- **Testing Instructions:**
    1.  **Test File:** Create `src/codeweaver/tests/unit/config/settings.test.ts`.
    2.  **Unit Tests (Jest):**
        - Mock `vscode.workspace.getConfiguration` and its `get` method thoroughly. Mock the logger.
        - Test `getAgentMode`: Verify correct returns for `"codeweaver"`, `"roo-code"`, undefined (defaulting to `"roo-code"`). Test error handling during `get`.
        - Test `getCodeWeaverSettings`: Verify `enabled` reflects the mocked `agentMode`. Verify default values are returned correctly when the nested `codeweaver` config object is missing or specific properties are missing. Ensure nested `relevancyWeights` defaults work.
    3.  **Run Tests:** `npm test -- src/codeweaver/tests/unit/config/settings.test.ts`.
    4.  **Expected Outcome:** All tests pass. Configuration structure is added.

---

**Story 2: Define Core CodeWeaver Interfaces**

- **Goal:** Define the essential TypeScript interfaces (`IAgent`, `IContextRetriever`, `ILLMOrchestrator`, supporting types) to establish contracts between CodeWeaver components and the integration points.
- **Files to Modify/Create:**
    - `src/codeweaver/interfaces/index.ts`
- **Implementation Steps:**
    1.  **Populate `index.ts`:** Add the full, detailed interface definitions as specified previously (incorporating Story 2 refinements):
        - `IAgent`: `runTask(initialPrompt, taskConfig)` returning `Promise<TaskResult | void>`.
        - `IContextRetriever`: `getContext(taskDescription, editorState, history, tokenLimit?)` returning `Promise<RetrievedContext>`.
        - `ILLMOrchestrator`: `makeApiRequest(prompt, options, cancellationToken?)` returning `Promise<LLMResponse | AsyncIterable<LLMResponseStream>>`.
        - Supporting Types: `TaskConfig`, `TaskResult`, `AgentDependencies` (including `logger`, `contextRetriever`, `llmOrchestrator`), `EditorState` (with optional `filePath`, `cursorPosition`, `selection`, `visibleRanges`), `RetrievedContext` (with `snippets`, optional `history`), `CodeSnippet` (with `filePath`, `content`, lines, optional score), `LanguageModelChatMessage` (aliased to `vscode.LanguageModelChatMessage`), `LLMRequestOptions` (with `taskTypeHint`, optional params, `modelPreference`), `LLMResponse` (aliased to `vscode.LanguageModelChatResponse`), `LLMResponseStream` (`{ chunk?: string; error?: Error; done?: boolean }`), `RetrievalInput`, `RetrieverResult` (with `elementId`, `score`, `source`), `IRetriever`, `ToolCallRequest` (example structure), `ToolResultMessage` (example structure).
        - Use `vscode` types where suitable (`Position`, `Selection`, `Range`, `Uri`, `CancellationToken`, etc.).
        - Add clear TSDoc comments explaining each interface, type, and method.
- **Testing Instructions:**
    1.  **Test File:** None (static types only).
    2.  **Verification:** Run `npx tsc --noEmit` on the project to ensure `src/codeweaver/interfaces/index.ts` compiles without errors and resolves imported `vscode` types correctly.
    3.  **Expected Outcome:** TypeScript compilation success. Core abstractions and data contracts are clearly defined.

---

**Story 3: Implement Basic Mode Dispatch Logic**

- **Goal:** Minimally modify Roo-Code's task initiation logic to read `agentMode` and instantiate the correct `IAgent` implementation (`Cline` or `CodeWeaverAgentStub`), injecting appropriate (stubbed) dependencies (`IContextRetriever`, `ILLMOrchestrator`).
- **Files to Modify (Minimal):**
    - `src/providers/cline-provider/ClineProvider.ts` (or identified equivalent task initiator class) - **Minimal Change**
- **Files to Create:**
    - `src/codeweaver/agentStub.ts`
    - `src/interfaces/rooCodeContextRetriever.ts` (Stub)
    - `src/interfaces/rooCodeLLMOrchestrator.ts` (Stub)
    - `src/codeweaver/context/contextRetriever.ts` (Stub)
    - `src/codeweaver/orchestration/orchestrator.ts` (Stub)
    - `src/providers/cline-provider/tests/integration/ClineProvider.modeDispatch.test.ts`
- **Implementation Steps:**
    1.  **Create Stubs:** Implement all five stub classes. Each should implement the corresponding interface (`IAgent`, `IContextRetriever`, `ILLMOrchestrator`). Constructors should accept `AgentDependencies` (or relevant subset) and log initialization. Methods should log invocation with key arguments and return valid default/empty values (e.g., `Promise.resolve({ snippets: [] })`, `Promise.resolve({ text: async () => "[Stub Response]" })`, `Promise.resolve({ status: 'completed' })`). Use the shared logger.
    2.  **Identify Dispatch Point:** Carefully locate the method in `ClineProvider.ts` where a new task/agent instance is created (e.g., triggered by a webview message or command). This is the _critical minimal modification point_.
    3.  **Implement Dependency Factory:** Add a private async method like `_createAgentDependencies(mode: AgentMode): Promise<AgentDependencies>`. This method will:
        - Log the mode it's creating dependencies for.
        - If `mode === 'codeweaver'`: Instantiate and return the _stub_ `CodeWeaverContextRetriever` and _stub_ `CodeWeaverLLMOrchestrator`.
        - If `mode === 'roo-code'`: Instantiate and return the _stub_ `RooCodeContextRetriever` and _stub_ `RooCodeLLMOrchestrator`. **Crucially, pass any necessary original Roo-Code services (like config manager, workspace tracker, API handlers) to these Roo-Code stub constructors** so they are available when the stubs are replaced with real implementations later.
        - Include the shared `logger` in the returned object.
    4.  **Implement Dispatch Logic:** Modify the identified dispatch point method:
        - Call `getAgentMode()`. Log the mode.
        - Call `await this._createAgentDependencies(mode)`.
        - Use `if (mode === 'codeweaver')` block:
            - Instantiate `agentHandler = new CodeWeaverAgentStub(config, dependencies)`. Log instantiation.
        - Use `else` block:
            - Instantiate `agentHandler = new Cline(/* Minimal adapted arguments */)`. **Analyze `Cline`'s constructor. Pass the required original Roo-Code services directly.** If `Cline` needs context/LLM logic passed in ways incompatible with the stubs, instantiate the _original_ Roo-Code context/LLM services here _instead_ of using the Roo-Code stubs from `_createAgentDependencies` for this `else` block. The goal is to avoid changing `Cline`'s signature. Log instantiation.
        - Store `agentHandler` (e.g., `this.activeAgents.set(taskId, agentHandler)`).
        - Call `await agentHandler.runTask(initialPrompt, config)`. Wrap in try/catch for robust error logging.
- **Testing Instructions:**
    1.  **Test File:** Create `src/providers/cline-provider/tests/integration/ClineProvider.modeDispatch.test.ts`.
    2.  **Integration Tests (Jest):**
        - Mock `getAgentMode`. Mock all stub constructors (`CodeWeaverAgentStub`, `RooCodeContextRetriever`, etc.) and the original `Cline` constructor. Mock the `runTask` method on both `Cline.prototype` and `CodeWeaverAgentStub.prototype`. Mock necessary Roo-Code services needed for dependency creation or `Cline` instantiation.
        - Test Case 1 (`"roo-code"` mode): Verify `_createAgentDependencies` is called with `"roo-code"`. Verify `Cline` constructor is called with expected arguments. Verify `CodeWeaverAgentStub` constructor is NOT called. Verify `agentHandler.runTask` (mocked on `Cline`) is called.
        - Test Case 2 (`"codeweaver"` mode): Verify `_createAgentDependencies` is called with `"codeweaver"`. Verify `CodeWeaverAgentStub` constructor is called with correct stub dependencies. Verify `Cline` constructor is NOT called. Verify `agentHandler.runTask` (mocked on `CodeWeaverAgentStub`) is called.
    3.  **Run Tests:** Execute Jest, targeting the new test file. **Run the full Roo-Code test suite** to check for regressions caused by the minimal changes in `ClineProvider.ts`.
    4.  **Expected Outcome:** All new tests pass. No existing Roo-Code tests fail. Dispatch logic correctly selects and instantiates agent stubs based on mode.

---

**Story 4: Implement Settings UI Toggle**

- **Goal:** Add UI controls (`VSCodeRadioGroup`) to the Roo-Code settings webview for `agentMode` selection and conditional rendering of settings sections.
- **Files to Modify (Minimal):**
    - `webview-ui/src/components/settings/SettingsView.tsx` (or equivalent React component).
- **Implementation Steps:**
    1.  **Locate Component & Import:** Find the settings component. Import `{ VSCodeRadioGroup, VSCodeRadio } from "@vscode/webview-ui-toolkit/react"`.
    2.  **State & Handler:** Use `useState` for `agentMode`. Use `useEffect` to request and load the initial `agentMode` value from the extension host via `postMessage`. Implement `handleModeChange` callback to update state and `postMessage({ command: 'saveSetting', key: 'agentMode', value: newMode })` to the extension host.
    3.  **Saving Logic (Extension Host):** Ensure a message handler exists in `extension.ts` or the webview controller that listens for `'saveSetting'`, receives the `key` and `value`, and uses `vscode.workspace.getConfiguration('roo-code').update(key, value, vscode.ConfigurationTarget.Global)` (or appropriate target) to save the setting.
    4.  **Render UI:** Add the `<VSCodeRadioGroup>` bound to the `agentMode` state and `handleModeChange`. Include descriptive labels/slots for "Roo-Code (Original)" and "CodeWeaver (Experimental)".
    5.  **Conditional Rendering:** Use `{agentMode === 'roo-code' && (...) }` and `{agentMode === 'codeweaver' && (...) }` to wrap the existing Roo-Code settings block and the _placeholder_ for the CodeWeaver settings block respectively. Ensure settings grouping in `package.json` (`contributes.configuration.properties`) uses `title` for organization if UI gets complex later.
- **Testing Instructions:**
    1.  **Manual Testing:** Build/run extension. Open settings. Verify UI, default, switching behavior, conditional rendering (of placeholders), persistence (close/reopen). Check `settings.json`.
    2.  **Automated UI Testing (Optional):** Add Playwright/etc. tests if available.
    3.  **Expected Outcome:** UI toggle works, selection persists, conditional rendering placeholders are ready. Saving mechanism works.

---

**Story 5: Setup SQLite Database Schema & Connection**

- **Goal:** Initialize SQLite using `better-sqlite3`, define/apply schema (`files`, `code_elements`, `embeddings_meta`, `graph_edges`, FTS table + triggers).
- **Files to Create:**
    - `src/codeweaver/intelligence/storage/sqliteDb.ts`
    - `src/codeweaver/intelligence/storage/schema.sql`
    - `src/codeweaver/tests/unit/intelligence/storage/sqliteDb.test.ts`
- **Implementation Steps:**
    1.  **Dependency:** `npm install better-sqlite3 && npm install --save-dev @types/better-sqlite3`.
    2.  **`schema.sql`:** Define `CREATE TABLE IF NOT EXISTS` statements with primary/foreign keys (`ON DELETE CASCADE`), indices, and FTS setup with triggers (use detailed schema from previous responses).
    3.  **`SqliteDB` Class (`sqliteDb.ts`):** Implement class with constructor (`storagePath` resolution using `context.storageUri`), `connect` (create DB, set WAL mode, enforce FKs, call `runMigrations`), `disconnect`, `runMigrations` (read/exec `schema.sql`), `getStatement` (cache prepared statements), `query<T>`, `queryOne<T>`, `execute` helpers (using cached statements, include logging), `getDbInstance`. Ensure robust error handling and logging.
- **Testing Instructions:**
    1.  **Test File:** Create `src/codeweaver/tests/unit/intelligence/storage/sqliteDb.test.ts`.
    2.  **Unit Tests (Jest):** Mock `fs`, `path`, `better-sqlite3`. Test constructor path logic. Test `connect` (mock DB, verify PRAGMAs, migrations call, error handling). Test `disconnect`. Test `runMigrations` (mock read/exec, error handling). Test statement caching. Test helpers (`query`, `queryOne`, `execute`) ensure correct statement execution.
    3.  **Run Tests:** Execute Jest.
    4.  **Expected Outcome:** Tests pass. DB service connects, initializes schema, provides query helpers.

---

**Story 6: Setup Tree-sitter Parser Service**

- **Goal:** Implement `TreeSitterParser` to load Tree-sitter WASM grammars and parse code.
- **Files to Create:**
    - `src/codeweaver/intelligence/parser/treeSitterParser.ts`
    - `src/codeweaver/intelligence/parser/wasmLoader.ts`
    - `src/codeweaver/tests/unit/intelligence/parser/treeSitterParser.test.ts`
    - `assets/grammars/` directory (ensure build copies to `out/`)
- **Files to Copy:**
    - `tree-sitter.wasm` library into `assets/grammars/`.
    - Pre-compiled `.wasm` grammar files (e.g., Python, TS, Java) into `assets/grammars/`.
- **Implementation Steps:**
    1.  **Dependency:** `npm install web-tree-sitter`.
    2.  **`wasmLoader.ts`:** Implement `initializeTreeSitter` (calls `Parser.init` with `locateFile` resolving `tree-sitter.wasm` relative to `extensionUri`) and `loadLanguage` (calls `Parser.Language.load` for language WASM relative to `extensionUri`). Implement language caching (`Map`). Add logging.
    3.  **`TreeSitterParser` Class:** Implement class. Constructor takes `context`. `initialize` calls `initializeTreeSitter`. `getLanguage(id)` maps ID to WASM file, calls `loadLanguage`, caches. `parse(content, id)` gets language, sets parser language, calls `parser.parse`. Return `Tree | null`. Handle errors/unsupported languages. Log extensively.
- **Testing Instructions:**
    1.  **Test File:** Create `src/codeweaver/tests/unit/intelligence/parser/treeSitterParser.test.ts`.
    2.  **Unit Tests (Jest):** Mock `web-tree-sitter`, `wasmLoader.ts`, `vscode.ExtensionContext`. Test `initialize`. Test `getLanguage` (loading, caching, unknown ID). Test `parse` (language loading, `parser.parse` call, return value, error handling).
    3.  **Run Tests:** Execute Jest.
    4.  **Expected Outcome:** Tests pass. Parser service structure is functional.

---

**Story 7: Basic File Watcher & Sync Queue**

- **Goal:** Set up `FileSystemWatcher`, `SyncQueue` (`async-queue`) with basic filtering, configurable concurrency, and basic queue monitoring notes.
- **Files to Create:**
    - `src/codeweaver/intelligence/sync/fileWatcherService.ts`
    - `src/codeweaver/intelligence/sync/syncQueue.ts`
    - `src/codeweaver/tests/unit/intelligence/sync/fileWatcherService.test.ts`
    - `src/codeweaver/tests/unit/intelligence/sync/syncQueue.test.ts`
- **Implementation Steps:**
    1.  **Dependency:** `npm install async-queue`.
    2.  **`SyncQueue` Class:** Implement as detailed previously (Story 7). Constructor takes `processor`, `concurrency` (read from config, default 1). `add` pushes task. `handleTask` wraps processor with try/catch logging. Add `getQueueLength()`. Add logging.
    3.  **`FileWatcherService` Class:** Implement as detailed previously (Story 7). Constructor takes `SyncQueue`. `startWatching` creates `vscode.workspace.createFileSystemWatcher` (use configurable include/exclude patterns later, start simple). `handleEvent` filters common ignores (`.git`, `node_modules`, check `stat` for directories - make configurable) and adds to `SyncQueue`. Implement `stopWatching`, `dispose`. Add logging.
    4.  **Resource Notes:** Add comments in `SyncQueue` and `FileWatcherService` about monitoring `queue.length` and potentially pausing the watcher or adding delays if the queue grows too large (primitive resource management).
- **Testing Instructions:**
    1.  **`SyncQueue` Tests:** Create tests. Mock processor. Test add, length, sequential processing, processor calls, error handling.
    2.  **`FileWatcherService` Tests:** Create tests. Mock VS Code watcher API, `fs.stat`, `SyncQueue`. Test watcher creation, event filtering, `syncQueue.add` calls, disposal.
    3.  **Run Tests:** Execute Jest.
    4.  **Expected Outcome:** Tests pass. File watching/queuing is functional.

---

**Story 8: Setup Vector Index Service (Rebuild Strategy)**

- **Goal:** Implement `VectorIndexService` using Faiss (Node bindings preferred) or Voy, focusing on the `rebuild` strategy. Define `IVectorIndex` interface.
- **Files to Create:**
    - `src/codeweaver/intelligence/storage/vectorIndex.ts`
    - `src/codeweaver/tests/unit/intelligence/storage/vectorIndex.test.ts`
- **Implementation Steps:**
    1.  **Choose & Add Dependency:** `npm install node-faiss` (preferred) OR `npm install voy-search`.
    2.  **`IVectorIndex` Interface:** Define in `vectorIndex.ts`: `buildIndex(vectors, ids)`, `search(query, k)`, `saveIndex(path)`, `loadIndex(path)`, `getSize()`, `clearIndex()`, `isReady()`.
    3.  **Concrete Class (e.g., `FaissVectorIndex`)**: Implement `IVectorIndex`.
        - `buildIndex`: Call `index.reset()`, then `index.add(vectors)`. Manage ID mapping separately (e.g., `Map<number, string>` for Faiss index position to original `storage_ref`).
        - `search`: Call `index.search`, map results back using ID map.
        - `saveIndex`/`loadIndex`: Use `faiss.write_index`/`read_index`. Persist ID map alongside.
        - `clearIndex`: Call `index.reset()`. Clear ID map.
        - Handle initialization state. Add detailed logging.
    4.  **`VectorIndexService` Facade:** Implement service. Constructor takes `storagePath`, `dimension`. Instantiates chosen implementation. `initialize` calls `loadIndex`. `add(vectors, ids)` calls underlying `buildIndex` (rebuild). `search`, `save`, `clear`, `isReady`, `getSize` delegate. Logs operations.
- **Testing Instructions:**
    1.  **Test File:** Create `src/codeweaver/tests/unit/intelligence/storage/vectorIndex.test.ts`.
    2.  **Unit Tests (Jest):** Mock vector library (`node-faiss`/`voy-search`) and `fs`. Test concrete implementation methods (build/rebuild, search, save, load, clear). Test `VectorIndexService` facade delegation, initialization, state (`isReady`). Test `add` triggers rebuild.
    3.  **Run Tests:** Execute Jest.
    4.  **Expected Outcome:** Tests pass. Vector index service functional with rebuild strategy.

---

**Story 9: Setup Embedding Generator Service (with Tokenizer)**

- **Goal:** Implement `OnnxEmbeddingGenerator` using ONNX Runtime and `@xenova/transformers` tokenizer.
- **Files to Create:**
    - `src/codeweaver/intelligence/embedding/onnxEmbeddingGenerator.ts`
    - `src/codeweaver/tests/unit/intelligence/embedding/onnxEmbeddingGenerator.test.ts`
- **Files to Copy:**
    - Selected ONNX embedding model + Tokenizer files into `assets/models/` (ensure build copies to `out/`). Use model specified in config (Story 24) or default.
- **Implementation Steps:**
    1.  **Dependencies:** `npm install onnxruntime-node @xenova/transformers`.
    2.  **`OnnxEmbeddingGenerator` Class:** Implement as detailed previously (Story 9).
        - Constructor takes `extensionUri`, `modelFilename` (from config), `expectedDim`. Resolves full path.
        - `initialize`: Load ORT session (CPU provider recommended) and Tokenizer (`AutoTokenizer.from_pretrained` pointing to model dir). Set `isInitialized`. Log success/failure.
        - `generateEmbeddings(texts)`: Tokenize (`tokenizer(texts, { padding: true, truncation: true })`). Prepare `ort.Tensor` feeds (handle `input_ids`, `attention_mask`, correct types like `BigInt64Array`). Run `session.run(feeds)`. Process output tensor (`last_hidden_state`?) using mean pooling over attention mask, normalize (L2). Return `number[][]` or `null`. Log steps and errors.
        - Add `getModelPath()`, `getDimension()`, `isInitialized()`, `dispose()`.
- **Testing Instructions:**
    1.  **Test File:** Create `src/codeweaver/tests/unit/intelligence/embedding/onnxEmbeddingGenerator.test.ts`.
    2.  **Unit Tests (Jest):** Mock `onnxruntime-node`, `@xenova/transformers`, `vscode.ExtensionContext`. Test `initialize` (success/failure). Test `generateEmbeddings`: mock tokenizer/session, verify tensor prep, mock output tensor, verify pooling/normalization logic, verify dimension check, test error handling. Test `isInitialized`, `getDimension`.
    3.  **Run Tests:** Execute Jest.
    4.  **Expected Outcome:** Tests pass. Embedding service structure functional.

---

**Story 10: Implement Local Code Intelligence Engine Facade**

- **Goal:** Implement the main `LocalCodeIntelligenceEngine` class, orchestrating sub-services.
- **Files to Create:**
    - `src/codeweaver/intelligence/intelligenceEngine.ts`
    - `src/codeweaver/tests/unit/intelligence/intelligenceEngine.test.ts`
- **Implementation Steps:**
    1.  **`LocalCodeIntelligenceEngine` Class:** Implement facade (as detailed previously, Story 10).
        - Constructor takes `context`, reads config (`getCodeWeaverSettings`). Initializes sub-services (`SqliteDB`, `VectorIndexService`, `TreeSitterParser`, `OnnxEmbeddingGenerator` - passing model filenames/paths from config, checking for nulls), `SyncQueue` (passing `this.processSyncTask`, concurrency from config), `FileWatcherService`. Log initialized config.
        - `initialize()`: Async method. Calls `connect`/`initialize` on DB, Parser, Embedder, Vector Index sequentially. **Crucially, check for dimension mismatch** between embedder and vector index after both are initialized; log error and potentially disable vector features if mismatched. Starts `FileWatcherService`. Sets `isInitialized` flag. Add instance to `context.subscriptions` using a `dispose` wrapper. Log initialization success/failure.
        - `processSyncTask()`: Stubbed.
        - `dispose()`: Calls `dispose`/`disconnect` on sub-services.
        - `isReady()`: Checks internal flag.
- **Testing Instructions:**
    1.  **Test File:** Create `src/codeweaver/tests/unit/intelligence/intelligenceEngine.test.ts`.
    2.  **Unit Tests (Jest):** Mock all sub-service dependencies, `vscode.ExtensionContext`, config functions. Test constructor correctly reads config and initializes services (handling null model filenames). Test `initialize` call sequence, error handling during sub-service init, dimension mismatch check. Test `dispose` sequence. Test `isReady`.
    3.  **Run Tests:** Execute Jest.
    4.  **Expected Outcome:** Tests pass. Engine facade structure, initialization, and disposal work.

---

**Story 11: Implement Sync Task Processing Logic (Elements & DB)**

- **Goal:** Implement `processSyncTask` DB update logic (create/change/delete files/elements) within a robust SQLite transaction.
- **Files to Modify:**
    - `src/codeweaver/intelligence/intelligenceEngine.ts`
- **Files to Create:**
    - `src/codeweaver/intelligence/codeElementExtractor.ts`
    - `src/codeweaver/tests/unit/intelligence/codeElementExtractor.test.ts`
- **Implementation Steps:**
    1.  **`codeElementExtractor.ts`:** Implement `extractCodeElements(tree, codeContent)` using language-specific Tree-sitter queries to find key structures. Return `ExtractedCodeElement[]` including `content_hash`. Log extracted element count.
    2.  **`processSyncTask` DB Logic:** Implement the core logic within `db.transaction(...)` (as detailed previously, Story 11).
        - **Transaction:** Ensure ALL DB modifications for a single file occur within one transaction. Log transaction start/commit/rollback.
        - **Delete:** Get `file_id`, `DELETE FROM files WHERE id = ?` (allow cascade). Log deletion. _Defer vector/graph cleanup_.
        - **Create/Change:** Read content, calc hash. If hash differs from DB: Parse -> Extract -> Get/Insert `file_id` -> **Query old element IDs/hashes for file** -> `DELETE FROM code_elements WHERE file_id = ?` -> Batch `INSERT INTO code_elements...` (new elements) -> **Store map of `{ newElementHash -> newElementId }` or similar for embedding step.** Log detailed counts.
        - **Error Handling:** Catch errors within the transaction function; the transaction should automatically roll back. Log the error.
- **Testing Instructions:**
    1.  **`codeElementExtractor` Tests:** Create unit tests with mock ASTs (TS, Python examples), verify correct extraction and hashing.
    2.  **`intelligenceEngine.processSyncTask` Tests (Modify):** Enhance tests. Use in-memory SQLite. Mock parser/extractor. Verify `delete` cleans DB. Verify `create` inserts correctly. Verify `change` (diff hash) deletes old/inserts new elements atomically. Verify `change` (same hash) skips DB writes. **Test transaction rollback:** simulate DB error during insertion and verify prior deletions for that file were rolled back. Verify tracking of changed/new elements.
    3.  **Run Tests:** Execute Jest.
    4.  **Expected Outcome:** Tests pass. Sync task updates SQLite atomically and robustly.

---

**Story 12: Integrate Embedding Generation into Sync Process**

- **Goal:** Enhance `processSyncTask` (within the transaction) to generate embeddings ONLY for new/changed elements and update `embeddings_meta`.
- **Files to Modify:**
    - `src/codeweaver/intelligence/intelligenceEngine.ts`
- **Implementation Steps:**
    1.  **Identify Embed Targets:** Use the tracking from Story 11 (elements with new/changed hashes) to get the list of `{ elementId: number, content: string }` needing embedding.
    2.  **Generate Embeddings:** If targets exist and `embedder.isInitialized()`, call `this.embedder.generateEmbeddings()` batch-wise if possible.
    3.  **Update Meta Table:** Within the same transaction, if embeddings generated: Use `INSERT OR REPLACE INTO embeddings_meta...` prepared statement. Include `element_id`, `model_name` (from embedder), calculated `vector_hash`, generated unique `storage_ref`. Log counts. Store generated `{ storage_ref: string, vector: number[] }` pairs needed for Story 13. Handle embedding errors gracefully (log, potentially skip meta update for failed items but allow transaction to commit other changes).
- **Testing Instructions:**
    1.  **`intelligenceEngine.processSyncTask` Tests (Modify):** Mock `OnnxEmbeddingGenerator`. Verify only changed elements trigger `generateEmbeddings`. Verify `embeddings_meta` is updated correctly within the transaction mock. Test embedder not ready / embedding failure scenarios – ensure transaction atomicity for other DB changes. Verify vector data for next step is stored correctly.
    2.  **Run Tests:** Execute Jest.
    3.  **Expected Outcome:** Tests pass. Embeddings generated and meta table updated atomically only for relevant changes.

---

**Story 13: Integrate Vector Index Update into Sync Process (Rebuild Strategy)**

- **Goal:** Trigger a full rebuild of the `VectorIndexService` _after_ the successful commit of the `processSyncTask` DB transaction.
- **Files to Modify:**
    - `src/codeweaver/intelligence/intelligenceEngine.ts`
    - `src/codeweaver/intelligence/storage/vectorIndex.ts` (+ implementations)
- **Implementation Steps:**
    1.  **Refine `IVectorIndex`/Impl:** Ensure `addItems` clears state before adding (rebuild). Ensure `clearIndex` works.
    2.  **Trigger Rebuild:** In `intelligenceEngine.ts`, add a `try...finally` around the `db.transaction()` call. In the `finally` block, _if the transaction was successful_ (`transactionSuccess` flag) AND `vectorIndex.isReady()`:
        - Initiate the rebuild asynchronously (do not block `processSyncTask` return). Use `setTimeout(async () => { ... }, 0)` or a dedicated background task queue for index rebuilds.
        - Inside the async rebuild logic:
            - Query _all_ `storage_ref` and `element_id` from `embeddings_meta`.
            - **Vector Fetching Strategy:** Fetch vectors efficiently. _Revised Approach:_ Maintain an in-memory cache (e.g., LRU cache) mapping `element_id` -> `vector` for recently generated/accessed vectors. For the rebuild, query all `element_id`s from `embeddings_meta`. For each ID, first check the cache. If not found, _queue a background task_ to re-embed that specific element's content (fetched from DB/file) and cache it. The rebuild process waits only for immediately available cached vectors, potentially running with slightly stale data initially but catching up via the background re-embedding tasks. This avoids blocking on full re-embedding.
            - Call `this.vectorIndex.add(cached_vectors, corresponding_storage_refs)` with the available vectors.
            - Log rebuild initiation, completion, and size. Handle errors during rebuild.
- **Testing Instructions:**
    1.  **`VectorIndexService` Tests (Modify):** Verify `addItems` implements rebuild correctly.
    2.  **`intelligenceEngine.processSyncTask` Tests (Modify):** Mock `VectorIndexService`. Verify `vectorIndex.add` (rebuild) is called asynchronously _only after_ a successful DB transaction commit. Mock the DB query for all meta entries. Mock the vector fetching/caching logic. Verify correct data is passed to `vectorIndex.add`. Test DB failure prevents vector update call. Test vector update failure is logged.
    3.  **Run Tests:** Execute Jest.
    4.  **Expected Outcome:** Tests pass. Vector index rebuild is triggered asynchronously post-transaction using available vectors.

---

**Story 14: Implement Local Intelligence Query Methods**

- **Goal:** Implement public query methods on `LocalCodeIntelligenceEngine` for Relevancy Engine use.
- **Files to Modify:**
    - `src/codeweaver/intelligence/intelligenceEngine.ts`
    - `src/codeweaver/intelligence/storage/sqliteDb.ts`
- **Implementation Steps:**
    1.  **`SqliteDB` Helpers:** Implement specific, indexed query methods using prepared statements (`getCodeElementById`, `getCodeElementsForFile`, `findElementsByName`, `getGraphEdges`, FTS search method `searchElementsFTS`), as detailed previously (Story 14).
    2.  **`IntelligenceEngine` Facade Methods:** Implement public async methods (`getCodeElementById`, `getCodeElementsInFile`, `findElementsByName`, `getOutgoingEdges`, `getIncomingEdges`, `searchCode` [using FTS helper], `getElementContent` [read file + substring, log potential staleness], `getFilePath`) delegating to `SqliteDB`. Include `isReady()` checks. Add logging.
- **Testing Instructions:**
    1.  **`SqliteDB` Tests (Modify):** Add unit tests for new query helpers, mocking statement execution.
    2.  **`IntelligenceEngine` Tests (Modify):** Add unit tests for new public query methods. Mock `SqliteDB`, `vscode.workspace.fs`. Verify correct delegation, parameter handling, return values (null/empty cases). Test `getElementContent` file reading/substring logic.
    3.  **Run Tests:** Execute Jest.
    4.  **Expected Outcome:** Tests pass. Query API is functional.

---

**Phase 1 Complete**

---

**Phase 2: Efficiency - Multi-Model Orchestration**

---

**Story 15: Implement Relevancy Engine Structure & Vector Retriever**

- **Goal:** Create `RelevancyEngine` structure and implement `VectorRetriever` using embedding/vector services.
- **Files to Create:**
    - `src/codeweaver/relevancy/relevancyEngine.ts`
    - `src/codeweaver/relevancy/retrievers/vectorRetriever.ts`
    - `src/codeweaver/tests/unit/relevancy/relevancyEngine.test.ts`
    - `src/codeweaver/tests/unit/relevancy/retrievers/vectorRetriever.test.ts`
- **Implementation Steps:**
    1.  **`IRetriever` Interface:** Define in `interfaces/index.ts` (`retrieve(input)` returns `Promise<RetrieverResult[]>`). Define `RetrievalInput`, `RetrieverResult`.
    2.  **`VectorRetriever` Class:** Implement `IRetriever`. Constructor takes `OnnxEmbeddingGenerator`, `VectorIndexService`, `SqliteDB`. `retrieve` method: gets text from `input`, generates query embedding, searches `VectorIndexService`, maps `storage_ref` back to `elementId` via `SqliteDB`, calculates similarity score (e.g., `(1 + cosine_distance) / 2`), returns `RetrieverResult[]`. Handles embedder/index not ready states. Log steps.
    3.  **`RelevancyEngine` Class:** Implement structure. Constructor takes `IntelligenceEngine` and other needed services (`Embedder`, `VectorIndex`, `SqliteDB`). Instantiates `VectorRetriever` and adds to `this.retrievers`. `getRelevantContext` method: takes `RetrievalInput`, calls all retrievers in parallel (`Promise.all`), flattens results (simple dedupe/sort by score for now - ranking in Story 17). Log counts.
- **Testing Instructions:**
    1.  **`VectorRetriever` Tests:** Create unit tests. Mock dependencies. Test successful retrieval (embedding -> search -> ID mapping -> score calc). Test embedder/index not ready. Test embedding/search failures. Test ID mapping failure.
    2.  **`RelevancyEngine` Tests:** Create unit tests. Mock `IntelligenceEngine` and retrievers. Test constructor initializes retriever(s). Test `getRelevantContext` calls retriever(s), merges/sorts results correctly.
    3.  **Run Tests:** Execute Jest.
    4.  **Expected Outcome:** Tests pass. Vector retrieval and basic relevancy engine structure work.

---

**Story 16: Implement Graph and Lexical Retrievers**

- **Goal:** Implement `GraphRetriever` and `LexicalRetriever`, adding them to `RelevancyEngine`.
- **Files to Create:**
    - `src/codeweaver/relevancy/retrievers/graphRetriever.ts`
    - `src/codeweaver/relevancy/retrievers/lexicalRetriever.ts`
    - `src/codeweaver/tests/unit/relevancy/retrievers/graphRetriever.test.ts`
    - `src/codeweaver/tests/unit/relevancy/retrievers/lexicalRetriever.test.ts`
- **Files to Modify:**
    - `src/codeweaver/relevancy/relevancyEngine.ts`
- **Implementation Steps:**
    1.  **`GraphRetriever` Class:** Implement `IRetriever`. Constructor takes `IntelligenceEngine`. `retrieve` method: find starting element ID near `input.editorState.cursorPosition` (using `IntelligenceEngine` queries). Perform limited-depth graph traversal (BFS/DFS) using `IntelligenceEngine.getOutgoingEdges`/`getIncomingEdges`. Assign scores based on distance/edge type (configurable weights later). Return unique `RetrieverResult[]`. Log traversal details.
    2.  **`LexicalRetriever` Class:** Implement `IRetriever`. Constructor takes `IntelligenceEngine`. `retrieve` method: extract keywords from `input.taskDescription`. Call `intelligenceEngine.searchCode` (FTS query). Assign a fixed or FTS-rank-based score. Return `RetrieverResult[]`. Log query and results.
    3.  **Add to `RelevancyEngine`:** Instantiate `GraphRetriever` and `LexicalRetriever` in the `RelevancyEngine` constructor and add them to `this.retrievers`.
- **Testing Instructions:**
    1.  **`GraphRetriever` Tests:** Create unit tests. Mock `IntelligenceEngine`. Test finding start element. Test graph traversal logic (depth limit, edge types). Test scoring assignment. Test empty results cases.
    2.  **`LexicalRetriever` Tests:** Create unit tests. Mock `IntelligenceEngine`. Test keyword extraction. Test `searchCode` call. Test result formatting/scoring. Test empty results cases.
    3.  **`RelevancyEngine` Tests (Modify):** Update tests to ensure all three retrievers are instantiated and called by `getRelevantContext`. Verify results from all mocked retrievers are merged correctly before ranking.
    4.  **Run Tests:** Execute Jest.
    5.  **Expected Outcome:** Tests pass. All three retrieval methods are implemented and integrated.

---

**Story 17: Implement Relevancy Scoring & Ranking**

- **Goal:** Implement sophisticated scoring/ranking logic in `RelevancyEngine` using configurable weights and source boosting.
- **Files to Modify:**
    - `src/codeweaver/relevancy/relevancyEngine.ts`
- **Files to Create:**
    - `src/codeweaver/relevancy/scoring/ranker.ts`
    - `src/codeweaver/tests/unit/relevancy/scoring/ranker.test.ts`
- **Implementation Steps:**
    1.  **`ranker.ts`:** Implement `rankResults(results, weights?, maxResults)` function (as detailed previously, Story 17). Logic: group results by `elementId`, calculate weighted score (using `weights[result.source]`), apply `sourceBoost` if multiple sources found the same element, sort by final score descending, slice to `maxResults`. Use default weights initially, allow passing weights.
    2.  **Integrate Ranker:** Modify `RelevancyEngine.getRelevantContext` to call `rankResults` after gathering raw results from all retrievers, passing weights from config (Story 24). Return the output of `rankResults`.
- **Testing Instructions:**
    1.  **`ranker` Tests:** Create unit tests. Test weighting, source boost, sorting, slicing logic with various input `RetrieverResult` combinations. Test default weights and passing custom weights. Test edge cases (empty input).
    2.  **`RelevancyEngine` Tests (Modify):** Update `getRelevantContext` tests. Verify `rankResults` is called with raw results. Verify the output of `getRelevantContext` matches the (mocked or actual) output of `rankResults`.
    3.  **Run Tests:** Execute Jest.
    4.  **Expected Outcome:** Tests pass. Relevancy results are ranked using the weighted, boosted algorithm.

---

**Story 18: Implement Basic Context Assembler with Tokenization**

- **Goal:** Implement `ContextAssembler` using `tiktoken` for accurate token counting and truncation to build the final prompt context.
- **Files to Create:**
    - `src/codeweaver/context/contextAssembler.ts`
    - `src/codeweaver/utils/tokenizer.ts`
    - `src/codeweaver/tests/unit/context/contextAssembler.test.ts`
    - `src/codeweaver/tests/unit/utils/tokenizer.test.ts`
- **Files to Modify:**
    - `src/codeweaver/context/contextRetriever.ts`
- **Implementation Steps:**
    1.  **Dependency:** `npm install tiktoken`.
    2.  **`tokenizer.ts`:** Implement `estimateTokenCount` and `truncateTextByToken` using `tiktoken` (e.g., `get_encoding("o200k_base")`). Include error handling and fallback to character estimates if `tiktoken` fails. Log warnings on fallback. Add `disposeTokenizer()` if needed.
    3.  **`ContextAssembler` Class:** Implement class. Constructor takes `IntelligenceEngine`. `assembleContext` method: takes ranked results, description, history, `targetTokenLimit`. Iterates through ranked results, fetches content (`intelligenceEngine.getElementContent`), estimates tokens (`estimateTokenCount`), truncates if snippet exceeds `MAX_SNIPPET_TOKENS` config (`truncateTextByToken`), adds snippet to `finalSnippets` if it fits `remainingTokens`. Iterates through `history` (newest first), estimates tokens, adds to `finalHistory` if fits remaining budget (`MAX_HISTORY_TOKENS` cap). Returns `RetrievedContext { snippets, history }`. Log token usage and truncation decisions. Requires `getFilePath` helper in `IntelligenceEngine`.
    4.  **`CodeWeaverContextRetriever` Class:** Implement fully. Constructor takes `RelevancyEngine`, `IntelligenceEngine`. Instantiates `ContextAssembler`. `getContext` method calls `relevancyEngine.getRelevantContext`, then passes results to `contextAssembler.assembleContext`.
- **Testing Instructions:**
    1.  **`tokenizer` Tests:** Create unit tests. Mock `tiktoken` (optional) or test directly. Verify estimation and truncation, including fallbacks and error handling.
    2.  **`ContextAssembler` Tests:** Create unit tests. Mock `IntelligenceEngine`, mock `tokenizer` utils. Verify token budget logic for snippets and history, truncation calls, correct formatting.
    3.  **`ContextRetriever` Tests:** Create/Modify unit tests. Mock `RelevancyEngine`, `ContextAssembler`. Verify calls and data flow.
    4.  **Run Tests:** Execute Jest.
    5.  **Expected Outcome:** Tests pass. Context assembly uses `tiktoken` for limits.

---

**Story 19: Implement Tier 1 LLM Orchestrator Pass-through**

- **Goal:** Implement the `CodeWeaverLLMOrchestrator` stub (created in Story 3) to actually call the Tier 1 API via `vscode.lm.sendChatRequest`.
- **Files to Modify:**
    - `src/codeweaver/orchestration/orchestrator.ts`
- **Files to Create:**
    - `src/codeweaver/tests/unit/orchestration/orchestrator.test.ts`
- **Implementation Steps:**
    1.  **Implement `callTier1Api`:** Fill in the private `callTier1Api` method within `CodeWeaverLLMOrchestrator`.
        - Determine `modelSelector` (use `options.modelPreference` if provided, else default like `gpt-4o`).
        - Prepare `requestOptions` (temperature, maxTokens from `options`).
        - Call `await vscode.lm.sendChatRequest(...)` passing selector, prompt messages, options, cancellation token.
        - Implement the `async function* streamGenerator()` to handle the streaming response from `sendChatRequest`, yielding `{ chunk }` or `{ done }`. Include error handling for the stream consumption. Return the generator.
        - Log the request initiation and stream completion/error.
    2.  **Refine `makeApiRequest`:** Ensure the Tier 1 routing path correctly calls `callTier1Api` and returns its result. Ensure the Tier 0 path returns a compatible structure (e.g., `Promise<{ text: async () => string }>` for non-streaming stub).
- **Testing Instructions:**
    1.  **Test File:** Create/Modify `src/codeweaver/tests/unit/orchestration/orchestrator.test.ts`.
    2.  **Unit Tests (Jest):** Mock `vscode.lm.sendChatRequest`. Test `makeApiRequest`:
        - Verify Tier 1 routing path calls `callTier1Api`.
        - Test `callTier1Api`: Verify `sendChatRequest` is called with correct model selector, prompt, options. Mock stream response -> verify async generator yields correct chunks/done. Mock `sendChatRequest` throwing -> verify error is handled/rethrown. Test cancellation token propagation.
    3.  **Run Tests:** Execute Jest.
    4.  **Expected Outcome:** Tests pass. Orchestrator correctly calls Tier 1 VS Code LM API.

---

**Story 20: Implement Basic CodeWeaverAgent Structure**

- **Goal:** Implement the basic structure and `runTask` method of `CodeWeaverAgent` using the real `IContextRetriever` and `ILLMOrchestrator` implementations (stubs replaced). Focus on single request-response flow initially.
- **Files to Modify:**
    - `src/codeweaver/agent.ts`
- **Files to Create:**
    - `src/codeweaver/tests/unit/agent.test.ts`
- **Implementation Steps:**
    1.  **Implement `CodeWeaverAgent`:** Replace the `CodeWeaverAgentStub`.
        - Constructor takes `initialConfig`, `dependencies: AgentDependencies`. Stores retriever, orchestrator, logger. Initializes `currentHistory`.
        - `runTask(initialPrompt, taskConfig)`: Implement the initial, non-looping logic:
            - Get `editorState`.
            - Call `contextRetriever.getContext(initialPrompt, editorState, [])`.
            - Call `buildPromptMessages(initialPrompt, context.snippets, [])`.
            - Call `llmOrchestrator.makeApiRequest(promptMessages, { taskTypeHint: 'GENERATE' })`.
            - Implement `processLLMResponse` helper to handle streaming/non-streaming result from orchestrator, accumulate full text, post chunks to UI via `postMessageToUI` (stub).
            - Update `currentHistory` with user prompt and full assistant response.
            - Return `TaskResult { status: 'completed', finalAnswer }`.
            - Include try/catch for overall task error handling, return `TaskResult { status: 'error' }`.
        - Implement `buildPromptMessages` helper (include system prompt, context formatting).
        - Implement `postMessageToUI` stub (logs message).
- **Testing Instructions:**
    1.  **Test File:** Create `src/codeweaver/tests/unit/agent.test.ts`.
    2.  **Unit Tests (Jest):** Mock `IContextRetriever` (`getContext`), `ILLMOrchestrator` (`makeApiRequest`). Mock logger, `postMessageToUI`.
        - Test Case 1 (Success Flow): Verify `getContext` called -> `buildPromptMessages` logic -> `makeApiRequest` called -> `processLLMResponse` handles mock stream/response -> history updated -> UI message posted -> correct `TaskResult` returned.
        - Test Case 2 (Context Error): Mock `getContext` throwing -> Verify error handled, correct `TaskResult` returned.
        - Test Case 3 (LLM Error): Mock `makeApiRequest` throwing -> Verify error handled, correct `TaskResult` returned.
    3.  **Run Tests:** Execute Jest.
    4.  **Expected Outcome:** Tests pass. Basic agent structure can perform a single RAG request-response cycle.

---

**Story 21: Implement Roo-Code Mode Interface Wrappers**

- **Goal:** Implement the _real_ wrapper classes (`RooCodeContextRetriever`, `RooCodeLLMOrchestrator`) that delegate to original Roo-Code services, replacing the stubs.
- **Files to Modify:**
    - `src/interfaces/rooCodeContextRetriever.ts`
    - `src/interfaces/rooCodeLLMOrchestrator.ts`
    - `src/providers/cline-provider/ClineProvider.ts` (Update dependency creation)
- **Implementation Steps:**
    1.  **`RooCodeContextRetriever`:** Replace stub. Constructor takes original Roo-Code services (e.g., `WorkspaceTracker`, config). `getContext` method calls original Roo-Code context logic and **adapts the result** to the `RetrievedContext` interface (mapping file paths/content to `CodeSnippet[]`).
    2.  **`RooCodeLLMOrchestrator`:** Replace stub. Constructor takes Roo-Code config/API services. `makeApiRequest` method: selects provider using original logic (`buildApiHandler`?), adapts `LanguageModelChatMessage[]` prompt if needed, calls the original handler's request method, **adapts the response/stream** (e.g., using async generator) to match `ILLMOrchestrator`'s return type (`Promise<LLMResponse | AsyncIterable<LLMResponseStream>>`).
    3.  **Update `ClineProvider._createAgentDependencies`:** Modify the `else` block (Roo-Code mode) to instantiate these _real_ wrappers, passing the necessary original Roo-Code services.
- **Testing Instructions:**
    1.  **Wrapper Unit Tests:** Create/Update tests for `RooCodeContextRetriever` and `RooCodeLLMOrchestrator`. Mock the original Roo-Code services they wrap. Verify the wrappers call the underlying services correctly and accurately adapt the inputs/outputs to the `IContextRetriever`/`ILLMOrchestrator` interfaces.
    2.  **`ClineProvider` Integration Tests (Modify):** Update tests to verify the real wrappers are instantiated in Roo-Code mode.
    3.  **Run Tests:** Execute Jest. Run full Roo-Code test suite to ensure no regressions.
    4.  **Expected Outcome:** Tests pass. Dispatch logic now uses real wrappers for Roo-Code mode, maintaining original functionality via the abstraction.

---

**Phase 2: Efficiency - Multi-Model Orchestration**

---

**Story 22: Setup Local LLM Service (Tier 0)**

- **Goal:** Implement `LocalModelService` for loading and running a local ONNX Tier 0 LLM, acknowledging generation complexity.
- **Files to Create:**
    - `src/codeweaver/orchestration/localModelService.ts`
    - `src/codeweaver/tests/unit/orchestration/localModelService.test.ts`
- **Files to Copy:**
    - Quantized ONNX Tier 0 LLM (e.g., Phi-3) + Tokenizer files into `assets/models/`. Use filename from config.
- **Implementation Steps:**
    1.  **Dependencies:** `onnxruntime-node`, `@xenova/transformers`.
    2.  **`LocalModelService` Class:** Implement class (as detailed previously, Story 22).
        - `initialize`: Loads ORT session (CPU) and Tokenizer based on config filename.
        - `runInference(input)`: **Implement basic structure.** Tokenize input using correct prompt format (e.g., Phi-3 instruct format). **Add detailed comments explaining that the core generation loop (repeatedly calling `session.run`, sampling logits based on temperature, appending tokens, checking for EOS/max length) is complex and NOT fully implemented here.** Return a _stubbed_ output string for now (e.g., `"[Local LLM Stub Output]"`) after performing basic input processing and potentially one `session.run` call (if feasible for testing mocks). Log warnings about stubbed generation.
        - `isReady`, `dispose`.
- **Testing Instructions:**
    1.  **Test File & Unit Tests:** Create tests. Mock ORT/Tokenizer. Test `initialize`. Test `runInference`: verify tokenizer called with correct format, verify `session.run` called (mocked), verify _stubbed_ output returned. Test `isReady`, `dispose`.
    2.  **Run Tests:** Execute Jest.
    3.  **Expected Outcome:** Tests pass. Local LLM service structure is ready, generation is explicitly stubbed.

---

**Story 23: Implement Rule-Based Routing in Orchestrator**

- **Goal:** Update `CodeWeaverLLMOrchestrator` to route internal task types to the `LocalModelService` (Tier 0).
- **Files to Modify:**
    - `src/codeweaver/orchestration/orchestrator.ts`
- **Implementation Steps:**
    1.  **Inject `LocalModelService`:** Update constructor (make optional, check `isReady`).
    2.  **Update `makeApiRequest` Routing:** Implement `if (canUseLocal && internalTaskTypes.includes(taskTypeHint)) { ... } else { ... }` logic (as detailed previously, Story 23). Call `localModelService.runInference` for Tier 0 tasks. Adapt the (stubbed) result to `LLMResponse` format. Fallback to Tier 1 if local fails or isn't ready, logging a warning. Call `callTier1Api` for other tasks.
- **Testing Instructions:**
    1.  **Test File & Unit Tests (Modify):** Update orchestrator tests. Mock `LocalModelService`. Test Tier 0 routing path (verify `runInference` called, result adapted). Test Tier 0 fallback to Tier 1 if local not ready. Test Tier 1 direct routing.
    2.  **Run Tests:** Execute Jest.
    3.  **Expected Outcome:** Tests pass. Orchestrator routes based on task type hint.

---

**Story 24: Add CodeWeaver Settings for Local Models & Tuning**

- **Goal:** Implement settings UI and configuration reading for CodeWeaver options (local model filenames, concurrency, tuning params).
- **Files to Modify:**
    - `src/schemas/index.ts`
    - `evals/packages/types/src/roo-code-defaults.ts`
    - `webview-ui/src/components/settings/SettingsView.tsx`
    - `src/codeweaver/config/settings.ts`
    - Relevant service constructors (`IntelligenceEngine`, `LocalModelService`, `RelevancyEngine`, `SyncQueue`)
- **Implementation Steps:**
    1.  **Define Settings:** Add `codeweaver` nested object to `src/schemas/index.ts` with properties: `localEmbeddingModelFilename`, `localLLMFilename`, `maxContextSnippets`, `relevancyWeights` (object with graph/vector/lexical/boost), `syncConcurrency`. Use `title` for UI grouping. Add descriptions and defaults.
    2.  **Set Defaults:** Update `roo-code-defaults.ts`.
    3.  **Update `settings.ts`:** Implement `getCodeWeaverSettings` fully to read nested properties using `config.get('propertyName', defaultValue)`. Handle defaults robustly.
    4.  **Update UI:** In `SettingsView.tsx` (`agentMode === 'codeweaver'` block), add controls (`VSCodeTextField`, `VSCodeSlider`, etc.) bound to state variables representing these settings. Ensure state changes trigger `saveSetting` messages. Group related settings using headers or fieldsets.
    5.  **Use Settings:** Update constructors/init logic in relevant services to accept and use values from `getCodeWeaverSettings()` (model filenames, concurrency, weights, max snippets). Handle `null` filenames (disable feature).
- **Testing Instructions:**
    1.  **`settings.ts` Tests (Modify):** Verify reading nested settings and defaults.
    2.  **Manual UI Tests:** Verify new settings UI, saving, persistence.
    3.  **Component Unit Tests (Modify):** Verify components use mocked settings correctly. Test disabled features.
    4.  **Run Tests:** Execute Jest and manual tests.
    5.  **Expected Outcome:** CodeWeaver settings fully implemented and used.

---

**Phase 3: Agentic Flow & Refinement**

---

**Story 25: Implement Reactive Agent Loop (LLM Function Calling)**

- **Goal:** Implement the reactive `CodeWeaverAgent.runTask` loop driven by LLM text responses and `tool_calls`. (Replaces Story 25/27 from previous plan).
- **Files to Modify:**
    - `src/codeweaver/agent.ts`
- **Implementation Steps:**
    1.  **Refactor `runTask`:** Implement the reactive loop (detailed previously, Story 27):
        - Max turn limit. Loop starts with initial user prompt in history.
        - Inside loop: `deriveCurrentGoal`, `contextRetriever.getContext`, `buildPromptMessages` (include tool definitions), `llmOrchestrator.makeApiRequest`.
        - `processLLMResponseAndExtractTools` helper (needs careful implementation based on API response format - _mark as potentially complex_).
        - Add assistant text to history/UI.
        - If `toolCalls`: Add `tool_calls` message to history. Iterate calls. **Assume `vscode.lm` handles invoking registered tools based on the LLM response.** Add placeholder `tool_results` messages to history based on tool call IDs (or implement actual result fetching if framework provides it). Continue loop.
        - If no `toolCalls`: Assume final response. Post to UI, return result.
    2.  **Refine `buildPromptMessages`:** Ensure prompt clearly lists available tools and instructs the LLM on the expected `tool_calls` format.
    3.  **Implement Helpers:** Implement `deriveCurrentGoal` (simple version), `processLLMResponseAndExtractTools` (needs careful parsing of LLM output), `postMessageToUI`.
- **Testing Instructions:**
    1.  **Test File & Unit Tests (Modify):** Update `agent.test.ts`. Mock retriever, orchestrator, tool registry (though not directly called in this flow).
        - Test text response termination.
        - Test tool call flow: Mock orchestrator returning `tool_calls`. Verify history includes `tool_calls`. Verify loop continues and next LLM call includes placeholder `tool_results`. Mock orchestrator returning text response after tool results -> Verify termination.
        - Test max turns termination. Test error handling. Test helper functions.
    2.  **Run Tests:** Execute Jest.
    3.  **Expected Outcome:** Tests pass. Agent implements reactive loop based on LLM function calling paradigm.

---

**Story 26: Implement Tool Registry and Registration**

- **Goal:** Define `ToolRegistry`, implement basic tools (`readFile`, `applyFileSystemEdit`), and register them using `vscode.lm.registerTool` with confirmation logic.
- **Files to Create:**
    - `src/codeweaver/tools/toolRegistry.ts`
    - `src/codeweaver/tests/unit/tools/toolRegistry.test.ts`
- **Implementation Steps:**
    1.  **`ToolRegistry` Class:** Implement class (detailed previously, Story 26).
        - Constructor takes dependencies (`IntelligenceEngine`, logger).
        - `registerTools()`: Defines tools (`readFile`, `applyFileSystemEdit`, `runTerminalCommand`) with name, description. For each, calls `vscode.lm.registerTool`. Implement the `invoke` function for each:
            - Parse arguments (using robust JSON.parse or similar on extracted arguments string).
            - **For sensitive tools (`applyFileSystemEdit`, `runTerminalCommand`): Implement mandatory `await vscode.window.showWarningMessage(..., { modal: true }, 'Confirm')` check.** Throw `vscode.LanguageModelError` if denied/cancelled.
            - Execute the underlying VS Code API (`fs.readFile`, `workspace.applyEdit`, `window.createTerminal`).
            - Return structured result (e.g., `{ success: true }` or `{ error: message }`).
        - `dispose()`: Disposes registered tool disposables.
    2.  **Centralized Registration:** In `extension.ts` `activate` function, _if CodeWeaver mode is enabled_, instantiate `ToolRegistry` (passing dependencies) and add its disposable to `context.subscriptions`.
- **Testing Instructions:**
    1.  **Test File & Unit Tests:** Create tests for `ToolRegistry`. Mock `vscode.lm.registerTool`, `vscode.window.showWarningMessage`, VS Code FS/Workspace/Terminal APIs. Test tool definitions. Test `registerTools` calls registration API. Test `invoke` logic for each tool, **especially argument parsing and confirmation flow**. Test disposal.
    2.  **Run Tests:** Execute Jest.
    3.  **Expected Outcome:** Tests pass. Tools are defined and registered with confirmation.

---

_(Story 27 - Reactive Agent Loop - is now covered by the revised Story 25/27)_
_(Story 28 - User Confirmation - is now handled within Story 26)_

---

**Story 29: Implement Graph Edge Update in Sync Process**

- **Goal:** Enhance `processSyncTask` to extract code relationships (calls, imports) and update the `graph_edges` table atomically within the transaction.
- **Files to Modify:**
    - `src/codeweaver/intelligence/intelligenceEngine.ts`
    - `src/codeweaver/intelligence/codeElementExtractor.ts` (or new `astRelationshipExtractor.ts`)
    - `src/codeweaver/intelligence/storage/sqliteDb.ts`
- **Implementation Steps:**
    1.  **`SqliteDB` Helpers:** Add `deleteGraphEdgesForSource(id)` and `insertGraphEdges(edges[])` methods using transactions/prepared statements.
    2.  **Relationship Extraction:** Enhance `codeElementExtractor` or create `astRelationshipExtractor` to use language-specific Tree-sitter queries (e.g., `(call function: (...) @call)`, `(import_statement name: (_) @import)`) to find relationships. Map query captures back to source `elementId`s (requires node-to-id mapping during element processing). Output `NewEdgeData[] = { source_element_id, target_name, edge_type }`.
    3.  **Update `processSyncTask`:** Within the main transaction, after elements/embeddings are handled:
        - Call `sqliteDb.deleteGraphEdgesForSource()` for all `elementId`s in the processed file.
        - Call the relationship extractor using the AST and `elementId` map.
        - Resolve `target_name` to `target_element_id` using `sqliteDb.findElementsByName(name, type)` (limit 1).
        - Call `sqliteDb.insertGraphEdges()` with the new edge data (resolved `target_element_id` or null). Log counts. Ensure part of the main transaction.
- **Testing Instructions:**
    1.  **Extractor Tests:** Unit test relationship extraction with mock ASTs for different relationship types.
    2.  **`SqliteDB` Tests (Modify):** Add tests for graph edge helpers.
    3.  **`intelligenceEngine.processSyncTask` Tests (Modify):** Mock extractor. Verify edge deletion. Verify extractor call. Verify target resolution (mock DB). Verify `insertGraphEdges` called correctly within transaction. Test transaction rollback includes edge changes.
    4.  **Run Tests:** Execute Jest.
    5.  **Expected Outcome:** Tests pass. Graph edges updated atomically during sync.

---

**Story 30: Performance Benchmarking & Optimization Strategy**

- **Goal:** Integrate basic performance timing infrastructure and document benchmarking strategy. Add basic resource monitoring points.
- **Files to Create:**
    - `src/codeweaver/utils/performanceTimer.ts`
    - `docs/PERFORMANCE.md`
- **Files to Modify:**
    - Key methods in `intelligenceEngine.ts`, `relevancyEngine.ts`, `agent.ts`, etc.
- **Implementation Steps:**
    1.  **`performanceTimer.ts`:** Implement `PerfTimer` class or `logTime` utilities using `process.hrtime.bigint()`.
    2.  **Integrate Timers:** Add `PerfTimer` start/end calls around: `intelligenceEngine.initialize`, `processSyncTask` (overall and key internal steps like parse, embed, DB updates, vector update), `relevancyEngine.getRelevantContext` (overall and individual retrievers), `orchestrator.makeApiRequest` (distinguish Tier 0/1), `agent.runTask` (overall turn). Log timings using logger (maybe at `debug` level, enabled by config).
    3.  **Resource Monitoring:** Add basic logging points for `syncQueue.getQueueLength()` within `FileWatcherService` or `IntelligenceEngine`. Add notes about potentially using Node.js `process.memoryUsage()` periodically in background tasks (use cautiously).
    4.  **`PERFORMANCE.md`:** Create document outlining KPIs, Methodology (benchmark repos, hardware context), Results section (for baseline data), and Optimization Areas (vector rebuild, `getElementContent`, sync concurrency, query tuning, model quantization, caching), referencing specific story feedback.
- **Testing Instructions:**
    1.  **`performanceTimer` Tests:** Unit test the timer utility.
    2.  **Manual/Benchmark Testing:** Execute Story 30 steps: Run extension, enable perf logging, perform standard workflows (indexing, editing, agent tasks) on benchmark projects. Collect logs, populate `PERFORMANCE.md` baseline. No automated tests for this specific story beyond the timer utility itself.
    3.  **Expected Outcome:** Performance timing integrated. Documentation created. Baseline established for future optimization.

---
