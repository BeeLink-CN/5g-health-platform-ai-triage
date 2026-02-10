import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.d.ts', 'src/index.ts'],
        },
    },
    resolve: {
        alias: {
            // Map .js imports to .ts files for ESM compatibility
            ...Object.fromEntries(
                ['src'].map(dir => [
                    path.resolve(__dirname, dir),
                    path.resolve(__dirname, dir)
                ])
            ),
        },
        extensions: ['.ts', '.js', '.json'],
    },
});
