import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // App provides these — never bundle them into the library.
  external: ["react", "react-dom", "@supabase/supabase-js"],
  // Excalidraw + its CSS ship with the lib (whiteboard is a core feature).
  loader: { ".css": "css" },
});
