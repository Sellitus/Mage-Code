# MageCode Agent Mode - Comprehensive Design Document

**Version: 2.0**  
**Date: April 14, 2025**  
**Status: Final Technical Specification**

## 1. Introduction

### 1.1. Purpose & Scope

This document details the technical design for "MageCode," an advanced agentic coding mode integrated within the existing Roo-Code VS Code extension. MageCode provides a high-performance, token-efficient approach to AI-assisted coding by leveraging extensive local code analysis, intelligent context retrieval, and flexible multi-model LLM orchestration.

The scope encompasses the complete architecture of MageCode mode, detailed design of its core components, integration strategy with absolute minimal modification to existing code, and technical implementation specifics. This design prioritizes complete isolation of new functionality into dedicated directories and files, ensuring easy maintenance and future updates while preserving the original Roo-Code experience.

### 1.2. Goals & Objectives

**Primary:**

- Implement "MageCode" as the default agent mode within Roo-Code, with option to disable and revert to original Roo-Code behavior
- Maximize token efficiency in MageCode mode, reducing LLM API costs by 60-80% through local processing
- Achieve sub-200ms response times for local intelligence operations
- Implement the entire feature with modifications to exactly two existing Roo-Code files

**Secondary:**

- Provide robust and reliable agentic capabilities (planning, context understanding, code generation/modification, tool use) within MageCode mode
- Support real-time workspace changes with incremental intelligence updates
- Ensure MageCode is maintainable, testable, and scalable as the codebase evolves
- Deliver graceful performance degradation for resource-constrained environments

**Constraints:**

- Zero-Touch Approach: Implement functionality with NO modifications to original Roo-Code source files except the two designated integration points
- Absolute Minimal Modification: Limit changes to the smallest possible integration points (primarily mode configuration and dispatch hooks)
- Complete Isolation: Place ALL new code, including tests, configurations, and assets in dedicated magecode directories
- Preserve original Roo-Code functionality for users who disable MageCode mode
- Maintain VS Code extension performance standards even with local processing

### 1.3. Non-Goals

- Replacing or fundamentally altering the original Roo-Code agent logic - both modes must coexist
- Achieving 100% feature parity between modes if MageCode's efficiency goals conflict with original functionality
- Supporting IDEs other than VS Code in this iteration (VS Code exclusive focus)
- Implementing advanced, experimental features (e.g., complex agent reflection loops, dynamic LLM fine-tuning)
- Real-time synchronization of extremely large codebases (>1M LOC) without performance impact

### 1.4. Target Audience

- Developers currently using the Roo-Code extension who want improved performance and token efficiency
- Developers and teams highly sensitive to LLM API costs seeking cost optimization
- Users interested in leveraging local code intelligence for more context-aware AI assistance
- Users comfortable with potentially higher local resource consumption in exchange for MageCode's benefits
- Development teams working in large codebases where context management is critical

### 1.5. Definitions

- **Roo-Code Mode**: The original agent logic, available when MageCode is disabled
- **MageCode Mode**: The new, default agent logic detailed in this document
- **Local Code Intelligence Engine (LCIE)**: MageCode component for local code parsing, storage (SQLite, Vector Index), indexing, and real-time synchronization
- **Relevancy Engine**: MageCode component using hybrid methods (graph, vector, lexical) to find relevant code snippets locally
- **Multi-Model Orchestrator (MMO)**: MageCode component routing LLM requests to different tiers (Local Tier 0, API Tier 1)
- **Agentic Execution Engine (AEE)**: The core logic loop for MageCode mode (reactive, tool-using)
- **Token Efficiency**: Minimizing LLM API token usage through strategic context selection and local processing
- **Zero-Touch Approach**: Strategy of implementing new functionality without modifying any original Roo-Code files
- **Integration Point**: The minimal locations where original code must be modified to enable mode switching
- **AST**: Abstract Syntax Tree - structured representation of code for analysis
- **FTS**: Full-Text Search (specifically SQLite FTS5) for efficient code search
- **ONNX**: Open Neural Network Exchange format for ML models - used for local embeddings and inference
- **ORT**: ONNX Runtime execution engine - powers local ML operations
- **WASM**: WebAssembly - used for cross-platform code parsing
- **RAG**: Retrieval Augmented Generation - technique for enhancing LLM responses with relevant context
- **LRU Cache**: Least Recently Used caching strategy for optimizing memory usage
- **Sync Service**: Component responsible for monitoring real-time workspace changes
- **Workspace Change**: Any modification to the codebase, including file edits, creations, deletions, and VCS operations

## 2. Architecture & Integration Strategy

### 2.1. High-Level Overview - Isolation-First Approach

The extension operates modally ("magecode" enabled or disabled), selected via configuration. A minimal dispatch mechanism at key integration points routes control flow to either the MageCode subsystems or the original Roo-Code subsystems. All MageCode components reside in a dedicated `src/magecode/` directory with its own complete folder structure.

```
graph TD
    UI[VSCode UI / Commands] --> Activation[extension.ts activate]
    Activation --> ConfigRead{Read magecode.enabled}
    ConfigRead -- "true (default)" --> InitMC[Initialize MageCode Services]
    ConfigRead -- "false" --> InitRC[Use Roo-Code Services]

    InitMC --> MC_Provider(ClineProvider - MC Mode)
    InitRC --> RC_Provider(ClineProvider - RC Mode)

    UserTask --> Dispatcher{Task Dispatcher (in ClineProvider)}
    Dispatcher -- "magecode enabled" --> MC_Agent[MageCode Agent]
    Dispatcher -- "magecode disabled" --> RC_Agent[Roo-Code Agent]

    MC_Agent -- Uses --> MC_Services[MageCode Services]
    RC_Agent -- Uses --> Orig_Services[Original Services]
```

This architecture ensures that only the active mode's components are loaded and consuming resources. When MageCode is disabled, its components remain dormant with minimal memory footprint.

### 2.2. Mode Selection Mechanism - Minimal Configuration Change

**Setting**: Add single entry `mage-code.magecode.enabled` to existing configuration schema in `package.json` without modifying any other settings:

```
{
  "type": "boolean",
  "default": true,
  "description": "Enable MageCode agent mode for enhanced token efficiency",
  "scope": "window"
}
```

**Access**: Create utility function `isMageCodeEnabled()` in `src/magecode/config/settings.ts` that reads this setting:

```
export function isMageCodeEnabled(): boolean {
  return vscode.workspace.getConfiguration('mage-code').get('magecode.enabled', true);
}
```

**Configuration Change Events**: Monitor configuration changes to dynamically switch modes:

