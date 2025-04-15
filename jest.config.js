/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	transform: {
		// Transform both .ts/.tsx and .js files (including those in node_modules ignored by transformIgnorePatterns)
		"^.+\\.(t|j)sx?$": [
			"ts-jest",
			{
				tsconfig: {
					module: "CommonJS",
					moduleResolution: "node",
					esModuleInterop: true,
					allowJs: true, // Allow processing JS files
				},
				diagnostics: false,
				isolatedModules: true,
			},
		],
	},
	testMatch: ["**/__tests__/**/*.test.ts"],
	// Platform-specific test configuration
	testPathIgnorePatterns: [
		// Skip platform-specific tests based on environment
		...(process.platform === "win32" ? [".*\\.bash\\.test\\.ts$"] : [".*\\.cmd\\.test\\.ts$"]),
		// PowerShell tests are conditionally skipped in the test files themselves using the setupFilesAfterEnv
	],
	moduleNameMapper: {
		"^vscode$": "<rootDir>/src/__mocks__/vscode.js",
		"@modelcontextprotocol/sdk$": "<rootDir>/src/__mocks__/@modelcontextprotocol/sdk/index.js",
		"@modelcontextprotocol/sdk/(.*)": "<rootDir>/src/__mocks__/@modelcontextprotocol/sdk/$1",
		"^delay$": "<rootDir>/src/__mocks__/delay.js",
		"^p-wait-for$": "<rootDir>/src/__mocks__/p-wait-for.js",
		"^globby$": "<rootDir>/src/__mocks__/globby.js",
		"^serialize-error$": "<rootDir>/src/__mocks__/serialize-error.js",
		"^strip-ansi$": "<rootDir>/src/__mocks__/strip-ansi.js",
		"^default-shell$": "<rootDir>/src/__mocks__/default-shell.js",
		"^os-name$": "<rootDir>/src/__mocks__/os-name.js",
		"^strip-bom$": "<rootDir>/src/__mocks__/strip-bom.js",
		"^voy-search$": "<rootDir>/src/__mocks__/voy-search.js",
		// Map ESM modules to prevent SyntaxError during tests
		"^p-queue$": "<rootDir>/src/__mocks__/dummyMock.js", // Use a generic dummy mock
		"^piscina$": "<rootDir>/src/__mocks__/dummyMock.js", // Use a generic dummy mock
	},
	transformIgnorePatterns: [
		"node_modules/(?!(@modelcontextprotocol|delay|p-wait-for|globby|serialize-error|strip-ansi|default-shell|os-name|strip-bom|p-queue|piscina)/)",
	],
	roots: ["<rootDir>/src", "<rootDir>/webview-ui/src"],
	modulePathIgnorePatterns: [".vscode-test"],
	reporters: [["jest-simple-dot-reporter", {}]],
	setupFiles: ["<rootDir>/src/__mocks__/jest.setup.ts"],
	setupFilesAfterEnv: ["<rootDir>/src/integrations/terminal/__tests__/setupTerminalTests.ts"],
}
