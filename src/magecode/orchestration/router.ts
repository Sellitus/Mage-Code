import { getModelPreference } from "../config/settings"
import { ModelTier, RouterOptions, TaskType } from "./interfaces"

// Simple heuristic constants
const LOCAL_PROMPT_LENGTH_THRESHOLD = 1000 // Characters
const CLOUD_TASK_TYPES = ["codeGeneration", "complexReasoning"] // Example task types favoring cloud

/**
 * Determines the appropriate model tier (Local vs. Cloud) for a given request.
 */
export class ModelRouter {
	/**
	 * Classifies the task based on simple heuristics (prompt length, task type).
	 * This is a basic implementation and can be expanded later.
	 * @param prompt The input prompt.
	 * @param options Router options containing task type.
	 * @returns The heuristically determined ModelTier.
	 */
	private classifyTask(prompt: string, options: RouterOptions): ModelTier {
		// Favor cloud for specific complex task types
		// Ensure taskType is defined and included before checking
		if (typeof options.taskType === "string" && CLOUD_TASK_TYPES.includes(options.taskType)) {
			return ModelTier.CLOUD
		}

		// Favor cloud for longer prompts
		if (prompt.length > LOCAL_PROMPT_LENGTH_THRESHOLD) {
			return ModelTier.CLOUD
		}

		// Default to local for shorter prompts and non-complex tasks
		return ModelTier.LOCAL
	}

	/**
	 * Routes the request to the appropriate model tier based on classification
	 * and user preference.
	 * @param task The type of task (optional, used for classification).
	 * @param prompt The input prompt string.
	 * @param options Options for routing, including taskType.
	 * @returns A Promise resolving to the selected ModelTier.
	 */
	async routeRequest(
		task: TaskType | undefined, // Keep 'task' param if needed elsewhere, but use options.taskType
		prompt: string,
		options: RouterOptions,
	): Promise<ModelTier> {
		const userPreference = getModelPreference() // e.g., "auto", "forceLocal", "forceCloud", "preferLocal", "preferCloud"

		// Handle forced preferences first
		if (userPreference === "forceLocal") {
			return ModelTier.LOCAL
		}
		if (userPreference === "forceCloud") {
			return ModelTier.CLOUD
		}

		// Determine heuristic choice
		// Pass taskType from options, falling back to the task parameter if necessary
		const heuristicTier = this.classifyTask(prompt, { ...options, taskType: options.taskType ?? task })

		// Apply preference if not "auto"
		if (userPreference === "preferLocal") {
			return ModelTier.LOCAL // Always prefer local if specified
		}
		if (userPreference === "preferCloud") {
			return ModelTier.CLOUD // Always prefer cloud if specified
		}

		// Default to heuristic choice ("auto" preference)
		return heuristicTier
	}
}
