import { fileURLToPath } from 'node:url';

import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      resolve: {
        alias: [
          // 官方 v2026.09 的财务页面引用了不存在的 auxiliary-select-modal.vue（应为 auxiliary-item-select.vue），
          // 官方目录必须与官方代码一致不能直接改，构建时在这里映射；官方修复后删除
          {
            find: /^#\/views\/fms\/config\/auxiliary\/components\/auxiliary-select-modal\.vue$/,
            replacement: fileURLToPath(
              new URL(
                'src/views/fms/config/auxiliary/components/auxiliary-item-select.vue',
                import.meta.url,
              ),
            ),
          },
        ],
      },
      server: {
        allowedHosts: true,
        proxy: {
          '/admin-api': {
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/admin-api/, ''),
            // mock代理目标地址
            target: 'http://localhost:48080/admin-api',
            ws: true,
          },
          '/print-prep-api': {
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/print-prep-api/, ''),
            target: 'http://192.168.10.144:8090',
          },
          '/pattern-recognition-api': {
            changeOrigin: true,
            proxyTimeout: 10 * 60 * 1000,
            rewrite: (path) => path.replace(/^\/pattern-recognition-api/, ''),
            target: 'http://127.0.0.1:8000',
            timeout: 10 * 60 * 1000,
          },
        },
      },
    },
  };
});