```
export function registerModeChangeListener(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('mage-code.magecode.enabled')) {
        handleModeChange(isMageCodeEnabled());
      }
    })
  );
}
```

### 2.3. Code Isolation and Integration Strategy

**Integration Points**: Limit original code modifications to exactly two places:

1. `extension.ts`: Add conditional initialization code that checks mode and initializes MageCode's services accordingly.
2. `src/providers/cline-provider/ClineProvider.ts`: Add minimal dispatch logic that checks mode and routes to appropriate implementation.

**Zero-Touch Integration Pattern**:

- Create a complete parallel implementation of all necessary interfaces in the `src/magecode/` directory
- Use adapter/façade patterns to wrap necessary Roo-Code components rather than modifying them
- For all integration points, implement clean dispatch logic that introduces minimal cognitive overhead to the original codebase

**Core Interfaces** (`src/magecode/interfaces/index.ts`):

```
export interface IAgent {
  runTask(task: TaskInput): Promise<TaskResult>;
  stop(): Promise<void>;
}

export interface IContextRetriever {
  getContext(query: string, options: ContextOptions): Promise<RetrievedContext>;
}

export interface ILLMOrchestrator {
  makeApiRequest(prompt: string, options: RequestOptions): Promise<LLMResponse>;
}
```

**Dependency Factory** (New Method):

```
// In ClineProvider.ts - ONE OF ONLY TWO MODIFIED FILES
private _createAgentDependencies() {
  const { isMageCodeEnabled } = require('../../../magecode/config/settings');

  if (isMageCodeEnabled()) {
    const { createMageCodeDependencies } = require('../../../magecode/factory');
    return createMageCodeDependencies();
  }
  return this._originalCreateDependencies();
}
```

**Task Dispatch** (New Method):

```
// In ClineProvider.ts - ONE OF ONLY TWO MODIFIED FILES
private async _dispatchAgentTask(task: TaskInput): Promise<TaskResult> {
  const { isMageCodeEnabled } = require('../../../magecode/config/settings');
  const deps = this._createAgentDependencies();

  if (isMageCodeEnabled()) {
    const { MageCodeAgent } = require('../../../magecode/agent');
    const agent = new MageCodeAgent(deps);
    return await agent.runTask(task);
  }

  return await this._originalRunTask(task);
}
```

### 2.4. Self-Contained MageCode Directory Structure (`src/magecode/`)

All new code resides in a completely self-contained structure with its own organization:

```
src/magecode/
├── agent.ts                 # Main MageCodeAgent implementation
├── factory.ts               # Creates all MageCode dependencies
├── interfaces/              # All interface definitions
├── config/                  # Configuration utilities
│   ├── settings.ts          # Settings access functions
│   └── constants.ts         # MageCode-specific constants
├── intelligence/            # Local Code Intelligence Engine
│   ├── index.ts             # Main engine facade
│   ├── parser/              # Tree-sitter integration
│   ├── storage/             # SQLite & vector storage
│   ├── embedding/           # Embedding generation
│   └── sync/                # File watching & sync
├── relevancy/               # Relevancy engine
│   ├── index.ts             # Main engine facade
│   ├── retrievers/          # Vector, graph, lexical retrievers
│   └── scoring/             # Result ranking algorithms
├── context/                 # Context assembly
├── orchestration/           # Multi-model orchestration
│   ├── index.ts             # Main orchestrator
│   ├── router.ts            # Model routing logic
│   ├── tiers/               # Model tier definitions
│   └── prompt/              # Prompt construction utilities
├── tools/                   # Tool definitions & registry
├── utils/                   # Utility functions
│   ├── adapters/            # Adapters to original components
│   ├── performance.ts       # Performance measurement utilities
│   └── logging.ts           # Logging utilities
├── assets/                  # Models, grammars, schemas
└── tests/                   # All tests for MageCode components
    ├── unit/                # Unit tests
    ├── integration/         # Integration tests
    └── e2e/                 # End-to-end tests
```

### 2.5. Conditional Activation/Resource Management - Minimal Original Code Touch

In `extension.ts` (ONE OF ONLY TWO MODIFIED FILES):

```
export async function activate(context: vscode.ExtensionContext) {
  // ADDED LINES BEGIN - Minimal addition for MageCode mode
  const magecodeEnabled = vscode.workspace.getConfiguration('mage-code').get('magecode.enabled', true);
  if (magecodeEnabled) {
    const { initializeMageCode } = require('./magecode/initialize');
    await initializeMageCode(context); // Handles all MageCode initialization
  }
  // ADDED LINES END

  // Original activation code for Roo-Code...
}
```

Inside `src/magecode/initialize.ts` (NEW FILE):

```
export async function initializeMageCode(context: vscode.ExtensionContext) {
  // Initialize all MageCode services with proper lifecycle management
  const intelligenceEngine = new LocalCodeIntelligenceEngine();
  await intelligenceEngine.initialize();
  context.subscriptions.push(intelligenceEngine);

  // Initialize relevancy engine with appropriate dependencies
  const relevancyEngine = new RelevancyEngine(intelligenceEngine);
  context.subscriptions.push(relevancyEngine);

  // Initialize multi-model orchestrator
  const modelOrchestrator = new MultiModelOrchestrator(context.extensionPath);
  context.subscriptions.push(modelOrchestrator);

  // Register mode change listener for dynamic switching
  registerModeChangeListener(context);

  // Register all MageCode-specific commands and tools
  registerMageCodeCommands(context);
  registerMageCodeTools(context);

  console.log("MageCode mode initialized successfully");
}
```

### 2.6. Settings UI Integration - Self-Contained Approach

Rather than modifying the existing settings UI:

- Create a completely isolated `src/magecode/webview-ui/SettingsView.tsx` that extends but doesn't modify original settings:

```
export class MageCodeSettingsView {
  private static readonly viewType = 'magecode.settings';
  private readonly panel: vscode.WebviewPanel;

  constructor(context: vscode.ExtensionContext) {
    // Create WebviewPanel with React UI for MageCode settings
    this.panel = vscode.window.createWebviewPanel(
      MageCodeSettingsView.viewType,
      'MageCode Settings',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    // Initialize panel with HTML content
    this.panel.webview.html = this.getWebviewContent(context);

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(this.handleMessage);
  }

  // Implementation details...
}
```

- Register a separate command `magecode.showSettings` that displays MageCode settings:

```
export function registerMageCodeCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('magecode.showSettings', () => {
      new MageCodeSettingsView(context);
    })
  );

  // Register other MageCode commands...
}
```

## 3. MageCode Mode: Self-Contained Component Design

