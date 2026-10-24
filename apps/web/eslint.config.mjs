import tseslint from "typescript-eslint";

/**
 * Module boundaries (docs/toolbox-architecture-plan.md, section 2.2):
 *   src/tools/<id>  may import src/platform, components/ui, lib and hooks; never another tool, never route files
 *   src/platform    never imports a tool, except shell/registry.ts which lists them
 *   summaries       depend on documents, never on the viewer code in reading/
 */
export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**", "public/**"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "off",
      "prefer-const": "warn",
    },
  },
  {
    files: ["src/tools/reader/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@tools/(?!reader(/|$))",
              message: "A tool never imports another tool; go through the platform.",
            },
            {
              group: ["@/app", "@/app/*", "@/app/**"],
              message: "Tools do not import route files.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/platform/**/*.{ts,tsx}"],
    ignores: ["src/platform/shell/registry.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@tools/*", "@tools/**"],
              message: "The platform never depends on a tool; only shell/registry.ts lists them.",
            },
            {
              group: ["@/app", "@/app/*", "@/app/**"],
              message: "The platform does not import route files.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/tools/reader/summaries/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/reading/**", "../reading", "../reading/*"],
              message: "Summaries depend on documents, never on the viewer.",
            },
          ],
        },
      ],
    },
  }
);
