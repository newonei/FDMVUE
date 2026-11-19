import { fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const path = (name: string) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  root: path('./'),
  base: './',
  plugins: [vue()],
  server: { host: '127.0.0.1', port: 5178, strictPort: true },
  build: {
    rolldownOptions: {
      input: { payroll: path('index.html'), slip: path('slip.html') },
    },
  },
});
