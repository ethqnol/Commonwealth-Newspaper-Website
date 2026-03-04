/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.ts'],
    globals: {
        'ts-jest': {
            tsconfig: './tsconfig.test.json',
        },
    },
    // Generous timeout — emulator-backed tests can be slow on cold start
    testTimeout: 20000,
};
