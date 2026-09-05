import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import eslintConfigPrettier from "eslint-config-prettier";

/**
 * Architectural boundaries from docs/STANDARDS.md §1. Each layer lists the
 * import-source glob patterns it may NOT reach for. Enforced as errors — a
 * boundary violation fails the lint. Test files are exempt (they load fixtures
 * from disk and are never bundled into a layer).
 */
const BOUNDARIES = [
  {
    name: "core",
    files: ["src/core/**/*.{ts,tsx}"],
    forbid: [
      "**/agent/**",
      "**/main/**",
      "**/preload/**",
      "**/renderer/**",
      "**/shared/**",
      "electron",
      "react",
      "react-dom",
      "pixi.js",
      "pixi.js/*",
      "@anthropic-ai/*",
      "node:*",
    ],
  },
  {
    name: "agent",
    files: ["src/agent/**/*.{ts,tsx}"],
    forbid: ["**/main/**", "**/preload/**", "**/renderer/**", "electron"],
  },
  {
    name: "main",
    files: ["src/main/**/*.{ts,tsx}"],
    forbid: ["**/preload/**", "**/renderer/**"],
  },
  {
    name: "preload",
    files: ["src/preload/**/*.{ts,tsx}"],
    forbid: ["**/agent/**", "**/main/**", "**/renderer/**"],
  },
  {
    name: "renderer",
    files: ["src/renderer/**/*.{ts,tsx}"],
    forbid: ["**/agent/**", "**/main/**", "**/preload/**", "electron", "node:*"],
  },
];

const boundaryConfigs = BOUNDARIES.map((b) => ({
  files: b.files,
  ignores: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: b.forbid,
            message: `Import boundary (STANDARDS.md §1): ${b.name}/ may not import this.`,
          },
        ],
      },
    ],
  },
}));

export default tseslint.config(
  {
    ignores: [
      "out/**",
      "dist/**",
      "node_modules/**",
      "*.config.ts",
      "*.config.js",
      "eslint.config.js",
      "scripts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Index-signature access via brackets is idiomatic for our
      // `Record<string, unknown>` tool inputs and `process.env`.
      "@typescript-eslint/dot-notation": ["error", { allowIndexSignaturePropertyAccess: true }],
      // Numbers and booleans in template literals are fine (hues, seq numbers).
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
      // Global default is "warn" during the Phase 1.5 refactor; promoted to
      // "error" per directory as each slice brings it to spec (see below).
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      // An empty arrow is a deliberate noop here (`.catch(() => {})` to swallow,
      // a ref's initial callback). Empty named functions still flag.
      "@typescript-eslint/no-empty-function": ["error", { allow: ["arrowFunctions"] }],
      // `async` with no `await` is used on purpose to pin a Promise return shape
      // (IPC handlers, `followUp`); this rule fights that with no safety gain.
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs["recommended-latest"].rules,
      // The Pixi map writes refs during render on purpose (it needs the latest
      // world inside an async init callback). Flagged here as a warning until
      // the renderer refactor (Phase 1.5 Slice 7) moves it into an effect.
      "react-hooks/refs": "warn",
    },
  },
  ...boundaryConfigs,
  {
    // Directories brought fully to STANDARDS.md §4 — explicit return types on
    // every export are now enforced, not just warned. Extended per slice.
    files: ["src/core/**/*.ts"],
    ignores: ["src/core/**/__tests__/**"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
    },
  },
  {
    files: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
    },
  },
  eslintConfigPrettier,
);
