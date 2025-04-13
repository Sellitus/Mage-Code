import { MageParser } from "./parser/index"
import { DatabaseManager } from "./storage/databaseManager"
import { processAndStoreFile } from "./index"
import * as fs from "fs"
import * as path from "path"

describe("processAndStoreFile integration", () => {
	const testFilePath = path.join(__dirname, "test-sample.ts")
	let parser: MageParser
	let dbManager: DatabaseManager

	beforeAll(async () => {
		// Write a simple TypeScript file for testing
		fs.writeFileSync(
			testFilePath,
			`
      class MyClass {
        myMethod() { return 42; }
      }
      function topLevel() { return 1; }
      const x = 5;
      `,
		)
		await MageParser.initialize()
		parser = new MageParser()
		dbManager = new DatabaseManager()
		dbManager.initialize()
	})

	afterAll(() => {
		if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath)
		dbManager.dispose()
	})

	it("parses, extracts, and stores code elements from a file", async () => {
		const result = await processAndStoreFile(testFilePath, parser, dbManager)
		expect(result.success).toBe(true)
		const elements = dbManager.getCodeElementsByFilePath(testFilePath)
		expect(elements.length).toBeGreaterThan(0)
		// Should include class, method, function, variable
		const types = elements.map((e) => e.type)
		expect(types).toContain("class")
		expect(types).toContain("function")
		expect(types).toContain("variable")
		// Should include correct names
		const names = elements.map((e) => e.name)
		expect(names).toContain("MyClass")
		expect(names).toContain("myMethod")
		expect(names).toContain("topLevel")
	})
})
