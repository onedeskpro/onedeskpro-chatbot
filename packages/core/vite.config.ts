import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/index.ts', import.meta.url)),
      name: 'OnedeskProChatbot',
      formats: ['es', 'cjs', 'iife'],
      fileName: (format) => {
        if (format === 'iife') return 'index.iife.js';
        if (format === 'es') return 'index.js';
        return 'index.cjs';
      },
    },
    rollupOptions: {
      // Zero external deps — self-contained for CDN IIFE build
    },
  },
  plugins: [
    dts({
      insertTypesEntry: true,
      bundleTypes: true,
    }),
  ],
});
