# MageCode Refinement Plan (Story 20)

**Goal:** Enhance the robustness, maintainability, and debuggability of the MageCode feature through comprehensive logging, improved error handling, code cleanup, configuration review, documentation updates, and thorough testing.

**Context:**

- The `src/magecode/` directory contains a substantial implementation covering local intelligence, orchestration, relevancy, agent logic, and tools.
- Current logging relies heavily on `console.*` calls.
- Several `TODO` comments exist, indicating known areas for improvement.
- A preliminary search suggests `try...catch` blocks might be sparse, highlighting the need for a focused error handling review.

**Proposed Plan:**

**Phase 1: Foundational Improvements (Logging & Error Handling)**

1.  **Implement Dedicated Logger (`src/magecode/utils/logging.ts`):**

    - Create a `Logger` utility using `vscode.window.createOutputChannel("MageCode")`.
    - Provide standard logging methods: `debug()`, `info()`, `warn()`, `error()`.
    - Consider adding context (e.g., component name) to log messages automatically.
    - Establish a singleton instance or a clear way to access the logger throughout the `src/magecode/` module (addressing the `TODO` in `initialize.ts` regarding instance accessibility might be relevant here).
    - **Action:** Replace all existing `console.*` calls within `src/magecode/` (excluding test mocks) with the new `Logger` methods, using appropriate levels.
    - **Action:** Add specific, informative logs as outlined in the story:
        - Initialization steps and timings (`initialize.ts`, `factory.ts`, component constructors).
        - `SyncService`: File processing start/end/errors, queue status.
        - Cache hits/misses (`EmbeddingService`, `MMO`).
        - `MMO`: Routing decisions, tier requests/fallbacks.
        - `Agent`: Planning steps, step execution start/end, tool usage.
        - `ToolRegistry` & Tools: Execution start/end, arguments, results/errors.
        - Significant errors encountered across all components.

2.  **Enhance Error Handling:**
    - **Action:** Define custom error classes (e.g., `MageCodeError`, `ParsingError`, `EmbeddingError`, `ToolExecutionError`, `DatabaseError`, `VectorIndexError`, `ApiError`) in `src/magecode/utils/errors.ts` (create if needed).
    - **Action:** Systematically review critical code paths for potential failures:
        - File I/O (`fs` operations in `SyncService`, `VectorIndex`, `DatabaseManager`, `FileReaderTool`).
        - Database operations (`DatabaseManager`).
        - Vector index operations (`VectorIndex`).
        - Parsing (`MageParser`).
        - Embedding generation (`EmbeddingService`, potentially external model calls).
        - Model inference calls (`LocalModelTier`, `CloudModelTier`).
        - Tool execution (`Agent`, `ToolRegistry`).
        - API interactions (if any).
    - **Action:** Implement `try...catch` blocks around these operations.
    - **Action:** In `catch` blocks:
        - Log the error with context using the new `Logger.error()`.
        - Throw or wrap the error using the custom error types.
        - Decide on graceful handling: propagate the error, return a specific error state/result, or show a user-facing message (`vscode.window.showErrorMessage`/`showWarningMessage`) where appropriate. Avoid letting errors crash the extension host.
    - **Action:** Review external dependencies and consider adding timeouts (e.g., using `Promise.race` with a timeout promise) for operations like model inference or potentially slow file operations.

**Phase 2: Code Quality & Configuration**

3.  **Code Review & Refactoring:**

    - **Action:** Address all `TODO` comments identified in the search.
    - **Action:** Perform a general code review focusing on:
        - Clarity, readability, and consistent naming conventions.
        - Simplifying overly complex functions or classes.
        - Removing dead code (unused imports, variables, functions, commented-out blocks).
    - **Action:** Verify correct `Disposable` management. Ensure resources like DB connections (`DatabaseManager`), file watchers (`SyncService`), and potentially ONNX sessions (`LocalModelTier`) are registered in `context.subscriptions` (usually in `initialize.ts` or `factory.ts`) or have their own `dispose` methods called correctly.

