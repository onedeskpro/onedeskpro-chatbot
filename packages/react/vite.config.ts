import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/index.ts', import.meta.url)),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      // Keep the core as a real dependency rather than inlining a second copy —
      // a bundled duplicate would mean two ChatbotCore classes at runtime.
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@onedeskpro/chatbot-core',
        '@onedeskpro/chatbot-types',
      ],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'jsxRuntime',
        },
      },
    },
  },
  plugins: [
    react(),
    dts({ insertTypesEntry: true, bundleTypes: true }),
  ],
});
