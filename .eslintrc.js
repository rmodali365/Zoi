// Focused lint to enforce the design-system standard. The key rule is
// react-native/no-color-literals (colors must come from @/constants/theme tokens).
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2021, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-native'],
  env: { es2021: true, 'react-native/react-native': true },
  ignorePatterns: ['node_modules/', 'supabase/functions/', 'babel.config.js', '.eslintrc.js'],
  rules: {
    // Design-system guardrails:
    'react-native/no-color-literals': 'error',
    'react-native/no-unused-styles': 'warn',
    'react-native/no-inline-styles': 'warn',
  },
};
