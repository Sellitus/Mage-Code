import { ModelRouter } from "../router"
import { ModelTier, RouterOptions } from "../interfaces"
import * as settings from "../../config/settings"

// Mock the settings module
jest.mock("../../config/settings")
const mockedGetModelPreference = jest.spyOn(settings, "getModelPreference")

describe("ModelRouter", () => {
	let modelRouter: ModelRouter

	beforeEach(() => {
		modelRouter = new ModelRouter()
		// Reset mocks before each test
		mockedGetModelPreference.mockClear()
	})

	// Helper function for routing tests
	const testRoute = async (preference: string, prompt: string, options: RouterOptions, expectedTier: ModelTier) => {
		mockedGetModelPreference.mockReturnValue(preference)
		const tier = await modelRouter.routeRequest(options.taskType, prompt, options)
		expect(tier).toBe(expectedTier)
		expect(mockedGetModelPreference).toHaveBeenCalledTimes(1)
	}

	// --- Preference Tests ---
	test("should route to LOCAL when preference is forceLocal", async () => {
		await testRoute("forceLocal", "short prompt", {}, ModelTier.LOCAL)
	})

	test("should route to CLOUD when preference is forceCloud", async () => {
		await testRoute("forceCloud", "short prompt", {}, ModelTier.CLOUD)
	})

	test("should route to LOCAL when preference is preferLocal", async () => {
		await testRoute("preferLocal", "long prompt ".repeat(100), {}, ModelTier.LOCAL) // Heuristic would choose CLOUD
	})

	test("should route to CLOUD when preference is preferCloud", async () => {
		await testRoute("preferCloud", "short prompt", {}, ModelTier.CLOUD) // Heuristic would choose LOCAL
	})

	// --- Heuristic Tests (Auto Preference) ---
	test("should route short prompt to LOCAL with auto preference", async () => {
		await testRoute("auto", "Explain this code.", { taskType: "explanation" }, ModelTier.LOCAL)
	})

	test("should route long prompt to CLOUD with auto preference", async () => {
		const longPrompt = "Generate a complex React component with state management... ".repeat(50) // > 1000 chars
		await testRoute("auto", longPrompt, { taskType: "codeGeneration" }, ModelTier.CLOUD)
	})

	test("should route specific complex taskType to CLOUD with auto preference (short prompt)", async () => {
		await testRoute("auto", "Generate code.", { taskType: "codeGeneration" }, ModelTier.CLOUD)
	})

	test("should route non-complex taskType to LOCAL with auto preference (short prompt)", async () => {
		await testRoute("auto", "Summarize this.", { taskType: "summarization" }, ModelTier.LOCAL)
	})

	test("should route to LOCAL with auto preference if taskType is undefined (short prompt)", async () => {
		await testRoute("auto", "Short question?", {}, ModelTier.LOCAL)
	})

	test("should route to CLOUD with auto preference if taskType is undefined (long prompt)", async () => {
		const longPrompt = "Very long question that needs a detailed answer... ".repeat(50)
		await testRoute("auto", longPrompt, {}, ModelTier.CLOUD)
	})
})
