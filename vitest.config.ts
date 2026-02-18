import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node", // Changed to node for database tests
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "test/**/*.{test,spec}.{ts,tsx}"
    ],
    testTimeout: 10000, // 10 second timeout for database operations
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