### 3.1. Local Code Intelligence Engine (LCIE) (`src/magecode/intelligence/`)

**Purpose**: Provides deep code understanding through parsing, indexing, and real-time synchronization. It forms the foundation of MageCode's token efficiency by enabling local code analysis and context retrieval.

**Key Components**:

**Parser**:

```
export class Parser {
  private parsers: Map<string, TreeSitterParser> = new Map();

  async parseFile(filePath: string): Promise<ParsedFile> {
    const language = this.detectLanguage(filePath);
    const parser = await this.getParserForLanguage(language);
    const content = await fs.promises.readFile(filePath, 'utf8');

    try {
      const ast = parser.parse(content);
      return { path: filePath, language, ast, errors: [] };
    } catch (err) {
      // Error tolerance mechanism
      return this.handleParsingError(filePath, language, content, err);
    }
  }

  private handleParsingError(filePath, language, content, error): ParsedFile {
    const errorHandler = new ErrorHandler(language);
    const partialAst = errorHandler.recoverPartialAst(content, error);

    console.warn(`Tree-sitter parsing error in ${filePath}: ${error.message}`);

    return {
      path: filePath,
      language,
      ast: partialAst,
      errors: [{ message: error.message, location: errorHandler.extractErrorLocation(error) }]
    };
  }
}
```

**Storage**:

```
export class DatabaseManager implements vscode.Disposable {
  private db: Database;
  private initialized: boolean = false;

  async initialize(workspacePath: string): Promise<void> {
    if (this.initialized) return;

    const dbPath = path.join(workspacePath, '.magecode', 'intelligence.db');
    await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    await this.runMigrations();
    this.initialized = true;
  }

  async storeCodeElements(elements: CodeElement[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO code_elements
      (id, file_path, type, name, content, start_line, end_line, parent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Execute in transaction for better performance
    this.db.transaction(() => {
      for (const element of elements) {
        stmt.run(/* element properties */);
        // Store relationships in separate table
      }
    })();
  }
}
```

**Vector Index**:

```
export class VectorIndex implements vscode.Disposable {
  private index: any; // FAISS or Voy index
  private mapping: Map<number, string> = new Map(); // Vector ID to element ID mapping

  async initialize(workspacePath: string): Promise<void> {
    const indexPath = path.join(workspacePath, '.magecode', 'vectors');

    // Initialize vector index based on platform
    if (process.platform === 'win32' || process.platform === 'darwin') {
      this.index = await this.initFaiss(indexPath);
    } else {
      this.index = await this.initVoy(indexPath);
    }

    await this.loadMapping(indexPath);
  }

  async addEmbeddings(embeddings: {id: string, vector: number[]}[]): Promise<void> {
    if (embeddings.length === 0) return;

    // Convert to appropriate format for index
    const vectors = embeddings.map(e => e.vector);
    const ids = embeddings.map((e, i) => i + this.mapping.size);

    // Add to index
    await this.index.add(vectors, ids);

    // Update mapping
    embeddings.forEach((e, i) => {
      this.mapping.set(ids[i], e.id);
    });

    this.saveMappingDebounced();
  }

  async search(vector: number[], k: number): Promise<{id: string, score: number}[]> {
    const results = await this.index.search(vector, k);
    return results.map(r => ({
      id: this.mapping.get(r.id),
      score: r.score
    }));
  }
}
```

**Sync Service**:

```
export class SyncService implements vscode.Disposable {
  private fileWatcher: FileWatcher;
  private vcsHandler: VCSHandler;
  private parser: Parser;
  private storage: DatabaseManager;
  private vectorIndex: VectorIndex;
  private embeddingService: EmbeddingService;
  private syncQueue: PriorityQueue<SyncTask>;
  private isProcessing: boolean = false;

  constructor(dependencies) {
    // Initialize dependencies and set up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // File change events
    this.fileWatcher.onFileCreated(this.handleFileCreated.bind(this));
    this.fileWatcher.onFileChanged(this.handleFileChanged.bind(this));
    this.fileWatcher.onFileDeleted(this.handleFileDeleted.bind(this));

    // VCS events
    this.vcsHandler.onBranchChanged(this.handleBranchChanged.bind(this));

    this.startProcessing();
  }

  private async handleBranchChanged(repo: string, fromBranch: string, toBranch: string): Promise<void> {
    console.log(`Branch changed from ${fromBranch} to ${toBranch} in ${repo}`);

    // Get list of changed files between branches
    const changedFiles = await this.vcsHandler.getChangedFilesBetweenBranches(repo, fromBranch, toBranch);

    // Queue all changed files for processing with high priority
    for (const file of changedFiles) {
      this.syncQueue.enqueue({
        type: 'update',
        path: file,
        priority: 'high'
      });
    }

    if (!this.isProcessing) {
      this.startProcessing();
    }
  }

  private async startProcessing(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;

    while (!this.syncQueue.isEmpty()) {
      const task = this.syncQueue.dequeue();

      try {
        switch (task.type) {
          case 'add':
            await this.processFile(task.path);
            break;
          case 'update':
            await this.updateFile(task.path);
            break;
          case 'delete':
            await this.deleteFile(task.path);
            break;
        }
      } catch (err) {
        console.error(`Error processing sync task for ${task.path}:`, err);
      }

      // Yield to event loop to maintain responsiveness
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    this.isProcessing = false;
  }

  private async processFile(filePath: string): Promise<void> {
    // Parse the file
    const parsedFile = await this.parser.parseFile(filePath);

    // Extract code elements
    const elements = this.parser.extractCodeElements(parsedFile);

    // Store elements in database
    await this.storage.storeCodeElements(elements);

    // Generate embeddings
    const texts = elements.map(e => e.content);
    const embeddings = await this.embeddingService.generateEmbeddings(texts);

    // Store embeddings
    await this.vectorIndex.addEmbeddings(
      elements.map((e, i) => ({
        id: e.id,
        vector: embeddings[i]
      }))
    );
  }
}
```

### 3.2. Relevancy & Context Retrieval Engine (`src/magecode/relevancy/`, `src/magecode/context/`)

**Purpose**: Finds the most relevant code snippets for each query using multiple retrieval strategies. This component is critical for token efficiency, as it selectively retrieves only the most pertinent code context.

**Retrieval Methods**:

**Vector Retrieval**:

