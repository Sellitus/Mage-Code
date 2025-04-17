Okay, here is a sequential series of user stories designed to implement the MageCode Agent Mode according to the provided design document, adhering strictly to the isolation and minimal modification constraints. Each story includes a step-by-step guide ending with the required testing steps.

---

**Story 1: Foundation - MageCode Directory Structure, Configuration, and Mode Dispatch**

- **Goal:** Establish the basic file structure for MageCode, add the configuration setting to enable/disable it, and implement the minimal dispatch logic in the two allowed existing files to route control based on the setting.
- **Benefit:** This creates the isolated environment for all new MageCode code and enables the core switching mechanism between original Roo-Code and the new MageCode mode, setting the foundation for all subsequent development.
- **Depends On:** None

- **Step-by-Step Guide:**
    1.  Create the main directory: `src/magecode/`.
    2.  Create subdirectories within `src/magecode/`: `config/`, `interfaces/`, `utils/`, `tests/`, `tests/unit/`, `tests/integration/`.
    3.  In `package.json` (**Existing File Modification 1 of 2**):
        - Locate the `contributes.configuration.properties` section for `mage-code`.
        - Add the `mage-code.magecode.enabled` boolean setting exactly as specified in section 2.2 of the design doc (default: `true`). **Make no other changes to this file.**
    4.  Create `src/magecode/config/settings.ts`:
        - Implement the `isMageCodeEnabled()` function as specified in section 2.2 to read the configuration setting.
        - Implement the `registerModeChangeListener()` function as specified in section 2.2 (the `handleModeChange` function can be a placeholder for now).
    5.  Create `src/magecode/initialize.ts`:
        - Implement a basic `initializeMageCode(context: vscode.ExtensionContext)` function (as shown in section 2.5). For now, it can just log that MageCode is initializing and register the mode change listener using the function from the previous step. Leave placeholders for initializing other services.
        - Implement placeholder functions `registerMageCodeCommands` and `registerMageCodeTools`.
    6.  In `extension.ts` (**Existing File Modification 2 of 2 - Part 1**):
        - At the beginning of the `activate` function, add the conditional import and call to `initializeMageCode` based on the `mage-code.magecode.enabled` setting, exactly as shown in section 2.5. **Make no other changes to the original activation logic in this file yet.**
    7.  Create `src/magecode/interfaces/index.ts`:
        - Define the basic `IAgent`, `IContextRetriever`, and `ILLMOrchestrator` interfaces as specified in section 2.3 (implementations will come later).
    8.  Create `src/magecode/factory.ts`:
        - Implement a placeholder `createMageCodeDependencies()` function that returns placeholder objects conforming (loosely for now) to the dependencies needed by the agent (e.g., return `{ contextRetriever: null, llmOrchestrator: null, toolRegistry: null }`). This will be filled in later stories.
    9.  In `src/providers/cline-provider/ClineProvider.ts` (**Existing File Modification 2 of 2 - Part 2**):
        - Add the `_createAgentDependencies` method exactly as specified in section 2.3, using `require` for conditional loading. This method should call the new `createMageCodeDependencies` factory from `src/magecode/factory.ts` if MageCode is enabled, otherwise call the original dependency creation logic (ensure you identify or create `this._originalCreateDependencies()`).
        - Add the `_dispatchAgentTask` method exactly as specified in section 2.3, using `require` for conditional loading. This method should instantiate and use a placeholder `MageCodeAgent` (create a skeleton file `src/magecode/agent.ts` with a basic class structure conforming to `IAgent`) if MageCode is enabled, otherwise call the original task execution logic (ensure you identify or create `this._originalRunTask(task)`).
    10. **Testing:**
        - Write unit tests for `isMageCodeEnabled()` ensuring it correctly reads the default and changed settings.
        - Write integration tests (or manual tests if easier initially) to verify:
            - The extension activates without error in both `magecode.enabled: true` and `magecode.enabled: false` states.
            - When enabled, the "MageCode mode initialized successfully" log appears.
            - When enabled, attempting a task hits the (placeholder) `MageCodeAgent` logic.
            - When disabled, attempting a task hits the original Roo-Code agent logic.
        - Run all tests (unit and integration).
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 2: LCIE - Parser Setup (Tree-sitter)**

- **Goal:** Integrate Tree-sitter for code parsing within the MageCode directory. Implement the basic `Parser` class capable of loading language grammars (WASM) and parsing files into ASTs, including basic error tolerance.
- **Benefit:** Enables MageCode to understand the structure of code files locally, which is the first step towards local code intelligence and context generation.
- **Depends On:** Story 1

