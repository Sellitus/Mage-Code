/**
 * Type definitions for sentencepiece-js
 */

declare module "sentencepiece-js" {
	/**
	 * SentencePiece tokenizer processor
	 */
	export class SentencePieceProcessor {
		/**
		 * Creates a new instance of SentencePieceProcessor
		 */
		constructor()

		/**
		 * Loads a sentencepiece model from the given file path
		 * @param modelPath Path to the model file
		 */
		load(modelPath: string): Promise<void>

		/**
		 * Encodes text into an array of token IDs
		 * @param text Text to encode
		 * @returns Array of token IDs
		 */
		encodeIds(text: string): number[]

		/**
		 * Decodes an array of token IDs back into text
		 * @param ids Array of token IDs to decode
		 * @returns Decoded text
		 */
		decode(ids: number[]): string

		/**
		 * Gets the vocabulary size of the model
		 * @returns Number of tokens in vocabulary
		 */
		getVocabSize(): number
	}
}