```
export class VectorRetriever implements IRetriever {
  private embeddingService: EmbeddingService;
  private vectorIndex: VectorIndex;
  private storage: DatabaseManager;

  async retrieve(query: string, options: RetrievalOptions): Promise<RetrievedItem[]> {
    // Generate embedding for query
    const queryEmbedding = await this.embeddingService.generateEmbeddings([query]);

    // Search for similar vectors
    const results = await this.vectorIndex.search(queryEmbedding[0], options.limit || 10);

    // Retrieve full code elements from database
    return await Promise.all(results.map(async result => {
      const element = await this.storage.getCodeElementById(result.id);
      return {
        id: element.id,
        content: element.content,
        filePath: element.filePath,
        startLine: element.startLine,
        endLine: element.endLine,
        score: result.score,
        type: element.type,
        source: 'vector'
      };
    }));
  }
}
```

**Graph Retrieval**:

```
export class GraphRetriever implements IRetriever {
  private storage: DatabaseManager;

  async retrieve(query: string, options: RetrievalOptions): Promise<RetrievedItem[]> {
    // Get current cursor position from options
    const { cursorFile, cursorLine } = options;

    if (!cursorFile || cursorLine === undefined) {
      return [];
    }

    // Find code element at cursor position
    const cursorElement = await this.storage.getCodeElementAtPosition(
      cursorFile,
      cursorLine
    );

    if (!cursorElement) {
      return [];
    }

    // Traverse graph to find related elements
    const results = await this.storage.findRelatedElements(
      cursorElement.id,
      options.limit || 10,
      options.relationTypes || ['calls', 'imports', 'defines', 'uses']
    );

    // Convert to retrieved items
    return results.map(element => ({
      id: element.id,
      content: element.content,
      filePath: element.filePath,
      startLine: element.startLine,
      endLine: element.endLine,
      score: element.relationDistance ? 1 / element.relationDistance : 1,
      type: element.type,
      source: 'graph'
    }));
  }
}
```

**Ranking System**:

```
export class HybridScorer {
  private scorers: Map<string, IScorer> = new Map();
  private weights: {[key: string]: number} = {
    'vector': 0.6,
    'graph': 0.3,
    'lexical': 0.1
  };

  constructor() {
    // Register scorers
    this.scorers.set('vector', new VectorScorer());
    this.scorers.set('graph', new GraphScorer());
    this.scorers.set('lexical', new LexicalScorer());
    this.scorers.set('proximity', new ProximityScorer());
    this.scorers.set('recency', new RecencyScorer());
  }

  scoreItems(items: RetrievedItem[], query: string, options: ScoringOptions): ScoredItem[] {
    // Calculate base scores based on retrieval source
    const scoredItems = items.map(item => {
      const normalizedScore = this.scorers.get(item.source)?.normalize(item.score) || 0;
      const weightedScore = normalizedScore * (this.weights[item.source] || 0.1);

      return {
        ...item,
        score: weightedScore
      };
    });

    // Apply additional scoring factors
    const withProximity = this.scorers.get('proximity')?.score(scoredItems, options) || scoredItems;
    const withRecency = this.scorers.get('recency')?.score(withProximity, options) || withProximity;

    // Remove duplicates and combine scores
    const uniqueItems = this.removeDuplicates(withRecency);

    // Sort by final score
    return uniqueItems.sort((a, b) => b.score - a.score);
  }
}
```

**Context Assembly**:

```
export class ContextAssembler {
  private relevancyEngine: RelevancyEngine;
  private historyManager: HistoryManager;
  private truncationService: TruncationService;

  async assembleContext(query: string, options: ContextOptions): Promise<AssembledContext> {
    // Retrieve relevant code snippets
    const relevantItems = await this.relevancyEngine.findRelevantCode(
      query,
      {
        cursorFile: options.cursorFile,
        cursorLine: options.cursorLine,
        limit: options.codeSnippetLimit || 20,
        fileTypes: options.fileTypes
      }
    );

    // Get conversation history
    const history = await this.historyManager.getRecentHistory(
      options.historyLimit || 5
    );

    // Calculate token budget
    const totalBudget = options.maxTokens || 4000;
    const historyBudget = Math.min(
      totalBudget * 0.3, // Max 30% for history
      this.estimateTokens(history) // Actual history tokens
    );
    const codeBudget = totalBudget - historyBudget - 200; // Reserve 200 tokens for query and formatting

    // Apply smart truncation to fit token budget
    const truncatedCode = this.truncationService.truncateCodeSnippets(
      relevantItems,
      codeBudget
    );

    // Format context
    return {
      query,
      relevantCode: truncatedCode,
      conversationHistory: history,
      fileStructure: options.includeFileStructure ?
        await this.getRelevantFileStructure(relevantItems) :
        undefined
    };
  }
}
```

### 3.3. Multi-Model Orchestrator (MMO) (`src/magecode/orchestration/`)

**Purpose**: Routes requests to appropriate LLM based on task type and requirements. This component enables MageCode to use local models for simple tasks while falling back to cloud APIs for complex reasoning.

**Model Tiers**:

```
export class LocalModelTier implements IModelTier {
  private model: ONNXModel;
  private tokenizer: Tokenizer;
  private initialized: boolean = false;

  async initialize(extensionPath: string): Promise<void> {
    if (this.initialized) return;

    const modelPath = path.join(extensionPath, 'src/magecode/assets/models/tinyllm-1b.onnx');
    const tokenizerPath = path.join(extensionPath, 'src/magecode/assets/models/tokenizer.json');

    // Initialize ONNX Runtime session with optimized settings
    this.model = new ONNXModel({
      executionProvider: 'cpu',
      optimizationLevel: 3,
      graphOptimizationLevel: 3,
      intraOpNumThreads: Math.max(1, os.cpus().length / 2)
    });

    await this.model.loadModel(modelPath);
    this.tokenizer = new Tokenizer(tokenizerPath);
    this.initialized = true;
  }

  async makeRequest(prompt: string, options: ModelRequestOptions): Promise<ModelResponse> {
    if (!this.initialized) {
      throw new Error("LocalModelTier not initialized");
    }

    const startTime = Date.now();

    try {
      // Tokenize input
      const tokens = this.tokenizer.encode(prompt);

      if (tokens.length > 2048) {
        throw new Error("Input too long for local model");
      }

      // Generate response
      const outputTokens = await this.model.generate(tokens, {
        maxTokens: options.maxTokens || 512,
        temperature: options.temperature || 0.1,
        topP: options.topP || 0.9
      });

      // Decode output
      const text = this.tokenizer.decode(outputTokens);
      const latency = Date.now() - startTime;

      return {
        text,
        tokenUsage: {
          input: tokens.length,
          output: outputTokens.length,
          total: tokens.length + outputTokens.length
        },
        modelType: 'local',
        latency
      };
    } catch (err) {
      throw new Error(`Local model error: ${err.message}`);
    }
  }
}
```

