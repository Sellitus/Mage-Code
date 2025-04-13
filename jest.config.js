module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>/src"],
	testMatch: ["**/*.test.ts"],
	moduleNameMapper: {
		"^@src/(.*)$": "<rootDir>/src/$1",
		"^@core/(.*)$": "<rootDir>/src/core/$1",
		"^@codeweaver/(.*)$": "<rootDir>/src/codeweaver/$1",
		"^@interfaces/(.*)$": "<rootDir>/src/interfaces/$1",
	},
	modulePathIgnorePatterns: ["<rootDir>/out/", "<rootDir>/dist/"],
	setupFilesAfterEnv: ["<rootDir>/src/core/webview/tests/testSetup.ts"],
	globals: {
		"ts-jest": {
			tsconfig: "tsconfig.json",
		},
	},
}
