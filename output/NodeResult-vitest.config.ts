import { createRequire } from 'node:module';

import { mergeConfig } from 'vitest/config';
import baseConfig from '../vitest.config';

const appRequire = createRequire(new URL('../apps/web-antd/package.json', import.meta.url));

export default mergeConfig(baseConfig, {
  resolve: {
    alias: [{ find: /^vue$/, replacement: appRequire.resolve('vue') }],
    dedupe: ['vue', '@vue/runtime-core', '@vue/runtime-dom', '@vue/reactivity', '@vue/shared'],
  },
  test: {
    server: {
      deps: {
        inline: [/vue/, /ant-design/],
      },
    },
  },
});