**Routing Logic**:

```
export class ModelRouter {
  private taskClassifier: TaskClassifier;

  async routeRequest(task: TaskType, prompt: string, options: RouterOptions): Promise<ModelTier> {
    // Analyze task complexity and requirements
    const analysis = await this.taskClassifier.analyzeTask(task, prompt);

    // Apply routing logic
    if (analysis.complexity <= 0.3 && analysis.tokensRequired <= 1024) {
      // Simple tasks that fit in local model context
      return ModelTier.LOCAL;
    } else if (analysis.complexity <= 0.6 && !analysis.requiresSpecialCapabilities) {
      // Medium complexity tasks with no special requirements
      return options.preferLocal ? ModelTier.LOCAL : ModelTier.CLOUD;
    } else {
      // Complex tasks or tasks requiring special capabilities
      return ModelTier.CLOUD;
    }
  }
}
```

**Orchestration Service**:

```
export class MultiModelOrchestrator implements ILLMOrchestrator, vscode.Disposable {
  private static instance: MultiModelOrchestrator;
  private router: ModelRouter;
  private localTier: LocalModelTier;
  private cloudTier: CloudModelTier;
  private promptService: PromptService;
  private cache: LRUCache<string, ModelResponse>;

  public static getInstance(): MultiModelOrchestrator {
    if (!MultiModelOrchestrator.instance) {
      MultiModelOrchestrator.instance = new MultiModelOrchestrator();
    }
    return MultiModelOrchestrator.instance;
  }

  async makeApiRequest(prompt: string, options: RequestOptions): Promise<LLMResponse> {
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(prompt, options);
      const cachedResponse = this.cache.get(cacheKey);

      if (cachedResponse && !options.skipCache) {
        return this.formatResponse(cachedResponse);
      }

      // Determine appropriate model tier
      const tier = await this.router.routeRequest(
        options.taskType,
        prompt,
        { preferLocal: options.preferLocal || false }
      );

      // Format prompt based on model tier
      const formattedPrompt = await this.promptService.formatPrompt(
        prompt,
        tier,
        options
      );

      // Make request to appropriate tier
      let response: ModelResponse;

      if (tier === ModelTier.LOCAL) {
        response = await this.localTier.makeRequest(formattedPrompt, {
          maxTokens: options.maxTokens,
          temperature: options.temperature
        });
      } else {
        response = await this.cloudTier.makeRequest(formattedPrompt, {
          systemPrompt: options.systemPrompt,
          maxTokens: options.maxTokens,
          temperature: options.temperature,
          model: options.model
        });
      }

      // Cache response if appropriate
      if (options.cacheResponse !== false) {
        this.cache.set(cacheKey, response);
      }

      return this.formatResponse(response);
    } catch (err) {
      // Handle model fallback
      if (err.message.includes('Local model error') && options.allowFallback !== false) {
        console.log('Local model failed, falling back to cloud model');
        return await this.fallbackToCloud(prompt, options);
      }

      throw err;
    }
  }
}
```

### 3.4. Agentic Execution Engine (AEE) (`src/magecode/agent.ts`)

**Purpose**: Coordinates the agent's reasoning, planning, and action execution. This is the core logic loop for MageCode mode that manages user interactions.

```
export class MageCodeAgent implements IAgent {
  private context: AgentContext;
  private contextRetriever: IContextRetriever;
  private llmOrchestrator: ILLMOrchestrator;
  private toolRegistry: ToolRegistry;
  private isRunning: boolean = false;
  private currentTask: string | null = null;

  constructor(dependencies: AgentDependencies) {
    this.contextRetriever = dependencies.contextRetriever;
    this.llmOrchestrator = dependencies.llmOrchestrator;
    this.toolRegistry = dependencies.toolRegistry;
    this.context = new AgentContext();
  }

  async runTask(task: TaskInput): Promise<TaskResult> {
    if (this.isRunning) {
      throw new Error("Agent is already running a task");
    }

    this.isRunning = true;
    this.currentTask = task.id;

    try {
      // Initialize task context
      await this.context.initialize(task);

      // Report initial status
      this.reportProgress({
        type: 'status',
        message: 'Analyzing task and retrieving context...'
      });

      // Retrieve relevant context
      const retrievedContext = await this.contextRetriever.getContext(
        task.query,
        {
          cursorFile: task.cursorFile,
          cursorLine: task.cursorLine,
          maxTokens: 4000,
          includeFileStructure: true
        }
      );

      // Add context to agent state
      this.context.setRetrievedContext(retrievedContext);

      // Report context retrieval complete
      this.reportProgress({
        type: 'status',
        message: 'Context retrieved, planning approach...'
      });

      // Plan approach
      await this.planApproach(task);

      // Execute plan
      const result = await this.executePlan();

      // Format final result
      return {
        id: task.id,
        query: task.query,
        result: result,
        status: 'completed'
      };
    } catch (err) {
      console.error(`Task execution error: ${err.message}`);
      return {
        id: task.id,
        query: task.query,
        result: `Error: ${err.message}`,
        status: 'error'
      };
    } finally {
      this.isRunning = false;
      this.currentTask = null;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Signal stop to any ongoing operations
    this.context.signalStop();
    this.isRunning = false;
    this.currentTask = null;
  }

  private async planApproach(task: TaskInput): Promise<void> {
    // Construct planning prompt
    const planningPrompt = this.constructPlanningPrompt(task);

    // Get plan from LLM
    const planResponse = await this.llmOrchestrator.makeApiRequest(
      planningPrompt,
      {
        taskType: 'planning',
        maxTokens: 1000,
        temperature: 0.2
      }
    );

    // Parse and store plan
    const plan = this.parsePlan(planResponse.content);
    this.context.setPlan(plan);

    // Report plan to user
    this.reportProgress({
      type: 'plan',
      plan: plan
    });
  }

  private async executePlan(): Promise<string> {
    const plan = this.context.getPlan();
    let result = '';

    // Execute each step in plan
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      // Report current step
      this.reportProgress({
        type: 'step',
        stepNumber: i + 1,
        totalSteps: plan.steps.length,
        description: step.description
      });

      // Check if we need to use tools
      if (step.tools && step.tools.length > 0) {
        for (const toolUse of step.tools) {
          // Execute tool
          const toolResult = await this.executeTool(toolUse);

          // Store tool result in context
          this.context.addToolResult(toolUse.tool, toolResult);
        }
      }

      // Generate step output
      const stepPrompt = this.constructStepPrompt(step, i);
      const stepResponse = await this.llmOrchestrator.makeApiRequest(
        stepPrompt,
        {
          taskType: 'execution',
          maxTokens: 2000,
          temperature: 0.5,
          systemPrompt: `You are executing step ${i + 1} of ${plan.steps.length}: ${step.description}`
        }
      );

      // Add step output to result
      this.context.addStepResult(i, stepResponse.content);

      // Update overall result
      if (i === plan.steps.length - 1) {
        result = stepResponse.content; // Final step is the overall result
      }
    }

    return result;
  }
}
```

