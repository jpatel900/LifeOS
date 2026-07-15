import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      // D-13 (#483): next/font/local is rewritten by the Next SWC plugin at
      // build time and is not callable under vitest, so importing app/layout.tsx
      // throws without this. See the stub for the full rationale.
      "next/font/local": resolve(
        __dirname,
        "./src/testing/nextFontLocalStub.ts",
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
