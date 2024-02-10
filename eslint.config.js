const eslintrc = require("@eslint/eslintrc");
const parserTypeScript = require("@typescript-eslint/parser");
const pluginTypeScript = require("@typescript-eslint/eslint-plugin");
const pluginStylistic = require("@stylistic/eslint-plugin");

/** @type {import("eslint").Linter.FlatConfig[]} */
module.exports = [
    {
        files: ["src/**/*.ts", "*.config.js"],
        languageOptions: {
            parser: parserTypeScript,
        },
        ...pluginStylistic.configs.customize({
            indent: 4,
            quotes: "double",
            semi: true,
            jsx: true,
            arrowParens: true,
            braceStyle: "1tbs",
            blockSpacing: true,
            quoteProps: "consistent",
            commaDangle: "always-multiline",
        }),
    },
    ...new eslintrc.FlatCompat().plugins("@typescript-eslint"),
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parser: parserTypeScript,
            parserOptions: {
                project: true,
            },
        },
        rules: {
            ...pluginTypeScript.configs["recommended-type-checked"].rules,
        },
    },
];
