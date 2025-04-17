MageCode Implementation Plan (Post-Verification)
This plan outlines the steps to address the gaps identified during the verification of Stories 1-7.

Phase 1: Fix HybridScorer Logic & Tests (Highest Priority)
Correct HybridScorer.scoreItems Implementation:
File: src/magecode/relevancy/scoring/hybridScorer.ts
Action: Remove the hardcoded test logic within the scoreItems method.
Implement:
Calculate an initial score for each RetrievedItem based on its item.score and item.source, applying weights from options.weights (or DEFAULT_WEIGHTS).
Apply boost factors (proximity, recency) based on options.boost by calling the respective scorer methods (this.scorers.get(...)). Adjust the initial weighted score based on the boost.
Call this.removeDuplicates() on the list of items after initial scoring and boosting.
Sort the final, unique ScoredItem list based on finalScore in descending order.
Update hybridScorer.test.ts:
File: src/magecode/relevancy/scoring/**tests**/hybridScorer.test.ts
Action: Review and update existing tests to align with the corrected logic. Ensure they test:
Correct application of default and custom weights.
Correct application of proximity and recency boosts.
Correct handling and score combination for duplicate items.
Correct final sorting based on score.
Add: New test cases for edge scenarios if needed.
Phase 2: Implement Missing Unit Tests (Can be parallelized)
(Create .test.ts files in the corresponding **tests** or tests/unit/... directories)

settings.ts:
File: src/magecode/tests/unit/config/settings.test.ts
Coverage: isMageCodeEnabled, registerModeChangeListener. Mock vscode.workspace.getConfiguration and onDidChangeConfiguration.
DatabaseManager:
File: src/magecode/tests/unit/intelligence/storage/databaseManager.test.ts
Coverage: initialize (mock FS, workspace), runMigrations (mock DB exec), CRUD methods (storeCodeElements, getCodeElementById, getCodeElementsByFilePath, deleteCodeElementsByFilePath) (mock DB prepare/run/get/all), dispose. Use mocks for better-sqlite3.
MageParser:
File: src/magecode/tests/unit/intelligence/parser/mageParser.test.ts
Coverage: initialize (mock Parser.init), detectLanguage, loadLanguage (mock FS, Parser.Language.load), getParserForLanguage, parseFile (mock FS, dependencies, parser.parse), extractCodeElements (provide mock AST nodes, verify extracted elements/relations).
EmbeddingService:
File: src/magecode/tests/unit/intelligence/embedding/embeddingService.test.ts
Coverage: getInstance, initialize (mock FS, ORT, Tokenizer), generateEmbeddings (mock session/tokenizer, test caching), clearCache, clearCacheForFile, helper functions (meanPool, l2Normalize).
VectorIndex (Test against mocks first):
File: src/magecode/tests/unit/intelligence/vector/vectorIndex.test.ts
Coverage: Constructor, initialize (mock FS, mapping load, index init), mapping load/save (mock FS), addEmbeddings, search, removeEmbeddingsByFile (verify mapping logic against mocked index calls), dispose.
GraphRetriever:
File: src/magecode/relevancy/retrievers/**tests**/graphRetriever.test.ts
Coverage: retrieve method. Mock the ILocalCodeIntelligence dependency and its searchGraph method. Verify input arguments and output transformation.
SyncService:
File: src/magecode/tests/unit/intelligence/sync/syncService.test.ts
Coverage: Test individual methods (initialize, handleFileChange, dispatchTask, etc.) by mocking dependencies (DB, VectorIndex, Embeddings, WorkerPool, Governor, FS, Globby, VSCode API). This will require extensive mocking.
RelevancyEngine:
File: src/magecode/relevancy/**tests**/relevancyEngine.test.ts
Coverage: findRelevantCode. Mock retrievers and scorer dependencies. Verify parallel retrieval, result combination, and call to the scorer.
Phase 3: Integrate and Test VectorIndex
Remove Mocks in VectorIndex:
File: src/magecode/intelligence/vector/vectorIndex.ts
Action: Replace mock logic in initializeFaiss, initializeVoy, and methods like add, search, remove, write, serialize with actual calls to faiss-node and voy-search. Ensure dynamic imports (await import(...)) are used correctly for these potentially heavy or platform-specific libraries. Add robust error handling around library loading and calls.
Add VectorIndex Integration Tests:
Directory: src/magecode/tests/integration/intelligence/vector/ (Create if needed)
Action: Create tests that initialize VectorIndex with real data.
Coverage:
Test index creation, saving, and loading from disk (for both FAISS/Voy if possible, potentially skipping based on platform).
Test adding a batch of embeddings.
Test searching for nearest neighbors and verifying results.
Test removing embeddings by file path.
Test persistence of the mapping file alongside the index file.
Phase 4: Implement Missing Integration Tests
Parsing/Storage Coordination (SyncService):
Directory: src/magecode/tests/integration/intelligence/sync/ (Create if needed)
Action: Create tests that simulate a mini-workspace.
Coverage:
Initialize SyncService with real (or near-real) dependencies (Parser, DBManager, potentially mocked Embedding/VectorIndex if needed for focus).
Run initialScan on the test workspace and verify the DatabaseManager contains the expected CodeElement data.
Simulate file creation, modification, and deletion events and verify SyncService correctly updates the DatabaseManager (adds, updates, deletes elements). Test ignore patterns.
Relevancy Engine Flow:
Directory: src/magecode/tests/integration/relevancy/ (Create if needed)
Action: Create tests that exercise the full RelevancyEngine.
Coverage:
Set up prerequisite data in a test DatabaseManager and VectorIndex.
Initialize RelevancyEngine with real retrievers and the fixed HybridScorer.
Call findRelevantCode with different queries and context options.
Verify the final ranked list of ScoredItem objects matches expectations based on the test data and scoring logic.
Visual Plan
graph TD subgraph Phase 1: Fix Scorer A[Fix HybridScorer.scoreItems Logic] --> B(Update hybridScorer.test.ts); end subgraph Phase 2: Unit Tests direction LR C[settings] --> D[DBManager]; D --> E[MageParser]; E --> F[EmbeddingSvc]; F --> G[VectorIndex(mock)]; G --> H[GraphRetriever]; H --> I[SyncService]; I --> J[RelevancyEngine]; end subgraph Phase 3: Vector Index Integration K[Remove VectorIndex Mocks] --> L(Implement Real FAISS/Voy Calls); L --> M(Add VectorIndex Integration Tests); end subgraph Phase 4: Integration Tests N[Add SyncService Integration Tests] O[Add RelevancyEngine Integration Tests] end B --> C; J --> K; M --> N; N --> O; style A fill:#f9d,stroke:#333,stroke-width:2px style L fill:#f9d,stroke:#333,stroke-width:2px