- **Step-by-Step Guide:**
    1.  Add `tree-sitter` and necessary language grammar packages (e.g., `tree-sitter-javascript`, `tree-sitter-python`, `tree-sitter-typescript`) as dependencies _within the extension's main `package.json`_ (as these are needed at runtime).
    2.  Create `src/magecode/intelligence/` directory.
    3.  Create `src/magecode/intelligence/parser/` directory.
    4.  Create `src/magecode/assets/` directory and place necessary Tree-sitter WASM grammar files there (e.g., `tree-sitter-javascript.wasm`). Update build process if needed to include these assets.
    5.  Implement `src/magecode/intelligence/parser/index.ts` (or `parser.ts`):
        - Create the `Parser` class as outlined in section 3.1.
        - Implement logic to dynamically load WASM grammars based on detected file language (use a simple mapping or library for language detection). Cache initialized parsers per language.
        - Implement the `parseFile` method to read file content and use the appropriate Tree-sitter parser.
        - Implement basic error handling (`handleParsingError`) to return a partial AST or specific error structure if parsing fails, preventing crashes on syntax errors. Use placeholder `ErrorHandler` logic for now.
    6.  Create placeholder types/interfaces for `ParsedFile`, `CodeElement`, etc., in `src/magecode/interfaces/` or a dedicated `types.ts`.
    7.  **Testing:**
        - Write unit tests for the `Parser` class:
            - Verify correct language detection for common file types.
            - Test successful parsing of syntactically correct files in supported languages.
            - Test error handling for files with syntax errors (ensure it doesn't crash and returns an error indicator/partial result).
            - Test parsing of an empty file.
            - Test parsing of a very large file (check for performance bottlenecks, though optimization comes later).
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 3: LCIE - Storage Setup (SQLite & Basic Schema)**

- **Goal:** Set up SQLite database management within the MageCode environment. Define and create the initial database schema for storing code elements. Implement basic storage operations.
- **Benefit:** Provides persistent storage for the results of code analysis (AST nodes, elements), enabling efficient retrieval without re-parsing constantly. Establishes the `.magecode` workspace data directory.
- **Depends On:** Story 1

- **Step-by-Step Guide:**
    1.  Add `sqlite3` (or `better-sqlite3` for better performance/API) as a dependency. Note potential native module compilation requirements.
    2.  Create `src/magecode/intelligence/storage/` directory.
    3.  Implement `src/magecode/intelligence/storage/databaseManager.ts`:
        - Create the `DatabaseManager` class implementing `vscode.Disposable`.
        - Implement the `initialize` method to:
            - Determine the workspace root.
            - Create the `.magecode` directory if it doesn't exist.
            - Define the path for the database (`.magecode/intelligence.db`).
            - Open/create the SQLite database using the chosen library.
            - Implement a basic `runMigrations` function (can be simple initially).
        - Implement the initial schema creation within `runMigrations`:
            - Create the `code_elements` table as defined in section 4.2 (initially, you might skip `parent_id`, `metadata`, FTS, and relations tables - focus on `id`, `file_path`, `type`, `name`, `content`, `start_line`, `end_line`, `last_modified`).
            - Create basic indices on `file_path`.
        - Implement the `storeCodeElements` method (using transactions) to insert or replace rows in the `code_elements` table based on data extracted by the (future) element extraction logic.
        - Implement a basic `getCodeElementById` or similar retrieval method.
        - Implement the `dispose` method to close the database connection cleanly.
    4.  Update `src/magecode/initialize.ts`:
        - Instantiate `DatabaseManager` during `initializeMageCode`.
        - Call its `initialize` method.
        - Add the `DatabaseManager` instance to `context.subscriptions` for proper disposal.
    5.  **Testing:**
        - Write unit tests for `DatabaseManager`:
            - Test initialization creates the `.magecode` directory and `intelligence.db` file.
            - Test schema creation (verify tables and basic indices exist).
            - Test `storeCodeElements` correctly inserts and replaces data. Use transactions.
            - Test basic retrieval methods.
            - Test disposal closes the connection.
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 4: LCIE - Integrating Parsing and Storage**

- **Goal:** Connect the Parser (Story 2) with the Storage (Story 3). Implement logic to traverse the AST generated by the parser, extract meaningful code elements (functions, classes, variables), and store them in the SQLite database.
- **Benefit:** Populates the database with structured information about the codebase, making local intelligence tangible.
- **Depends On:** Story 2, Story 3

- **Step-by-Step Guide:**
    1.  Refine the `Parser` class (`src/magecode/intelligence/parser/index.ts`) or create a new `AstProcessor` class:
        - Implement the `extractCodeElements(parsedFile: ParsedFile): CodeElement[]` method.
        - Use Tree-sitter queries or tree traversal logic to identify key code structures (functions, classes, methods, interfaces, variables, imports etc.) within the AST.
        - For each identified element, extract relevant information: `id` (generate a unique ID, e.g., `filePath#name@startLine`), `file_path`, `type`, `name`, `content` (the source code span), `start_line`, `end_line`, `parent_id` (if extracting hierarchical info), `last_modified` timestamp.
    2.  Update `DatabaseManager` (`src/magecode/intelligence/storage/databaseManager.ts`):
        - Ensure the `code_elements` schema includes all fields needed (add `parent_id` if extracting hierarchy).
        - Add necessary indices (e.g., on `parent_id`, `type`).
    3.  Create a coordinating service, potentially within `src/magecode/intelligence/index.ts` or as part of the upcoming `SyncService`. For now, create a simple function `processAndStoreFile(filePath: string, parser: Parser, dbManager: DatabaseManager)`:
        - Takes a file path, parser instance, and dbManager instance.
        - Calls `parser.parseFile(filePath)`.
        - If parsing is successful, calls `parser.extractCodeElements(parsedFile)`.
        - Calls `dbManager.storeCodeElements(elements)`.
        - Include basic error handling.
    4.  **Testing:**
        - Write unit tests for the `extractCodeElements` logic:
            - Test with various code structures (functions, classes, nested elements, different languages).
            - Verify correct extraction of names, types, line numbers, content, and parent relationships (if implemented).
            - Test edge cases (empty files, files with only comments).
        - Write integration tests for `processAndStoreFile`:
            - Provide a test file path, parser, and initialized in-memory/temporary DB.
            - Verify that after calling the function, the expected code elements are present in the database.
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 5: LCIE - Vector Index Setup (FAISS/Voy)**

- **Goal:** Integrate a vector search library (FAISS or Voy, with platform conditional logic). Implement the `VectorIndex` class for initializing, adding vectors (with ID mapping), and performing similarity searches.
- **Benefit:** Provides the mechanism for semantic search over code elements, crucial for finding relevant context based on meaning rather than just keywords.
- **Depends On:** Story 1

- **Step-by-Step Guide:**
    1.  Choose vector libraries. Since FAISS might involve native builds, consider `voy-search` (WASM-based) as a potentially simpler cross-platform alternative or use conditional logic as per the design doc (Section 3.1 - Vector Index). Add the chosen library/libraries as dependencies.
    2.  Create `src/magecode/intelligence/vector/` directory (or similar, adjust if placing within `storage/`).
    3.  Implement `src/magecode/intelligence/vector/vectorIndex.ts`:
        - Create the `VectorIndex` class implementing `vscode.Disposable`.
        - Implement the `initialize` method:
            - Determine workspace path for storing index files (`.magecode/vectors/`). Create the directory.
            - Conditionally initialize FAISS or Voy based on `process.platform` or chosen strategy. Handle loading/saving the index from/to disk.
            - Implement loading/saving the `mapping` (Vector ID to element ID) to a separate file (e.g., `mapping.json`) within the vector directory. Use debouncing for saving the mapping to avoid excessive writes.
        - Implement `addEmbeddings(embeddings: {id: string, vector: number[]}[]): Promise<void>`:
            - Takes an array of code element IDs and their corresponding vectors.
            - Generates sequential numeric IDs for the vector library.
            - Adds the vectors and numeric IDs to the index.
            - Updates the internal `mapping` (numeric ID -> element ID).
            - Calls the debounced save function for the mapping.
        - Implement `search(vector: number[], k: number): Promise<{id: string, score: number}[]>`:
            - Performs the similarity search using the underlying library.
            - Uses the internal `mapping` to translate the numeric results back to the original code element IDs.
            - Returns the list of element IDs and their similarity scores.
        - Implement the `dispose` method (if needed by the library, e.g., to release resources or ensure data is saved).
    4.  Update `src/magecode/initialize.ts`:
        - Instantiate `VectorIndex` during `initializeMageCode`.
        - Call its `initialize` method.
        - Add the `VectorIndex` instance to `context.subscriptions`.
    5.  **Testing:**
        - Write unit tests for `VectorIndex`:
            - Test initialization creates the directory and handles index/mapping loading/saving (mock file system operations).
            - Test adding embeddings updates the index and mapping correctly.
            - Test searching with dummy vectors returns expected (mapped) IDs and scores.
            - Test searching with an empty index.
            - Test persistence (initialize, add, dispose, initialize again, search – should find previously added items).
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 6: LCIE - Embedding Service (ONNX Runtime)**

- **Goal:** Implement an `EmbeddingService` using ONNX Runtime (ORT) to load a pre-trained sentence transformer model and generate vector embeddings for text snippets (code element content).
- **Benefit:** Enables the conversion of code text into numerical vectors that capture semantic meaning, powering the vector search capability.
- **Depends On:** Story 1

- **Step-by-Step Guide:**
    1.  Add `onnxruntime-node` as a dependency.
    2.  Obtain a suitable pre-trained sentence transformer model in ONNX format (e.g., from Hugging Face Hub, ensuring it matches the expected dimension, like 384). Place it in `src/magecode/assets/models/`.
    3.  Obtain the corresponding tokenizer configuration (`tokenizer.json`, `vocab.txt` etc.) for the chosen model. Place these in `src/magecode/assets/models/`. Add a tokenizer library (e.g., `tokenizers` by Hugging Face or a simpler one).
    4.  Create `src/magecode/intelligence/embedding/` directory.
    5.  Implement `src/magecode/intelligence/embedding/embeddingService.ts`:
        - Create the `EmbeddingService` class.
        - Implement an `initialize` method:
            - Load the ONNX model using `onnxruntime-node`. Configure session options for performance if needed (e.g., execution providers, threading).
            - Load the tokenizer.
        - Implement `generateEmbeddings(texts: string[]): Promise<number[][]>`:
            - Takes an array of text strings.
            - Uses the loaded tokenizer to convert texts into model input format (input IDs, attention mask). Handle padding and truncation.
            - Runs inference using the loaded ONNX session.
            - Processes the model output (e.g., pooling strategies like mean pooling on top of last hidden states) to get a single vector per input text. Ensure vectors are normalized if required by the vector index/similarity metric.
            - Returns the array of embedding vectors.
    6.  Update `src/magecode/initialize.ts`:
        - Instantiate `EmbeddingService` during `initializeMageCode`.
        - Call its `initialize` method.
        - (No need to add to subscriptions unless it holds closable resources).
    7.  **Testing:**
        - Write unit tests for `EmbeddingService`:
            - Test initialization loads the model and tokenizer without errors (mock ORT and tokenizer loading if needed).
            - Test `generateEmbeddings` with sample texts:
                - Verify the output is an array of arrays of numbers.
                - Verify the dimensions of the output vectors match the model's expected output dimension.
                - Verify that similar inputs produce somewhat similar vectors (requires a real model or mocked inference producing consistent results). Check vector normalization if applicable.
                - Test with an empty input array.
                - Test with a large batch of inputs.
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 7: LCIE - Sync Service (File Watching & Processing Pipeline)**

- **Goal:** Implement the `SyncService` to monitor workspace file changes (creations, updates, deletions) using VS Code's file watcher API. Trigger the parsing, element extraction, embedding generation, and storage/indexing pipeline for changed files. Implement basic queuing and incremental processing.
- **Benefit:** Keeps the local code intelligence database and vector index up-to-date with the user's codebase in near real-time, ensuring context retrieval is accurate.
- **Depends On:** Story 4, Story 5, Story 6

- **Step-by-Step Guide:**
    1.  Create `src/magecode/intelligence/sync/` directory.
    2.  Implement `src/magecode/intelligence/sync/syncService.ts`:
        - Create the `SyncService` class implementing `vscode.Disposable`.
        - Inject dependencies: `Parser`, `DatabaseManager`, `VectorIndex`, `EmbeddingService`.
        - Implement an `initialize` method:
            - Set up VS Code file watchers (`vscode.workspace.createFileSystemWatcher`) for relevant file patterns in the workspace (e.g., `**/*.{js,ts,py,java,etc.}`). Consider `.gitignore` rules.
            - Register handlers for `onDidCreate`, `onDidChange`, `onDidDelete`.
            - Implement a queue (e.g., a simple array or a more robust queue library) to manage pending file processing tasks (`{ type: 'add' | 'update' | 'delete', path: string }`).
            - Implement logic for an initial workspace scan on startup to process all relevant files. Use techniques like batching and yielding (`setTimeout(resolve, 0)`) to avoid blocking the extension host during the initial scan.
        - Implement handler methods (`handleFileCreated`, `handleFileChanged`, `handleFileDeleted`):
            - These methods should add tasks to the processing queue. Debounce or batch updates for the same file happening in quick succession.
        - Implement a processing loop (`startProcessing` or similar, as shown in section 3.1):
            - Works through the queue. Use a flag (`isProcessing`) to prevent concurrent runs.
            - For `add`/`update`:
                - Call `parser.parseFile`.
                - Call `parser.extractCodeElements`.
                - Call `dbManager.storeCodeElements`.
                - Call `embeddingService.generateEmbeddings` for the extracted elements' content.
                - Call `vectorIndex.addEmbeddings` (handle updates in the vector index, potentially by removing old vectors for the file first).
            - For `delete`:
                - Implement methods in `DatabaseManager` and `VectorIndex` to remove all data associated with the deleted file path. Call these methods.
            - Include error handling for each step.
            - Yield periodically within the loop if processing many files.
        - Implement the `dispose` method to dispose of file watchers.
    3.  Update `src/magecode/initialize.ts`:
        - Instantiate `SyncService` with its dependencies.
        - Call its `initialize` method.
        - Add the `SyncService` instance to `context.subscriptions`.
    4.  **Testing:**
        - Write unit tests for `SyncService`:
            - Mock file watcher events and verify that correct tasks are added to the queue.
            - Test the processing loop logic: Mock dependencies (`Parser`, `DB`, `VectorIndex`, `EmbeddingService`) and verify they are called with correct arguments for add, update, and delete tasks.
            - Test debouncing/batching logic for file changes.
            - Test initial scan logic (mock `vscode.workspace.findFiles`).
        - Write integration tests (can be complex, may require a test workspace):
            - Initialize the full LCIE stack (`Parser`, `DB`, `VectorIndex`, `Embeddings`, `SyncService`).
            - Simulate file creation: Verify elements are parsed, stored in DB, and embeddings are added to VectorIndex.
            - Simulate file update: Verify elements/embeddings are updated.
            - Simulate file deletion: Verify elements/embeddings are removed.
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 8: Relevancy - Vector Retriever**

- **Goal:** Implement the `VectorRetriever` component of the Relevancy Engine. This component uses the `EmbeddingService` to embed the user's query and the `VectorIndex` to find semantically similar code elements.
- **Benefit:** Provides the core semantic search capability, enabling MageCode to find relevant code snippets based on the meaning of the user's request.
- **Depends On:** Story 5, Story 6, Story 3 (for retrieving full element details)

- **Step-by-Step Guide:**
    1.  Create `src/magecode/relevancy/` directory.
    2.  Create `src/magecode/relevancy/retrievers/` directory.
    3.  Define retrieval interfaces (e.g., `IRetriever`, `RetrievedItem`) in `src/magecode/interfaces/` or `src/magecode/relevancy/interfaces.ts`.
    4.  Implement `src/magecode/relevancy/retrievers/vectorRetriever.ts`:
        - Create the `VectorRetriever` class implementing `IRetriever`.
        - Inject dependencies: `EmbeddingService`, `VectorIndex`, `DatabaseManager`.
        - Implement the `retrieve(query: string, options: RetrievalOptions): Promise<RetrievedItem[]>` method:
            - Generate embedding for the input `query` using `embeddingService.generateEmbeddings([query])`.
            - Search the `vectorIndex` using the query embedding and `options.limit`.
            - For each result ID from the vector index:
                - Fetch the full code element details (content, file path, lines) from `databaseManager.getCodeElementById(result.id)`. Handle cases where an element might be in the vector index but missing from the DB (though sync should prevent this).
                - Format the result as a `RetrievedItem` including the score, source ('vector'), and other details.
            - Return the list of `RetrievedItem`.
    5.  **Testing:**
        - Write unit tests for `VectorRetriever`:
            - Mock dependencies (`EmbeddingService`, `VectorIndex`, `DatabaseManager`).
            - Provide a test query and options.
            - Verify `embeddingService.generateEmbeddings` is called with the query.
            - Verify `vectorIndex.search` is called with the generated embedding and limit.
            - Simulate `vectorIndex.search` returning IDs and scores.
            - Verify `databaseManager.getCodeElementById` is called for each ID.
            - Simulate `databaseManager` returning element data.
            - Verify the final output `RetrievedItem[]` has the correct structure, content, scores, and source ('vector').
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 9: Relevancy - Graph Retriever & Relations Schema**

- **Goal:** Enhance the database schema to store relationships between code elements. Implement the `GraphRetriever` to find relevant code based on code structure relationships (e.g., calls, imports, definitions) starting from the user's cursor position.
- **Benefit:** Adds contextually relevant code based on direct code connections, complementing semantic search by finding code that works _together_ with the code the user is looking at.
- **Depends On:** Story 4 (AST processing), Story 3 (DB Manager)

- **Step-by-Step Guide:**
    1.  Update `DatabaseManager` (`src/magecode/intelligence/storage/databaseManager.ts`):
        - Modify `runMigrations` (or add a new migration) to create the `element_relations` table as defined in section 4.2. Include indices on `source_id`, `target_id`, and `relation_type`.
        - Implement `storeElementRelations(relations: ElementRelation[])` to insert/replace relationships.
        - Implement `getCodeElementAtPosition(filePath: string, line: number): Promise<CodeElement | null>` to find the element containing the cursor.
        - Implement `findRelatedElements(elementId: string, limit: number, relationTypes: string[]): Promise<CodeElement[]>`:
            - Performs graph traversal (e.g., BFS or DFS up to a certain depth) starting from `elementId`.
            - Uses the `element_relations` table to find connected elements matching the specified `relationTypes`.
            - Retrieves the full `CodeElement` data for related elements.
            - Calculates a simple score based on distance (e.g., `1 / distance`).
            - Returns the list of related elements, limited by `limit`.
    2.  Update the AST processing logic (from Story 4, in `Parser` or `AstProcessor`):
        - Enhance `extractCodeElements` to also identify and extract relationships (e.g., function calls, imports, class inheritance) between the elements it finds. This often requires more sophisticated AST analysis and potentially multiple passes or resolving symbols.
        - Return these relationships alongside the elements.
    3.  Update the coordinating service (`processAndStoreFile` or `SyncService`):
        - After storing elements, call `dbManager.storeElementRelations` with the extracted relations.
    4.  Implement `src/magecode/relevancy/retrievers/graphRetriever.ts`:
        - Create the `GraphRetriever` class implementing `IRetriever`.
        - Inject dependency: `DatabaseManager`.
        - Implement the `retrieve(query: string, options: RetrievalOptions): Promise<RetrievedItem[]>` method:
            - Check if `options.cursorFile` and `options.cursorLine` are provided. If not, return empty array.
            - Call `databaseManager.getCodeElementAtPosition` to find the element at the cursor.
            - If an element is found, call `databaseManager.findRelatedElements` with the element's ID, `options.limit`, and desired `relationTypes`.
            - Format the results as `RetrievedItem[]`, setting source to 'graph' and using the calculated distance-based score.
            - Return the list.
    5.  **Testing:**
        - Write unit tests for the new `DatabaseManager` methods (`storeElementRelations`, `getCodeElementAtPosition`, `findRelatedElements`). Mock DB calls to test traversal logic.
        - Write unit tests for the enhanced AST processing to verify relation extraction.
        - Write unit tests for `GraphRetriever`:
            - Mock `DatabaseManager`.
            - Test cases with and without cursor info.
            - Simulate `getCodeElementAtPosition` finding/not finding an element.
            - Simulate `findRelatedElements` returning related elements.
            - Verify the output format, source ('graph'), and scores.
        - Write integration tests: Process a file with known relationships (e.g., function calls), verify relations are stored, then use `GraphRetriever` with a cursor position and check if expected related elements are returned.
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 10: Relevancy - Hybrid Scoring and Engine Facade**

- **Goal:** Implement the `HybridScorer` to combine and rank results from multiple retrievers (initially Vector and Graph). Create the main `RelevancyEngine` facade that orchestrates the different retrievers and the scorer.
- **Benefit:** Provides a unified and ranked list of the most relevant code snippets by intelligently combining semantic and structural relevance signals.
- **Depends On:** Story 8, Story 9

- **Step-by-Step Guide:**
    1.  Create `src/magecode/relevancy/scoring/` directory.
    2.  Implement `src/magecode/relevancy/scoring/hybridScorer.ts`:
        - Create the `HybridScorer` class.
        - Define weights for different sources (`vector`, `graph`, maybe `lexical` later) as shown in section 3.2.
        - Implement placeholder scorer logic (e.g., `normalize`, `score`) for each source type (Vector, Graph) and potentially other factors mentioned (Proximity, Recency - can be simple stubs initially). The main goal now is combining weighted scores.
        - Implement the main `scoreItems(items: RetrievedItem[], query: string, options: ScoringOptions): ScoredItem[]` method:
            - Applies normalization and weighting based on `item.source`.
            - Implements logic to remove duplicates (e.g., based on element ID), potentially combining scores if an element is found by multiple retrievers.
            - Sorts the final list by the combined score in descending order.
    3.  Implement `src/magecode/relevancy/index.ts`:
        - Create the `RelevancyEngine` class.
        - Inject dependencies: Instantiated retrievers (`VectorRetriever`, `GraphRetriever`) and the `HybridScorer`.
        - Implement `findRelevantCode(query: string, options: RetrievalOptions): Promise<ScoredItem[]>`:
            - Call `retrieve` on all registered retrievers (`vectorRetriever`, `graphRetriever`) in parallel (`Promise.all`). Pass the `query` and `options` to each.
            - Collect all results into a single `RetrievedItem[]` list.
            - Pass the combined list, query, and options to `hybridScorer.scoreItems`.
            - Return the final ranked list of `ScoredItem`.
    4.  Update `src/magecode/initialize.ts`:
        - Instantiate `VectorRetriever`, `GraphRetriever`, `HybridScorer`, and `RelevancyEngine` with their dependencies.
        - (No need to add to subscriptions unless they hold resources).
    5.  Update `src/magecode/factory.ts`:
        - Modify `createMageCodeDependencies` to return the actual initialized `RelevancyEngine` instance as the `contextRetriever`. (Need to manage singleton instances or pass initialized instances from `initialize.ts`).
    6.  **Testing:**
        - Write unit tests for `HybridScorer`:
            - Test score normalization and weighting logic.
            - Test duplicate removal and score combination.
            - Test sorting.
            - Test with items from different sources.
        - Write unit tests for `RelevancyEngine`:
            - Mock retrievers and the scorer.
            - Verify that retrievers are called in parallel.
            - Verify that results are combined and passed to the scorer.
            - Verify that the scorer's output is returned.
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

_Self-Correction: Splitting MMO into multiple stories for clarity._

**Story 11: MMO - Basic Structure & Cloud Tier**

- **Goal:** Implement the basic structure for the `MultiModelOrchestrator` (MMO) and the `CloudModelTier`. This tier will initially just wrap the existing mechanism for calling the primary cloud LLM API used by Roo-Code.
- **Benefit:** Establishes the framework for handling LLM requests within MageCode, allowing subsequent stories to add local models and routing, while ensuring MageCode can already leverage the existing cloud LLM.
- **Depends On:** Story 1

- **Step-by-Step Guide:**
    1.  Create `src/magecode/orchestration/` directory.
    2.  Create `src/magecode/orchestration/tiers/` directory.
    3.  Define interfaces `IModelTier`, `ModelRequestOptions`, `ModelResponse` in `src/magecode/interfaces/` or `src/magecode/orchestration/interfaces.ts`.
    4.  Implement `src/magecode/orchestration/tiers/cloudModelTier.ts`:
        - Create the `CloudModelTier` class implementing `IModelTier`.
        - Inject or locate the existing Roo-Code service responsible for making LLM API calls. Use an adapter if necessary to avoid modifying the original service (`src/magecode/utils/adapters/`).
        - Implement `makeRequest(prompt: string, options: ModelRequestOptions): Promise<ModelResponse>`:
            - Calls the existing Roo-Code LLM service using the provided prompt and options (map options as needed).
            - Formats the response from the original service into the `ModelResponse` structure (including text, token usage estimation if available, model type 'cloud', latency).
    5.  Implement `src/magecode/orchestration/index.ts`:
        - Create the `MultiModelOrchestrator` class implementing `ILLMOrchestrator`.
        - Inject the `CloudModelTier`. (Leave placeholders for Local Tier and Router).
        - Implement `makeApiRequest(prompt: string, options: RequestOptions): Promise<LLMResponse>`:
            - For now, _always_ route to the `cloudTier`. Call `cloudTier.makeRequest`.
            - Format the `ModelResponse` into the final `LLMResponse` (this might be the same structure initially).
            - Add basic error handling. (Skip caching and routing logic for now).
    6.  Update `src/magecode/initialize.ts`:
        - Instantiate `CloudModelTier` and `MultiModelOrchestrator`. Pass the cloud tier instance to the orchestrator.
    7.  Update `src/magecode/factory.ts`:
        - Modify `createMageCodeDependencies` to return the actual initialized `MultiModelOrchestrator` instance as the `llmOrchestrator`.
    8.  **Testing:**
        - Write unit tests for `CloudModelTier`:
            - Mock the original Roo-Code LLM service.
            - Verify `makeRequest` calls the original service with correct parameters.
            - Verify it correctly formats the response into `ModelResponse`.
        - Write unit tests for `MultiModelOrchestrator`:
            - Mock the `CloudModelTier`.
            - Verify `makeApiRequest` calls the `cloudTier.makeRequest`.
            - Verify it returns the formatted response.
        - Write integration tests (if feasible without hitting real APIs excessively):
            - Call `MultiModelOrchestrator.makeApiRequest` and ensure it successfully routes through the `CloudModelTier` to the underlying (potentially mocked) Roo-Code LLM service.
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 12: MMO - Local Tier (ONNX Runtime)**

- **Goal:** Implement the `LocalModelTier` using ONNX Runtime to load and run a small, local LLM for simple tasks.
- **Benefit:** Enables on-device LLM inference, reducing latency and API costs for suitable tasks, contributing significantly to token efficiency goals.
- **Depends On:** Story 1, Story 11 (MMO structure)

- **Step-by-Step Guide:**
    1.  Add `onnxruntime-node` (if not already added for embeddings) and a suitable tokenizer library as dependencies.
    2.  Obtain a small, instruction-tuned LLM in ONNX format (e.g., Phi-2, TinyLlama variant optimized for CPU inference) and its tokenizer. Place these in `src/magecode/assets/models/` (e.g., `tinyllm-1b.onnx`, `tokenizer.json`).
    3.  Implement `src/magecode/orchestration/tiers/localModelTier.ts`:
        - Create the `LocalModelTier` class implementing `IModelTier`.
        - Implement an `initialize(extensionPath: string)` method:
            - Load the local ONNX LLM model using ORT, applying CPU-specific optimizations (execution provider, threading, optimization levels as per section 3.3).
            - Load the associated tokenizer.
            - Set an `initialized` flag.
        - Implement `makeRequest(prompt: string, options: ModelRequestOptions): Promise<ModelResponse>`:
            - Check if initialized.
            - Tokenize the input prompt using the loaded tokenizer. Handle context length limits (throw error or truncate).
            - Run inference using the ORT session (`run` or specific generation methods if available via wrappers). Pass generation parameters like `maxTokens`, `temperature`, `topP` from options.
            - Decode the output tokens back into text.
            - Calculate or estimate token usage and latency.
            - Format the result as a `ModelResponse` with `modelType: 'local'`.
            - Include robust error handling for inference failures.
    4.  Update `src/magecode/initialize.ts`:
        - Instantiate `LocalModelTier`.
        - Call its `initialize` method, passing `context.extensionPath`.
        - Inject the initialized `LocalModelTier` into the `MultiModelOrchestrator`.
    5.  **Testing:**
        - Write unit tests for `LocalModelTier`:
            - Test initialization loads model/tokenizer (mock ORT/tokenizer).
            - Test `makeRequest`:
                - Mock ORT session `run`.
                - Verify tokenization, inference call parameters, decoding.
                - Verify output formatting (`ModelResponse`).
                - Test handling of input exceeding context length.
                - Test error handling during inference.
        - Write integration tests (can be slow):
            - Initialize the `LocalModelTier`.
            - Send a simple prompt and verify a coherent (though maybe basic) text response is generated without errors. Check `modelType` is 'local'.
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 13: MMO - Routing Logic & Orchestration**

- **Goal:** Implement the `ModelRouter` and integrate routing logic into the `MultiModelOrchestrator` to choose between the Local and Cloud tiers based on estimated task complexity, requirements, and user preference. Implement caching.
- **Benefit:** Optimizes LLM usage by directing simple tasks locally and complex tasks to the more capable cloud models, balancing cost, latency, and capability. Adds caching for further cost/latency reduction.
- **Depends On:** Story 11, Story 12

- **Step-by-Step Guide:**
    1.  Implement `src/magecode/orchestration/router.ts`:
        - Create the `ModelRouter` class.
        - Implement a placeholder `TaskClassifier` or simple heuristics within the router for now (as per section 3.3). The logic can initially be basic: maybe route based on prompt length or a keyword in `options.taskType`.
        - Implement `routeRequest(task: TaskType, prompt: string, options: RouterOptions): Promise<ModelTier>`:
            - Applies the classification/heuristics.
            - Considers user preference (`mage-code.magecode.modelPreference` setting - add this setting similar to Story 1).
            - Returns `ModelTier.LOCAL` or `ModelTier.CLOUD`.
    2.  Create `src/magecode/orchestration/prompt/` directory and implement a basic `PromptService` (`promptService.ts`) with a `formatPrompt` method that (for now) just returns the original prompt, but provides the structure for tier-specific formatting later.
    3.  Update `src/magecode/orchestration/index.ts` (`MultiModelOrchestrator`):
        - Inject `ModelRouter` and `PromptService`.
        - Add an LRU Cache (`lru-cache` package) instance for caching responses.
        - Modify `makeApiRequest`:
            - Implement cache key generation (`getCacheKey`).
            - Check the cache before proceeding (handle `options.skipCache`).
            - Call `router.routeRequest` to determine the target tier (`ModelTier.LOCAL` or `ModelTier.CLOUD`).
            - Call `promptService.formatPrompt` based on the chosen tier.
            - Call the `makeRequest` method of the _chosen_ tier (`localTier` or `cloudTier`).
            - Store the successful response in the cache (handle `options.cacheResponse`).
            - Implement the fallback logic: if the local tier fails, retry with the cloud tier (if `options.allowFallback` is not false).
    4.  Update `src/magecode/initialize.ts`:
        - Instantiate `ModelRouter`, `PromptService`.
        - Inject them into `MultiModelOrchestrator`.
    5.  Add the `mage-code.magecode.modelPreference` setting to `package.json` as defined in section 4.5. Update `settings.ts` to read it if needed by the router.
    6.  **Testing:**
        - Write unit tests for `ModelRouter`: Test routing logic under different conditions (prompt length, task type, user preference).
        - Write unit tests for `PromptService` (basic pass-through for now).
        - Write unit tests for `MultiModelOrchestrator`:
            - Test cache check (hit/miss).
            - Test routing logic (mock router, verify correct tier is called).
            - Test prompt formatting call.
            - Test cache storage.
            - Test fallback logic (mock local tier failure, verify cloud tier is called).
        - Write integration tests:
            - Send prompts designed to trigger local vs cloud routes and verify the `modelType` in the response.
            - Send the same prompt twice and verify the second response is faster (cache hit, may need timing or specific logging).
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 14: Tooling - Registry & Basic File Reader Tool**

- **Goal:** Implement the `ToolRegistry` for managing agent tools and create a basic but essential `FileReader` tool that allows the agent to read files from the workspace securely.
- **Benefit:** Provides the mechanism for the agent to interact with the user's environment safely and enables a fundamental capability (reading files) required for many coding tasks.
- **Depends On:** Story 1

- **Step-by-Step Guide:**
    1.  Create `src/magecode/tools/` directory.
    2.  Define the `Tool` interface and `ToolDefinition` type in `src/magecode/interfaces/` or `src/magecode/tools/interfaces.ts`. Include `name`, `description`, `inputSchema`, and `execute` method.
    3.  Implement `src/magecode/tools/toolRegistry.ts`:
        - Create the `ToolRegistry` class.
        - Implement `registerTool(tool: Tool)`. Store tools in a `Map`. (Skip the `vscode.lm.registerTool` part for now, as it depends on specific VS Code LM APIs which might evolve or not be the primary interaction mode).
        - Implement `getTool(name: string)`, `hasTool(name: string)`, `getAllTools(): ToolDefinition[]`.
    4.  Implement `src/magecode/tools/fileReader.ts`:
        - Create the `FileReader` class implementing `Tool`.
        - Define `name`, `description`, and `inputSchema` exactly as in section 3.5.
        - Implement the `execute(args: {path: string}): Promise<string>` method:
            - Perform workspace path validation and security checks (ensure path is relative and within workspace root) as shown in section 3.5.
            - Use Node.js `fs.promises.readFile` to read the file content.
            - Return the content or an error message string.
    5.  Update `src/magecode/initialize.ts`:
        - Instantiate `ToolRegistry`.
        - Instantiate `FileReader` and register it with the registry: `toolRegistry.registerTool(new FileReader())`.
        - Make the `ToolRegistry` instance available to the agent (e.g., via the factory).
    6.  Update `src/magecode/factory.ts`:
        - Modify `createMageCodeDependencies` to return the actual initialized `ToolRegistry` instance.
    7.  **Testing:**
        - Write unit tests for `ToolRegistry`: Test registering, getting, checking existence, and listing tools.
        - Write unit tests for `FileReader`:
            - Test `execute` with valid relative paths within a mocked workspace. Verify correct file content is returned.
            - Test security checks: paths outside workspace, absolute paths, `../` traversals should fail.
            - Test reading a non-existent file.
            - Test reading an empty file.
        - Write integration tests:
            - Create temporary files in a test workspace directory.
            - Use the `FileReader` tool (obtained via registry) to read them and verify content.
            - Test edge cases (non-existent files, restricted paths) within the integration setup.
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 15: AEE - Core Agent Logic, Context Retrieval, and Planning**

- **Goal:** Implement the core structure of the `MageCodeAgent`, including initializing context, retrieving context using the `RelevancyEngine`, and making an initial planning request to the `MultiModelOrchestrator`.
- **Benefit:** Creates the main execution flow for MageCode tasks, enabling the agent to understand the user's request in the context of their code and formulate a high-level plan.
- **Depends On:** Story 1 (Agent skeleton), Story 10 (RelevancyEngine), Story 13 (MMO), Story 14 (ToolRegistry available via factory)

- **Step-by-Step Guide:**
    1.  Flesh out `src/magecode/agent.ts` (`MageCodeAgent` class):
        - Implement the constructor to accept and store dependencies (`contextRetriever`, `llmOrchestrator`, `toolRegistry`) obtained from the factory.
        - Create a simple `AgentContext` class (`src/magecode/agentContext.ts` or similar) to hold task state (input, retrieved context, plan, results, stop signal).
        - Implement the `runTask(task: TaskInput): Promise<TaskResult>` method (as outlined in section 3.4):
            - Set `isRunning` flag. Store task details.
            - Initialize `AgentContext`.
            - Implement progress reporting stubs (`reportProgress`).
            - Call `contextRetriever.getContext` (which is the `RelevancyEngine`) with the task query and options. Store the result in `AgentContext`.
            - Implement `planApproach(task: TaskInput)`:
                - Construct a planning prompt including the user query, retrieved context (summarized or selectively included), and available tools (from `toolRegistry.getAllTools()`).
                - Call `llmOrchestrator.makeApiRequest` with the planning prompt and appropriate options (`taskType: 'planning'`).
                - Implement basic `parsePlan` logic (can be very simple initially, e.g., assume the LLM returns a numbered list of steps). Store the parsed plan in `AgentContext`.
            - Call `planApproach`.
            - Implement a placeholder `executePlan(): Promise<string>` that just returns a message like "Plan execution not yet implemented."
            - Call `executePlan`.
            - Format and return the `TaskResult` (success or error).
            - Handle errors gracefully and reset `isRunning` in a `finally` block.
        - Implement the `stop()` method to set a flag in the `AgentContext`. Check this flag periodically in long-running operations (like loops in future execution steps).
    2.  Ensure `TaskInput` and `TaskResult` types are defined appropriately.
    3.  **Testing:**
        - Write unit tests for `AgentContext`.
        - Write unit tests for `MageCodeAgent`:
            - Mock dependencies (`contextRetriever`, `llmOrchestrator`, `toolRegistry`).
            - Test `runTask` flow:
                - Verify context retrieval is called.
                - Simulate context retriever returning data.
                - Verify planning prompt construction.
                - Verify `llmOrchestrator` is called for planning.
                - Simulate LLM returning a plan string.
                - Verify plan parsing logic.
                - Verify placeholder `executePlan` is called.
                - Verify correct `TaskResult` is returned on success/error.
            - Test `stop()` method sets the flag.
        - Write integration tests:
            - Trigger a task via the `ClineProvider` (using the dispatch logic from Story 1).
            - Ensure the `MageCodeAgent` runs, retrieves context (from potentially stubbed LCIE/Relevancy), calls the (mocked) LLM for planning, and returns a result. Focus on the flow, not necessarily the quality of the plan yet.
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 16: AEE - Plan Execution and Tool Use**

- **Goal:** Implement the `executePlan` logic within the `MageCodeAgent`. This includes iterating through plan steps, making LLM calls for step execution/reasoning, and executing tools requested by the LLM using the `ToolRegistry`.
- **Benefit:** Enables the agent to act on its plan, use tools to interact with the environment (like reading files), and generate code or answers based on the plan and tool results.
- **Depends On:** Story 14 (Tools), Story 15 (Agent Core & Planning)

- **Step-by-Step Guide:**
    1.  Refine the `parsePlan` logic in `MageCodeAgent` (or create a dedicated `PlanParser` class) to better identify not just steps, but also requested tool calls within steps (e.g., looking for structured JSON blocks or specific keywords indicating tool use like `[TOOL_CALL: readFile(path="...")]`). The expected format depends on the planning prompt.
    2.  Implement the `executePlan` method in `MageCodeAgent` (replacing the placeholder from Story 15):
        - Get the plan from `AgentContext`.
        - Loop through each step in the plan.
        - Report progress for the current step.
        - Check the stop flag from `AgentContext`.
        - Identify any tool calls requested in the current step description or structure (using the refined parsing).
        - For each identified tool call:
            - Parse the tool name and arguments.
            - Retrieve the tool from `toolRegistry.getTool(toolName)`.
            - Validate arguments against the tool's `inputSchema`.
            - Execute the tool: `const toolResult = await tool.execute(parsedArgs);`. Handle errors during tool execution.
            - Store the `toolResult` in `AgentContext`, possibly associating it with the current step or making it available for the next LLM call. Include the tool name and arguments used for context.
        - Construct the prompt for the step execution LLM call: Include the original query, the current step description, relevant context (code snippets, previous step results, recent tool results from `AgentContext`).
        - Call `llmOrchestrator.makeApiRequest` with the step execution prompt and options (`taskType: 'execution'`, appropriate system prompt).
        - Store the LLM's response for the step in `AgentContext`.
        - The result of the _last_ step is typically considered the final answer. Accumulate intermediate results if necessary based on the task.
        - Return the final result string.
    3.  Refine the `AgentContext` to store step results and tool results effectively.
    4.  **Testing:**
        - Write unit tests for the refined `parsePlan` logic to extract tool calls.
        - Write unit tests for `executePlan`:
            - Mock dependencies (`llmOrchestrator`, `toolRegistry`, tools).
            - Simulate a plan with multiple steps, some requiring tool calls.
            - Verify tool calls are identified and parsed correctly.
            - Verify `toolRegistry.getTool` is called.
            - Verify `tool.execute` is called with correct arguments.
            - Simulate tool results and verify they are stored/used in subsequent prompts.
            - Verify LLM calls are made for each step with appropriate prompts containing context/tool results.
            - Simulate LLM step responses.
            - Verify the final result is assembled correctly.
            - Test error handling during tool execution or LLM calls.
            - Test stop flag check during the loop.
        - Write integration tests:
            - Provide a task that requires reading a file (using the `FileReader` tool).
            - Ensure the agent generates a plan including the `readFile` tool call.
            - Verify the agent executes the tool, gets the file content, includes it in a subsequent LLM prompt, and generates a final result based on the file content. (May require careful prompt engineering or mocking LLM planning/execution responses initially).
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 17: Settings UI - Isolated MageCode Settings View**

- **Goal:** Create a dedicated, isolated webview panel for MageCode-specific settings, accessible via a separate command, without modifying the original Roo-Code settings UI.
- **Benefit:** Provides a user interface for configuring MageCode behavior (like model preference) in a way that fully respects the Zero-Touch/Isolation constraint.
- **Depends On:** Story 1, Story 13 (for settings like modelPreference)

- **Step-by-Step Guide:**
    1.  Create `src/magecode/webview-ui/` directory.
    2.  Choose a simple UI framework for the webview (e.g., plain HTML/JS, or include a minimal setup for React/Vue if preferred, ensuring build tools handle it). Add necessary dependencies (e.g., `@vscode/webview-ui-toolkit`).
    3.  Create the UI component(s) (e.g., `src/magecode/webview-ui/SettingsView.tsx` or `settingsView.html`/`.js`):
        - Build a simple form to display and modify MageCode settings (initially `mage-code.magecode.enabled` and `mage-code.magecode.modelPreference`).
        - Use the VS Code Webview UI Toolkit components for consistency.
        - Implement communication logic:
            - On load, request current settings from the extension host.
            - When a setting is changed, send a message to the extension host to update the configuration.
    4.  Create `src/magecode/settings/settingsViewProvider.ts` (or similar name):
        - Implement the `MageCodeSettingsView` class (similar to section 2.6).
        - Implement `getWebviewContent` to generate the HTML for the webview, including nonces for security and scripts for the UI logic.
        - Implement `handleMessage` to process messages from the webview:
            - Handle requests for current settings: Read from `vscode.workspace.getConfiguration('mage-code.magecode')`.
            - Handle requests to update settings: Use `config.update()` to save changes to the appropriate scope (e.g., `ConfigurationTarget.Global`).
    5.  Update `src/magecode/initialize.ts`:
        - In `registerMageCodeCommands`, register the `magecode.showSettings` command that creates and shows a new instance of `MageCodeSettingsView` (as shown in section 2.6).
    6.  Update `package.json` (**Existing File Modification - Allowed**):
        - Add the command contribution for `magecode.showSettings` under `contributes.commands`.
        - Optionally add a menu item (e.g., in the command palette) to trigger this command.
    7.  **Testing:**
        - Write unit tests for the message handling logic in `MageCodeSettingsView` (mock `vscode.window.createWebviewPanel`, `vscode.workspace.getConfiguration`, `config.update`).
        - Manual Testing:
            - Run the `magecode.showSettings` command. Verify the webview opens.
            - Verify the UI displays the current MageCode settings correctly.
            - Change settings in the UI. Verify the changes are reflected in the VS Code settings JSON and that the `onDidChangeConfiguration` listener (from Story 1) fires.
            - Close and reopen the settings view – verify it shows the updated values.
        - Run all tests (including manual).
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 18: Performance - Resource Governors & Background Processing**

- **Goal:** Implement resource governing mechanisms and ensure computationally intensive tasks (especially within LCIE SyncService) run in background worker threads or use strategies to avoid blocking the main extension host thread.
- **Benefit:** Improves extension responsiveness and stability, especially during initial codebase indexing or when dealing with large projects or frequent changes, by preventing heavy computations from freezing the UI.
- **Depends On:** Story 7 (SyncService), potentially others involving heavy computation.

- **Step-by-Step Guide:**
    1.  Refactor `SyncService` (`src/magecode/intelligence/sync/syncService.ts`) and potentially `Parser`, `EmbeddingService` to support background execution.
        - Option 1: Use Node.js `worker_threads`. Move the core logic of parsing, embedding, and potentially DB interaction (if using a worker-compatible library or message passing) into a separate worker script (`src/magecode/intelligence/sync/syncWorker.ts`). The main `SyncService` would manage a pool of workers and dispatch tasks (file paths) to them via messages.
        - Option 2: Use asynchronous iteration with yielding. Ensure the processing loop in `SyncService` (`startProcessing`) frequently yields control back to the event loop (`await new Promise(resolve => setTimeout(resolve, 0))`), especially between processing files or batches of files. This doesn't use true parallelism but prevents long blocking periods.
    2.  Implement a basic `ResourceGovernor` (`src/magecode/utils/resourceGovernor.ts`) as outlined in section 5.1:
        - Add logic to check system load (basic CPU/memory usage checks available in Node's `os` and `process` modules).
        - Implement methods to adjust parameters like concurrency limits (worker pool size or batch size) based on load. This can be simple initially (e.g., fixed limits based on CPU cores).
    3.  Integrate the `ResourceGovernor` into `SyncService`:
        - Use the governor to determine how many files to process concurrently (if using workers) or how large batches should be (if using yielding).
        - Periodically call the governor's adjustment logic.
    4.  Implement Lazy Initialization more formally for LCIE components (`Parser`, `DatabaseManager`, `VectorIndex`, `EmbeddingService`) if not already done, ensuring they only load models/data when first needed or in a staged background process after activation.
    5.  **Testing:**
        - Write unit tests for the `ResourceGovernor`'s adjustment logic (mock system load).
        - Write unit tests for the worker communication logic (if using `worker_threads`), mocking worker messages.
        - Write/adapt integration tests for `SyncService` to ensure processing still works correctly after refactoring for background execution/yielding.
        - Manual/Performance Testing:
            - Test on a large codebase. Monitor extension host CPU usage during initial indexing and file changes. Verify the UI remains responsive.
            - Observe if processing slows down/speeds up based on simulated system load (if governor adjustments are implemented).
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 19: Performance - Caching Strategies**

- **Goal:** Implement multi-level caching (memory and potentially persistent) for frequently accessed data or computationally expensive results, such as LLM responses, generated embeddings, or retrieved context snippets.
- **Benefit:** Reduces redundant computations and API calls, improving performance and further reducing token/API costs.
- **Depends On:** Story 13 (MMO caching started), Story 6 (Embeddings), Story 10 (Relevancy)

- **Step-by-Step Guide:**
    1.  Add `lru-cache` dependency if not already present.
    2.  Implement a generic `CacheManager` (`src/magecode/utils/cacheManager.ts`) or specific cache instances where needed. Consider if a persistent cache layer (e.g., using SQLite) is necessary beyond the memory cache already added to MMO. For simplicity, focus on enhancing memory caching first.
    3.  Refine MMO Caching (`src/magecode/orchestration/index.ts`):
        - Ensure the LRU cache size and TTL are configurable (potentially via settings).
        - Improve cache key generation (`getCacheKey`) to be more robust (consider all relevant options).
    4.  Add Caching to `EmbeddingService` (`src/magecode/intelligence/embedding/embeddingService.ts`):
        - Add an LRU cache (`Map` or `lru-cache`) to store embeddings keyed by the input text hash or the text itself (if short enough).
        - In `generateEmbeddings`, check the cache before performing tokenization and inference. Return cached result if available. Store new results in the cache.
    5.  Add Caching to `RelevancyEngine` / Retrievers (Optional but potentially useful):
        - Consider caching the results of `findRelevantCode` or individual retriever results for identical queries made in quick succession. Be cautious about cache invalidation here due to underlying code changes. A short TTL might be appropriate.
    6.  Implement Cache Invalidation:
        - Ensure the `SyncService` (Story 7) clears relevant caches when files change. For example:
            - When a file is updated/deleted, clear embedding cache entries related to that file.
            - Potentially clear relevancy/MMO cache entries that might have used context from the changed file (this can be complex; simpler might be to rely on TTL or clear broader caches).
    7.  **Testing:**
        - Write unit tests for any new cache implementations or cache interaction logic added to services (e.g., embedding cache checks).
        - Write unit tests for cache invalidation logic triggered by the `SyncService`.
        - Write/adapt integration tests:
            - Call `generateEmbeddings` twice with the same text and verify faster return/cache hit via logging or timing.
            - Call `makeApiRequest` twice with the same prompt and verify cache hit.
            - Simulate a file change and verify that relevant caches are cleared (e.g., calling `generateEmbeddings` for content from the changed file now results in a cache miss).
        - Run all tests.
        - Fix any errors found. Repeat running tests and fixing until all tests pass.

---

**Story 20: Refinement, Error Handling, and Logging**

- **Goal:** Perform a pass over the entire MageCode implementation to refine logic, improve error handling, add comprehensive logging, and address any remaining TODOs or minor issues.
- **Benefit:** Increases the robustness, maintainability, and debuggability of the MageCode feature.
- **Depends On:** All previous stories.

- **Step-by-Step Guide:**
    1.  **Logging:**
        - Implement a dedicated logger utility (`src/magecode/utils/logging.ts`) that respects VS Code's output channels.
        - Add informative logs throughout the MageCode components (LCIE, Relevancy, MMO, Agent, Tools):
            - Initialization steps and timings.
            - File processing events (start, end, errors) in SyncService.
            - Cache hits/misses.
            - Model routing decisions in MMO.
            - Agent planning and step execution details.
            - Tool execution start, end, arguments, results/errors.
            - Significant errors encountered.
        - Ensure log levels are used appropriately (Info, Warn, Error, Debug).
    2.  **Error Handling:**
        - Review all `try...catch` blocks. Ensure errors are caught appropriately, logged meaningfully, and propagated or handled gracefully (e.g., returning an error state to the user/agent instead of crashing).
        - Add specific error types for different failure modes (e.g., `ParsingError`, `EmbeddingError`, `ToolExecutionError`).
        - Review handling of external dependencies (file system access, API calls, DB access, model inference) for potential failure points. Add timeouts where appropriate.
    3.  **Code Review & Refactoring:**
        - Review code for clarity, consistency, and adherence to the design document.
        - Refactor complex methods or classes.
        - Remove dead code or commented-out code.
        - Ensure all resources (`Disposable` items like DB connections, file watchers, potentially ORT sessions) are correctly managed and disposed of (check `context.subscriptions` usage).
    4.  **Configuration:**
        - Review all hardcoded values (timeouts, limits, thresholds) and consider making them configurable via settings if appropriate (e.g., add settings for cache sizes, processing limits under `mage-code.magecode.localProcessing` object - see Section 4.5). Update settings UI (Story 17) if new settings are added.
    5.  **Documentation:**
        - Add or update TSDoc comments for public classes and methods.
        - Add a README section within `src/magecode/` briefly explaining its architecture and purpose.
    6.  **Final Integration Check:**
        - Verify again that absolutely no modifications were made to original Roo-Code files _except_ the two designated integration points in `extension.ts` and `ClineProvider.ts`.
    7.  **Testing:**
        - Review existing tests for coverage and clarity. Add tests for specific error handling paths.
        - Perform thorough manual testing of the end-to-end MageCode experience: invoke various commands, edit files, switch branches (if VCS sync implemented), observe logs and performance. Try to break it!
        - Run all automated tests (unit, integration).
        - Fix any errors or refine based on testing feedback. Repeat running tests and fixing until all tests pass and manual testing feels stable.

---