### 3.5. Tooling (`src/magecode/tools/`)

**Purpose**: Provides safe, controlled ways for the agent to interact with the environment. Tools are the primary means by which the agent can perform actions like reading files, modifying code, or running commands.

```
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);

    // Register with VS Code only when MageCode is active
    if (isMageCodeEnabled()) {
      vscode.lm.registerTool(
        tool.name,
        tool.description,
        tool.inputSchema,
        async (args: any) => {
          return await tool.execute(args);
        }
      );
    }
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  getTool(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool;
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }
}
```

Sample tool implementation:

```
export class FileReader implements Tool {
  readonly name = 'readFile';
  readonly description = 'Reads the contents of a file in the workspace';
  readonly inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file relative to workspace root'
      }
    },
    required: ['path']
  };

  async execute(args: {path: string}): Promise<string> {
    try {
      // Validate path is within workspace
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder is open');
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const fullPath = path.join(workspaceRoot, args.path);

      // Security check: ensure path is within workspace
      if (!fullPath.startsWith(workspaceRoot)) {
        throw new Error('Path must be within the workspace');
      }

      // Check if file exists
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${args.path}`);
      }

      // Read file
      const content = await fs.promises.readFile(fullPath, 'utf8');
      return content;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  }
}
```

## 4. Data Models & Schemas

### 4.1. Storage Isolation Strategy

All data storage components are isolated from the original Roo-Code codebase:

- **SQLite Database**: Stored in `.magecode/intelligence.db` in the workspace root
- **Vector Indices**: Maintained in `.magecode/vectors` with separate files for each index
- **Configuration Data**: Stored in standard VS Code settings with `mage-code.magecode.*` prefix
- **Runtime Cache**: Maintained in memory with proper lifecycle management

This isolation ensures that data used by MageCode never interferes with the original extension's data.

### 4.2. Code Element Representation

The primary schema for code elements follows this structure:

```
CREATE TABLE code_elements (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  parent_id TEXT,
  metadata TEXT,
  last_modified INTEGER NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES code_elements(id) ON DELETE CASCADE
);

