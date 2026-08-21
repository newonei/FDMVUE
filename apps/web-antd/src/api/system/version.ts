import { requestClient } from '#/api/request';

export namespace SystemVersionApi {
  /** 当前运行后端的构建标识 */
  export interface BuildInfo {
    application: string;
    buildTime: string;
    commit: string;
    commitTime: string;
    runId: string;
    runNumber: string;
    version: string;
  }
}

/** 读取后端实际运行的构建版本；旧服务不存在该接口时由页面静默降级。 */
export function getSystemBuildInfo() {
  return requestClient.get<SystemVersionApi.BuildInfo>('/system/version', {
    silent: true,
  });
}
