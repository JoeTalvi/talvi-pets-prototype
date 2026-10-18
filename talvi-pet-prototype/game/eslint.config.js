import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'tests/view/phaserMocks.js'] },
  ...tseslint.configs.recommended,
  { files: ['src/**/*.ts', 'tests/**/*.ts'], rules: { 'no-console': 'error', 'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }] } },
  { files: ['src/sim/**/*.ts', 'src/content/**/*.ts'], rules: { 'no-restricted-imports': ['error', { patterns: ['phaser', '@app/*', '@view/*', '@ui/*', '**/app/**', '**/view/**', '**/ui/**'] }], 'no-restricted-globals': ['error', 'window', 'document'], 'no-restricted-properties': ['error', { object: 'Date', property: 'now' }, { object: 'Math', property: 'random' }] } },
  { files: ['src/ui/**/*.ts'], rules: { 'no-restricted-imports': ['error', { patterns: ['phaser', '**/rules/**'] }] } },
  { files: ['src/view/**/*.ts'], rules: { 'no-restricted-imports': ['error', { patterns: ['**/rules/**'] }] } },
  { files: ['src/app/log.ts', 'src/ui/panels/errorScreen.ts'], rules: { 'no-console': 'off' } }
);