4.  **Configuration Review:**
    - **Action:** Search the codebase for hardcoded values (timeouts, cache sizes/TTLs, processing limits, retry counts, model names/endpoints if any).
    - **Action:** Evaluate if these should be configurable via VS Code settings, particularly those related to performance or resource usage (e.g., cache sizes, processing limits). Target `mage-code.magecode.localProcessing` or create new sub-sections as needed.
    - **Action:** If new settings are added:
        - Update `package.json` (`contributes.configuration`).
        - Update `src/magecode/config/settings.ts` to read and potentially watch these settings.
        - Update `src/magecode/settings/settingsViewProvider.ts` if UI changes are needed (referencing Story 17).
        - Replace hardcoded values with calls to the configuration service.

**Phase 3: Documentation & Verification**

5.  **Documentation:**

    - **Action:** Add/update TSDoc comments for all public classes, methods, and interfaces within `src/magecode/`. Explain the purpose, parameters, and return values.
    - **Action:** Create `src/magecode/README.md`. Include:
        - A brief explanation of MageCode's purpose within Roo-Code.
        - A high-level overview of the main components (LCIE, Relevancy, MMO, Agent, Tools) and their responsibilities.
        - A simple Mermaid diagram illustrating component interactions (see example below).

    ```mermaid
    graph TD
        subgraph User Interaction
            UI(VS Code UI / Commands)
        end

        subgraph Roo-Code Core
            Ext(extension.ts) --> CP(ClineProvider.ts)
        end

        subgraph MageCode (src/magecode)
            Init(initialize.ts) --> Factory(factory.ts)

            Factory --> Agent(Agent)
            Factory --> MMO(MMO)
            Factory --> LCIE(LCIE)
            Factory --> Relevancy(RelevancyEngine)
            Factory --> ToolReg(ToolRegistry)
            Factory --> Logger(Logger)

            Agent --> MMO; Agent --> Relevancy; Agent --> ToolReg; Agent --> Logger

            MMO --> LocalTier(LocalModelTier); MMO --> CloudTier(CloudModelTier); MMO --> Logger

            Relevancy --> VectorRet(VectorRetriever); Relevancy --> GraphRet(GraphRetriever); Relevancy --> Logger
            VectorRet --> LCIE; GraphRet --> LCIE

            LCIE --> SyncSvc(SyncService); LCIE --> EmbedSvc(EmbeddingService); LCIE --> Parser(MageParser); LCIE --> VectorIdx(VectorIndex); LCIE --> DBMgr(DatabaseManager); LCIE --> Logger

            SyncSvc --> Parser; SyncSvc --> EmbedSvc; SyncSvc --> VectorIdx; SyncSvc --> DBMgr; SyncSvc --> Logger

            ToolReg -- Registers --> Tools(FileReaderTool, etc); ToolReg --> Logger
            Tools --> Logger

            subgraph Utils (src/magecode/utils)
                Logger(Logger); Errors(Custom Errors)
            end
        end

        UI --> Ext
        CP --> Init
    ```

6.  **Final Integration Check:**
    - **Action:** Use `git status` and `git diff` to meticulously verify that no files outside `src/magecode/` have been modified, _except_ for the allowed integration points (`extension.ts`, `src/core/providers/cline/ClineProvider.ts`).

**Phase 4: Testing & Completion**

7.  **Testing:**
    - **Action:** Review existing unit and integration tests (`src/magecode/tests/`, `**/__tests__/`). Improve clarity and add tests for areas with low coverage.
    - **Action:** Write specific tests for the new error handling paths (e.g., mock functions to throw errors and assert that they are caught, logged, and handled correctly).
    - **Action:** Perform thorough manual testing of the end-to-end MageCode flow: invoke commands, trigger file changes (save, delete, rename), observe the "MageCode" output channel, check for expected behavior and error messages. Try edge cases and invalid inputs.
    - **Action:** Run the complete automated test suite (`npm test` or equivalent).
    - **Action:** Iterate: Fix any bugs or test failures. Repeat testing until all tests pass and manual testing indicates stability.
