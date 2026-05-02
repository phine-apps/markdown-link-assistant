import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['out/', 'dist/', '**/*.d.ts'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { 
          'args': 'all',
          'argsIgnorePattern': '^_',
          'vars': 'all',
          'varsIgnorePattern': '^_',
          'caughtErrors': 'all',
          'caughtErrorsIgnorePattern': '^_'
        }
      ],
      '@typescript-eslint/naming-convention': 'warn',
      'curly': 'warn',
      'eqeqeq': 'warn',
      'no-throw-literal': 'warn',
      'semi': ['warn', 'always'],
    },
  },
  {
    files: ['src/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
