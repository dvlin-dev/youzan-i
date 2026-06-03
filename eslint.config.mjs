import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // 工程规范基线（对齐 voyager）：低摩擦严格规则。布尔前缀命名 / switch 穷尽等 type-aware
  // 规则待存量渐进开启，见 docs/reference/coding-conventions.md。
  {
    rules: {
      eqeqeq: ["error", "always", { null: "never" }],
      "no-console": "error",
      "no-else-return": "error",
      "object-shorthand": "error",
      "prefer-object-spread": "error",
      "no-array-constructor": "error",
      "default-case-last": "error",
      "dot-notation": "error",
      "@typescript-eslint/array-type": "error",
      "@typescript-eslint/no-inferrable-types": "error",
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "typeLike", format: ["PascalCase"] },
        {
          selector: "interface",
          format: ["PascalCase"],
          custom: { regex: "^I[A-Z]", match: false },
        },
      ],
    },
  },
  // console 是审计 sink 与 CLI 脚本的正当输出口，放行这几处。
  {
    files: ["lib/db/seed.ts", "lib/db/setup-readonly.ts", "lib/ai/audit.ts"],
    rules: { "no-console": "off" },
  },
]);

export default eslintConfig;
