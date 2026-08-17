import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

// Flat config (T003 / AC9.2). Formatting is owned by Prettier (`format:check`);
// `skipFormatting` turns off any stylistic rules that would conflict.
export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },
  {
    name: 'app/ignores',
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'playwright-report/**'],
  },
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  skipFormatting,
  {
    name: 'app/security-rules',
    rules: {
      // XSS: never bind untrusted (market/AI) strings as raw HTML (S2 / T2).
      'vue/no-v-html': 'error',
      // XSS guard (S9): forbid writing to innerHTML/outerHTML/insertAdjacentHTML
      // — external data must go through text interpolation / textContent.
      'no-restricted-syntax': [
        'error',
        {
          selector: "AssignmentExpression > MemberExpression[property.name='innerHTML']",
          message:
            'Assigning innerHTML risks XSS on external data (S9). Use text interpolation or textContent.',
        },
        {
          selector: "AssignmentExpression > MemberExpression[property.name='outerHTML']",
          message: 'Assigning outerHTML risks XSS on external data (S9). Use safe DOM APIs.',
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message:
            'insertAdjacentHTML risks XSS on external data (S9). Build nodes explicitly instead.',
        },
      ],
    },
  },
)
