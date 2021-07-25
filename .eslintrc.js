module.exports = {
    env: {
        browser: true,
        commonjs: true,
        es2021: true
    },
    extends: [
        "standard"
    ],
    parserOptions: {
        ecmaVersion: 12
    },
    rules: {
        indent: ["error", 4],
        semi: ["error", "always"],
        quotes: ["error", "double"],
        "brace-style": ["error", "stroustrup", {allowSingleLine: true}],
        "comma-dangle": ["error", "only-multiline"],
        "padded-blocks": ["off"],
        "space-before-function-paren": ["error", "never"],
        "no-multiple-empty-lines": ["error", {max: 2}],
        "object-curly-spacing": ["error", "never"],
        "block-spacing": ["error", "never"],
    },
};
