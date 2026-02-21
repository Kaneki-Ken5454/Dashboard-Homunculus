import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Only expose variables explicitly prefixed with VITE_ to the client bundle.
  // DATABASE_URL must NOT be exposed here — it contains DB credentials. Use
  // VITE_DATABASE_URL in your .env file instead.
  envPrefix: ['VITE_'],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
