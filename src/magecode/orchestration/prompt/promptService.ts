import { ModelTier } from "../interfaces"

/**
 * Service responsible for formatting prompts based on the target model tier.
 * Currently, it acts as a pass-through but provides the structure for
 * future tier-specific prompt adjustments.
 */
export class PromptService {
	/**
	 * Formats the prompt for the specified model tier.
	 * @param prompt The original prompt string.
	 * @param tier The target model tier (LOCAL or CLOUD).
	 * @returns The formatted prompt string.
	 */
	formatPrompt(prompt: string, tier: ModelTier): string {
		console.log(`[PromptService] Formatting prompt for tier: ${tier}`)
		// TODO: Implement tier-specific formatting logic if needed in the future.
		// For now, just return the original prompt.
		return prompt
	}
}
