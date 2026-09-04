import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmDashboardApi {
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

  /** 当前租户可见的已发布公告 */
  export interface Notice {
    content: string;
    createTime?: Date;
    id?: number;
    status: number;
    title: string;
    type: number;
  }
}

/** 查询当前租户的已发布公告。 */
export function getFdmDashboardPublishedNoticePage(params: PageParam) {
  return requestClient.get<PageResult<FdmDashboardApi.Notice>>(
    '/fdmdata/dashboard/notice/published-page',
    { params },
  );
}

/** 读取后端实际运行的构建版本。 */
export function getFdmDashboardBuildInfo() {
  return requestClient.get<FdmDashboardApi.BuildInfo>(
    '/fdmdata/dashboard/version',
    { silent: true },
  );
}
