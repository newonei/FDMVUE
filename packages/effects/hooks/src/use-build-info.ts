import type {
  ApplicationBuildInfo,
  VbenAdminProAppConfigRaw,
} from '@vben/types/global';

const LOCAL_VALUE = 'local';

/**
 * 读取由 CI 注入的构建标识；生产环境从独立运行时配置读取，避免版本信息被旧缓存的 JS 固化。
 */
export function useBuildInfo(
  env: Record<string, any>,
  isProduction: boolean,
): ApplicationBuildInfo {
  const config = isProduction
    ? window._VBEN_ADMIN_PRO_APP_CONF_
    : (env as Partial<VbenAdminProAppConfigRaw>);

  return {
    buildTime: getValue(config.VITE_GLOB_BUILD_TIME),
    commit: getValue(config.VITE_GLOB_BUILD_COMMIT),
    commitTime: getValue(config.VITE_GLOB_BUILD_COMMIT_TIME),
    runId: getValue(config.VITE_GLOB_BUILD_RUN_ID),
    runNumber: getValue(config.VITE_GLOB_BUILD_RUN_NUMBER),
    version: getValue(config.VITE_GLOB_BUILD_VERSION),
  };
}

function getValue(value?: string) {
  return value || LOCAL_VALUE;
}
