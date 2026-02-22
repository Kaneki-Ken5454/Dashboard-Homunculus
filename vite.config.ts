import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Required for @neondatabase/serverless to work in the browser
  define: {
    global: 'globalThis',
  },
});
