import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    server: {
      deps: {
        // next-intl ships pre-compiled ESM that imports the bare specifier
        // `next/navigation`; run it through vite so the alias below resolves.
        inline: ["next-intl"],
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      // `server-only` throws outside a Server Component build; stub it so
      // `src/server/data/*` can be unit-tested directly in jsdom.
      "server-only": resolve(__dirname, "./src/test/server-only.ts"),
      "next/navigation": resolve(__dirname, "./node_modules/next/dist/client/components/navigation.js"),
    },
  },
});