CREATE TABLE element_relations (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  metadata TEXT,
  PRIMARY KEY (source_id, target_id, relation_type),
  FOREIGN KEY (source_id) REFERENCES code_elements(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES code_elements(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE code_elements_fts USING fts5(
  content,
  name,
  type,
  tokenize='porter unicode61'
);
```

The schema includes appropriate indices for optimizing common queries:

```
CREATE INDEX idx_code_elements_file_path ON code_elements(file_path);
CREATE INDEX idx_code_elements_parent_id ON code_elements(parent_id);
CREATE INDEX idx_code_elements_type ON code_elements(type);
CREATE INDEX idx_code_elements_last_modified ON code_elements(last_modified);
CREATE INDEX idx_element_relations_target_id ON element_relations(target_id);
CREATE INDEX idx_element_relations_relation_type ON element_relations(relation_type);
```

### 4.3. Vector Storage Design

The vector storage uses a hybrid approach:

- **Vector Dimension**: Standard 384-dimensional vectors for all embeddings
- **Quantization**: 8-bit quantization for efficient storage
- **Index Type**: HNSW (Hierarchical Navigable Small World) for efficient similarity search
- **Indexing Parameters**:
    - `M`: 16 (connections per layer)
    - `efConstruction`: 200 (index build quality parameter)
    - `efSearch`: 50 (search quality parameter)

### 4.4. Graph Data Model

The graph model represents relationships between code elements:

- **Edge Types**:

    - `calls`: Function/method calls
    - `imports`: Import/include relationships
    - `defines`: Definition relationships
    - `uses`: Usage relationships
    - `inherits`: Class inheritance relationships
    - `implements`: Interface implementation
    - `contains`: Containment relationships

- **Edge Properties**:

    - `weight`: Relationship strength (1.0 by default)
    - `count`: Number of occurrences of the relationship
    - `locations`: JSON array of source locations where relationship occurs

- **Traversal Optimization**:
    - Bidirectional indices for rapid graph navigation
    - Pre-computed relationship distances for common paths
    - Configurable depth limits for traversal (default: 3)

### 4.5. Settings Schema

MageCode adds minimal configuration to the original extension:

```json
{
	"mage-code.magecode.enabled": {
		"type": "boolean",
		"default": true,
		"description": "Enable MageCode agent mode for enhanced token efficiency"
	},
	"mage-code.magecode.localProcessing": {
		"type": "object",
		"properties": {
			"maxConcurrency": {
				"type": "number",
				"default": 2,
				"description": "Maximum number of concurrent background processing tasks"
			},
			"maxMemoryMB": {
				"type": "number",
				"default": 512,
				"description": "Maximum memory usage for local processing (MB)"
			}
		}
	},
	"mage-code.magecode.modelPreference": {
		"type": "string",
		"enum": ["auto", "localFirst", "cloudFirst"],
		"default": "auto",
		"description": "Model routing preference for MageCode tasks"
	}
}
```

### 4.6. Schema Migration Strategy

To handle schema evolution over time:

- **Versioned Migrations**: Each schema change is represented by a migration script
- **Migration Registry**: Central registry of all migrations with version numbers
- **Migration Runner**: Automatically applies pending migrations during initialization
- **Backup Mechanism**: Creates temporary backups before schema changes

Example migration script:

```
export const migration_v2 = {
  version: 2,
  description: "Add metadata column to code_elements",
  up: async (db: Database) => {
    await db.exec(`
      ALTER TABLE code_elements ADD COLUMN metadata TEXT;
      UPDATE code_elements SET metadata = '{}';
    `);
  },
  down: async (db: Database) => {
    // SQLite doesn't support dropping columns directly
    // This would require more complex migration logic
  }
};
```

### 4.7. Cache Invalidation Strategy

MageCode implements a multi-level cache invalidation strategy:

- **File-Based Invalidation**: Invalidates caches when corresponding files change
- **Dependency-Based Invalidation**: Tracks dependencies between files to cascade invalidations
- **Time-Based Expiration**: Automatic expiration of cached items after configurable period
- **Manual Invalidation**: Command to force invalidation of all caches
- **Partial Updates**: Selective update of only changed portions of the cache

## 5. Performance & Resource Management Strategy

### 5.1. Optimization Strategies

MageCode incorporates numerous optimizations to maintain performance while performing extensive local processing:

- **Worker Threads**: Heavy computation in separate

## 5.1. Optimization Strategies

MageCode incorporates numerous optimizations to maintain performance while performing extensive local processing:

**Worker Threads**: Heavy computation in separate threads to prevent UI freezing. All database operations, parsing tasks, and embedding generation run in dedicated worker threads with configurable thread pool sizes based on system capabilities.

**Lazy Initialization**: Components initialize only when needed rather than at extension startup. The Local Code Intelligence Engine uses a staged initialization process that prioritizes immediate user needs.

```typescript
// Staged initialization example
export class LocalCodeIntelligenceEngine {
	private initialized = {
		basic: false,
		parser: false,
		database: false,
		vectorIndex: false,
		fullSync: false,
	}

	// Initialize only basic functionality instantly
	async initializeBasic(): Promise<void> {
		if (this.initialized.basic) return
		// Minimal initialization for core functionality
		this.initialized.basic = true
	}

	// Initialize parser only when first code analysis is requested
	async initializeParser(): Promise<void> {
		if (this.initialized.parser) return
		await this.loadParserGrammars()
		this.initialized.parser = true
	}

	// Full background initialization
	async initializeComplete(): Promise<void> {
		// Run in background without blocking UI
		this.initializeBasic()

		// Start background tasks with yielding
		this.initializeWithYield([
			this.initializeParser.bind(this),
			this.initializeDatabase.bind(this),
			this.initializeVectorIndex.bind(this),
			this.performFullSync.bind(this),
		])
	}
}
```

**Resource Governors**: Dynamically adjust processing based on system capabilities and load:

```typescript
export class ResourceGovernor {
	// Configuration with defaults adapted to system
	private config = {
		maxParallelParsing: Math.max(1, Math.floor(os.cpus().length / 2)),
		maxMemoryUsage: Math.min(1024, Math.floor(os.totalmem() / (1024 * 1024 * 8))), // MB
		processingIntervalMs: 50, // Time between batches
		maxBatchSize: 10, // Max files per batch
		yieldThresholdMs: 16, // Yield if processing takes longer
	}

	// Dynamically adjust based on system performance
	adjustToSystemLoad(): void {
		const cpuUsage = process.cpuUsage()
		const memUsage = process.memoryUsage()
		const memUsageMb = memUsage.heapUsed / (1024 * 1024)

		// Scale down when resource usage is high
		if (memUsageMb > this.config.maxMemoryUsage * 0.8) {
			this.config.maxParallelParsing = Math.max(1, this.config.maxParallelParsing - 1)
			this.config.maxBatchSize = Math.max(1, this.config.maxBatchSize - 2)
			this.config.processingIntervalMs *= 1.5
		} else if (memUsageMb < this.config.maxMemoryUsage * 0.5) {
			// Scale up when resource usage is low
			this.config.maxParallelParsing = Math.min(os.cpus().length, this.config.maxParallelParsing + 1)
			this.config.maxBatchSize = Math.min(20, this.config.maxBatchSize + 2)
			this.config.processingIntervalMs = Math.max(20, this.config.processingIntervalMs * 0.8)
		}
	}
}
```

**Multi-Level Caching**: Tiered caching strategy to balance memory usage and performance:

1. **Memory Cache**: Fast LRU cache for frequently accessed data with size limits
2. **Persisted Cache**: SQLite-based cache for long-lived but less frequently accessed data
3. **Computed Cache Invalidation**: Smart detection of when cached data becomes invalid

```typescript
export class CacheManager {
	private memoryCache: LRUCache<string, any>
	private persistentCache: PersistentCache

	constructor(config: CacheConfig) {
		this.memoryCache = new LRUCache({
			max: config.maxMemoryItems || 1000,
			maxAge: config.memoryTtlMs || 60 * 1000, // 1 minute default
			updateAgeOnGet: true,
		})

		this.persistentCache = new PersistentCache({
			dbPath: config.dbPath,
			tableName: "cache_entries",
			defaultTtlMs: config.diskTtlMs || 24 * 60 * 60 * 1000, // 1 day default
		})
	}

	// Multi-level get operation
	async get<T>(key: string): Promise<T | null> {
		// Try memory cache first
		const memResult = this.memoryCache.get(key)
		if (memResult !== undefined) return memResult as T

		// Try persistent cache
		const diskResult = await this.persistentCache.get(key)
		if (diskResult !== null) {
			// Update memory cache
			this.memoryCache.set(key, diskResult)
			return diskResult as T
		}

		return null
	}
}
```

**Incremental Processing**: Process only what changes rather than the entire workspace:

```typescript
export class IncrementalProcessor {
	// Track file state hashes to detect actual content changes
	private fileStateMap = new Map<string, string>()

	async processChanges(changes: FileChange[]): Promise<void> {
		for (const change of changes) {
			switch (change.type) {
				case "created":
					await this.processNewFile(change.uri)
					break
				case "changed":
					// Only process if content actually changed
					const newHash = await this.hashFile(change.uri)
					const oldHash = this.fileStateMap.get(change.uri.toString())

					if (newHash !== oldHash) {
						await this.updateFile(change.uri)
						this.fileStateMap.set(change.uri.toString(), newHash)
					}
					break
				case "deleted":
					await this.removeFile(change.uri)
					this.fileStateMap.delete(change.uri.toString())
					break
			}
		}
	}
}
```

**Selective Parsing**: Parse only relevant parts of files when possible:

```typescript
export class SelectiveParser {
	async parseFileRegion(filePath: string, startLine: number, endLine: number): Promise<ParsedNode> {
		// Read only the required region
		const content = await this.readFileRegion(filePath, startLine, endLine)

		// Try to parse the region as a valid syntax node
		try {
			return await this.parser.parseRegion(content)
		} catch (err) {
			// If region parsing fails, get context and try again with more lines
			return await this.parseWithExpandedContext(filePath, startLine, endLine)
		}
	}
}
```

**Database Optimization**: Carefully tuned SQLite database for optimal performance:

1. **Prepared Statements**: Pre-compiled statements for frequent queries
2. **Optimized Indices**: Custom indices based on query patterns
3. **WAL Mode**: Write-Ahead Logging for better concurrency
4. **Strategic Vacuuming**: Automatic database optimization during idle time

```typescript
export function optimizeDatabasePerformance(db: Database): void {
	// Enable WAL mode for better concurrency
	db.exec("PRAGMA journal_mode = WAL")

	// Optimize memory usage
	db.exec("PRAGMA cache_size = -2000") // 2MB cache

	// Prevent OS from syncing after each transaction
	db.exec("PRAGMA synchronous = NORMAL")

	// Use memory for temp tables
	db.exec("PRAGMA temp_store = MEMORY")

	// Create optimized indices
	db.exec(`
    CREATE INDEX IF NOT EXISTS idx_code_elements_file_path ON code_elements(file_path);
    CREATE INDEX IF NOT EXISTS idx_code_elements_parent_id ON code_elements(parent_id);
    CREATE INDEX IF NOT EXISTS idx_element_relations_source ON element_relations(source_id);
    CREATE INDEX IF NOT EXISTS idx_element_relations_target ON element_relations(target_id);
  `)
}
```

**Model Quantization**: Optimized local ML models balancing size, speed, and quality:

1. **8-bit Quantization**: Convert 32-bit float models to 8-bit integers for 4x size reduction
2. **KV Cache Optimization**: Efficient caching of key-value pairs for transformer models
3. **Operator Fusion**: Combine multiple operations into optimized primitives

```typescript
export class ModelOptimizer {
	async optimizeModel(modelPath: string, outputPath: string): Promise<void> {
		// Load original model
		const model = await onnx.loadModel(modelPath)

		// Apply quantization
		const quantized = await onnxQuantization.quantize(model, {
			quantizationType: "uint8",
			calibrate: true,
			calibrationDataReader: new CodeSampleCalibrationReader(),
		})

		// Apply operator fusion
		const optimized = await onnxOptimization.optimize(quantized, {
			fusionPatterns: ["Conv-Relu", "MatMul-Add"],
			enableConstantFolding: true,
		})

		// Save optimized model
		await onnx.saveModel(optimized, outputPath)
	}
}
```

**Intelligent Prioritization**: Focus computational resources on what the user is most likely to need:

1. **Focus-Based Priority**: Files in current view get highest priority
2. **Recency Weighting**: Recently edited files are processed before older ones
3. **Language-Specific Rules**: Deeper processing for primary project languages

```typescript
export class PriorityManager {
	// Calculate file processing priority (higher = more important)
	calculatePriority(file: string): number {
		let priority = 0

		// Highest priority for current file
		if (file === this.activeFile) {
			priority += 100
		}

		// High priority for visible files
		if (this.visibleFiles.includes(file)) {
			priority += 50
		}

		// Priority based on recency of edits
		const lastEdit = this.fileEditTimes.get(file) || 0
		const recencyScore = Math.max(0, 30 - (Date.now() - lastEdit) / (1000 * 60))
		priority += recencyScore

		// Priority based on file language
		const language = this.detectLanguage(file)
		const languageFactor = this.languagePriorities.get(language) || 1.0
		priority *= languageFactor

		return priority
	}
}
```

**Memory Management**: Proactive strategies to prevent memory bloat:

1. **Object Pooling**: Reuse expensive objects rather than creating new ones
2. **Strategic Disposal**: Explicitly free resources when they're no longer needed
3. **Memory Pressure Detection**: Monitor and react to system memory constraints

```typescript
export class MemoryManager implements vscode.Disposable {
	private pools: Map<string, ObjectPool<any>> = new Map()
	private disposables: vscode.Disposable[] = []
	private memoryCheckInterval: NodeJS.Timeout | null = null

	constructor() {
		// Create object pools
		this.pools.set("parsers", new ObjectPool(() => new Parser(), 5))
		this.pools.set("stringBuffers", new ObjectPool(() => new StringBuffer(1024), 20))

		// Start memory monitoring
		this.memoryCheckInterval = setInterval(this.checkMemoryPressure.bind(this), 30000)
	}

	// Monitor memory usage and react appropriately
	private async checkMemoryPressure(): Promise<void> {
		const memUsage = process.memoryUsage()
		const heapUsedPercent = memUsage.heapUsed / memUsage.heapTotal

		if (heapUsedPercent > 0.85) {
			console.warn("High memory pressure detected:", heapUsedPercent)

			// Clear caches that can be rebuilt
			this.clearVolatileCaches()

			// Force garbage collection if possible (optional Node flag required)
			if (global.gc) {
				global.gc()
			}
		}
	}

	dispose(): void {
		// Clean up resources
		if (this.memoryCheckInterval) {
			clearInterval(this.memoryCheckInterval)
		}

		// Dispose all resources
		this.disposables.forEach((d) => d.dispose())
		this.pools.forEach((pool) => pool.clear())
	}
}
```

**Parallel Processing Pipeline**: Use modern JavaScript features for efficient concurrency:

```typescript
export class ParallelProcessor {
	async processFileBatch(files: string[]): Promise<ProcessingResult[]> {
		// Group files into batches
		const batches = this.createBatches(files, this.config.batchSize)

		// Process batches in sequence, but files within batch in parallel
		const results: ProcessingResult[] = []

		for (const batch of batches) {
			// Process each file in batch concurrently
			const batchResults = await Promise.all(batch.map((file) => this.processFile(file)))

			results.push(...batchResults)

			// Yield to event loop between batches to maintain UI responsiveness
			await new Promise((resolve) => setTimeout(resolve, 0))
		}

		return results
	}
}
```

**Adaptive Chunking**: Intelligently split work into appropriate sized tasks:

```typescript
export class AdaptiveChunkManager {
	// Dynamically adjust chunk size based on processing time
	async processWithAdaptiveChunks<T, R>(
		items: T[],
		processor: (item: T) => Promise<R>,
		initialChunkSize: number = 10,
	): Promise<R[]> {
		const results: R[] = []
		let chunkSize = initialChunkSize
		let position = 0

		while (position < items.length) {
			// Create chunk of current size
			const chunk = items.slice(position, position + chunkSize)
			position += chunkSize

			// Track processing time
			const startTime = performance.now()

			// Process chunk
			const chunkResults = await Promise.all(chunk.map(processor))
			results.push(...chunkResults)

			// Measure time taken
			const duration = performance.now() - startTime

			// Target duration: 100ms (balance between responsiveness and throughput)
			const targetDuration = 100

			// Adjust chunk size for next iteration
			if (duration > targetDuration * 1.5) {
				// Too slow, reduce chunk size
				chunkSize = Math.max(1, Math.floor(chunkSize * 0.8))
			} else if (duration < targetDuration * 0.5) {
				// Too fast, increase chunk size
				chunkSize = Math.min(100, Math.floor(chunkSize * 1.2))
			}

			// Yield to event loop
			await new Promise((resolve) => setTimeout(resolve, 0))
		}

		return results
	}
}
```
