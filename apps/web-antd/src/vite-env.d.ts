interface ImportMetaEnv {
  /** Infinite Canvas 独立服务地址；未配置时使用当前主机的 3001 端口。 */
  readonly VITE_INFINITE_CANVAS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
