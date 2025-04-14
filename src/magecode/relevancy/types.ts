import { ElementType } from "../intelligence/types"

/**
 * Represents a code item retrieved from any source (vector, graph, lexical)
 */
export interface RetrievedItem {
	/** Unique identifier for this code element */
	id: string
	/** Name of the code element */
	name: string
	/** The actual code content */
	content: string
	/** Path to the file containing this code element */
	filePath: string
	/** Starting line number in the file */
	startLine: number
	/** Ending line number in the file */
	endLine: number
	/** Raw score from the retriever (0.0 to 1.0) */
	score: number
	/** Source that found this item */
	source: "vector" | "graph" | "lexical"
	/** Type of code element */
	type: ElementType
}

/**
 * Represents a scored code item with final ranking
 */
export interface ScoredItem extends RetrievedItem {
	/** Final computed score after applying weights and normalization */
	finalScore: number
}

/**
 * Options for retrieval operations
 */
export interface RetrievalOptions {
	/** Maximum number of items to retrieve */
	limit?: number
	/** Filter by file types */
	fileTypes?: string[]
	/** Current file being edited */
	cursorFile?: string
	/** Current line number */
	cursorLine?: number
	/** Maximum graph traversal distance */
	maxDistance?: number
	/** Additional retrieval context */
	context?: {
		/** Related file paths */
		relatedFiles?: string[]
		/** Symbol being referenced */
		referencedSymbol?: string
	}
}

/**
 * Options for scoring operations
 */
export interface ScoringOptions {
	/** Custom weights for different sources */
	weights?: {
		vector?: number
		graph?: number
		lexical?: number
	}
	/** Boost factors */
	boost?: {
		/** Boost items closer to cursor */
		proximity?: boolean
		/** Boost recently edited items */
		recency?: boolean
	}
	/** Context for scoring decisions */
	context?: {
		/** Current file path */
		currentFile?: string
		/** Recently edited files */
		recentFiles?: string[]
	}
}

/**
 * Interface for retrievers (vector, graph, lexical)
 */
export interface IRetriever {
	/**
	 * Retrieve relevant code items
	 * @param query Search query
	 * @param options Retrieval options
	 */
	retrieve(query: string, options: RetrievalOptions): Promise<RetrievedItem[]>
}

/**
 * Interface for scorers that can score individual sources
 */
export interface IScorer {
	/**
	 * Normalize a raw score to 0.0-1.0 range
	 * @param score Raw score
	 */
	normalize(score: number): number

	/**
	 * Score a set of items
	 * @param items Items to score
	 * @param options Scoring options
	 */
	score(items: RetrievedItem[], options: ScoringOptions): ScoredItem[]
}
