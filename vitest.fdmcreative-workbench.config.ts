import { createRequire } from 'node:module';

import { mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config';

// The app may resolve dependencies through a managed worktree. Component tests
// must share its Vue instance, including Ant Design and X6's Vue node renderer.
const appRequire = createRequire(
  new URL('apps/web-antd/package.json', import.meta.url),
);

export default mergeConfig(baseConfig, {
  resolve: {
    alias: [{ find: /^vue$/, replacement: appRequire.resolve('vue') }],
    dedupe: [
      'vue',
      '@vue/runtime-core',
      '@vue/runtime-dom',
      '@vue/reactivity',
      '@vue/shared',
    ],
  },
  test: {
    include: [
      'apps/web-antd/src/views/fdmcreative/workbench/editor/**/*.test.ts',
    ],
    server: {
      deps: {
        inline: [/vue/, /ant-design/, /@antv\/x6/],
      },
    },
  },
});
