import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import importX from "eslint-plugin-import-x";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// @type {import("eslint").Linter.Config[]}

export const config = tseslint.config([
  globalIgnores(["node_modules/**", "cdk.out/**"]),
  {
    plugins: {
      "import-x": importX,
      "@typescript-eslint": tseslint.plugin
    },
    languageOptions: {
      parserOptions: {
        projectService: true
      }
    }
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  eslintConfigPrettier,
  {
    rules: {
      curly: ["error", "all"],
      eqeqeq: "error",
      "func-style": "error",
      "import-x/consistent-type-specifier-style": ["error", "prefer-top-level"],
      "import-x/newline-after-import": ["error"],
      "import-x/no-duplicates": ["error"],
      "import-x/order": [
        "error",
        {
          "newlines-between": "always",
          // Two blocks only — third-party, then everything of ours. Within our block the
          // pathGroups order it @/ → ../ → ./, matching TypeScript's organize-imports, and
          // `distinctGroup: false` keeps that from splitting the block up with blank lines.
          groups: [
            ["builtin", "external"],
            ["internal", "parent", "sibling", "index"]
          ],
          distinctGroup: false,
          pathGroups: [
            { pattern: "@/**", group: "internal", position: "before" },
            { pattern: "../**", group: "internal", position: "before" }
          ],
          alphabetize: {
            order: "asc",
            caseInsensitive: true
          }
        }
      ],
      "no-useless-escape": "error",
      "no-useless-return": "error",
      "no-var": "error",
      "prefer-arrow-callback": "error",
      "prefer-const": "error",
      "prefer-object-spread": "error",
      "prefer-regex-literals": "error",
      "prefer-template": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            arguments: false,
            attributes: false
          }
        }
      ],
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ]
    }
  },

  /*
   * Dependency direction: types → utils → models → services → components.
   *
   * A deeper layer may *name* an upper layer's types — those are erased at
   * compile time and cost nothing at runtime. It must not import a **value**,
   * because that is what creates a real runtime edge, and via a barrel
   * (`@/models` → capabilities → Container → ...) an easy cycle. Cycles here
   * don't fail loudly; they surface as an `undefined` class at module-init time,
   * far from the import that caused them.
   *
   * So `allowTypeImports: true` throughout: the rule polices runtime coupling,
   * not vocabulary. If a deeper module needs a value from a shallower one, the
   * code belongs in the shallower layer — see
   * `models/capabilities/validation.ts`, which moved out of `utils/` for exactly
   * this reason.
   */
  {
    files: ["src/types/**/*.ts", "src/utils/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/models", "@/models/**", "@/services", "@/services/**", "**/models/**", "**/services/**"],
              allowTypeImports: true,
              message:
                "types/ and utils/ sit below models/ and services/. Import a type if you need the vocabulary; if you need a value, move the code up into models/."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["src/models/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/services", "@/services/**", "**/services/**"],
              allowTypeImports: true,
              message:
                "models/ sits below services/. A model may hold a typed reference to its store, but importing a service value inverts the layering."
            }
          ]
        }
      ]
    }
  }
]);

// ESLint's flat-config loader reads the default export of this file.
export default config;
