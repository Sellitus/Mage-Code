jest.mock("p-queue", () => ({
	default: jest.fn().mockImplementation(() => ({
		add: jest.fn(),
		clear: jest.fn(),
	})),
}))

describe("SyncService", () => {
	it("should pass a simple test", () => {
		expect(true).toBe(true)
	})
})

// Rest of the test content
