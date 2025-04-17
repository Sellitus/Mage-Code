declare module "sentencepiece-js" {
	// Declare the SentencePieceProcessor class based on usage
	export class SentencePieceProcessor {
		constructor()
		load(path: string): Promise<void> // Assuming load returns a Promise<void>
		encodeIds(input: string): number[] // Based on usage in localModelTier.ts
		decode(ids: number[]): string // Based on usage in localModelTier.ts
		// Add other methods/properties if known or needed
	}

	// If there are other exports, declare them here.
	// For example, if there's also a top-level load function:
	// export function load(path: string): Promise<SentencePieceProcessor>;
}
