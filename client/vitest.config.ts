import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolves the path aliases declared in tsconfig.json. Requires Vite 8,
    // which ships this option.
    tsconfigPaths: true,
  },
  test: {
    // globals: true lets @testing-library/react register its automatic cleanup
    // on the global afterEach; specs still import describe/it/expect from
    // "vitest" so they typecheck without extra tsconfig types.
    globals: true,
    environment: "jsdom",
    include: ["**/*.spec.{ts,tsx}"],
  },
});
