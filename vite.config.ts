import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * One codebase, two builds:
 *   npm run build            -> dist/web        (hosted web app / PWA)
 *   npm run build:extension  -> dist/extension  (Chrome side-panel extension, load unpacked)
 */
export default defineConfig(({ mode }) => {
  const isExtension = mode === 'extension';

  return {
    plugins: [react()],
    base: isExtension ? './' : '/',
    publicDir: isExtension ? 'extension/public' : 'public',
    define: {
      __PLATFORM__: JSON.stringify(isExtension ? 'extension' : 'web'),
    },
    build: {
      outDir: isExtension ? 'dist/extension' : 'dist/web',
      emptyOutDir: true,
      target: 'es2022',
      chunkSizeWarningLimit: 1200,
      rolldownOptions: isExtension
        ? {
            input: {
              sidepanel: `${root}sidepanel.html`,
              background: `${root}extension/background.ts`,
            },
            output: {
              entryFileNames: (chunk: { name: string }) =>
                chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
            },
          }
        : undefined,
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
