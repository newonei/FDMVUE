import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
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
        },
      },
    },
  };
});
