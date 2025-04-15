import { PromptService } from "../promptService"
import { ModelTier } from "../../interfaces"

describe("PromptService", () => {
	let promptService: PromptService

	beforeEach(() => {
		promptService = new PromptService()
	})

	test("should return the original prompt for LOCAL tier", () => {
		const originalPrompt = "This is a test prompt."
		const formattedPrompt = promptService.formatPrompt(originalPrompt, ModelTier.LOCAL)
		expect(formattedPrompt).toBe(originalPrompt)
	})

	test("should return the original prompt for CLOUD tier", () => {
		const originalPrompt = "Another test prompt."
		const formattedPrompt = promptService.formatPrompt(originalPrompt, ModelTier.CLOUD)
		expect(formattedPrompt).toBe(originalPrompt)
	})

	test("should handle empty prompts", () => {
		const originalPrompt = ""
		const formattedPrompt = promptService.formatPrompt(originalPrompt, ModelTier.LOCAL)
		expect(formattedPrompt).toBe(originalPrompt)
	})
})
