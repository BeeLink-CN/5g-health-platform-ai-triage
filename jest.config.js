export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
    moduleNameMapper: {
        '^((?:\\.{1,2}\\/)+.*)\\.js$': '$1',
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
    collectCoverageFrom: ['src/**/*.ts'],
    coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
};
