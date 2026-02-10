export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
        '(.+)\\.js': '$1',
    },
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                useESM: true,
                tsconfig: {
                    module: 'NodeNext',
                    moduleResolution: 'NodeNext',
                    isolatedModules: true,
                },
            },
        ],
    },
    testMatch: ['**/tests/**/*.test.ts'],
    collectCoverageFrom: ['sr/**/*.ts'],
    coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
};
