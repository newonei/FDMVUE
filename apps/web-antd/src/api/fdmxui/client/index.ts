import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmxuiClientApi {
  export interface Client {
    id?: number;
    userId?: number;
    userNickname?: string;
    panelId?: number;
    panelName?: string;
    inboundIds?: string | number[];
    xuiInboundIds?: string;
    inboundNames?: string;
    xuiEmail?: string;
    subId?: string;
    uuid?: string;
    totalGb?: number;
    expireTime?: string;
    limitIp?: number;
    status?: number;
    subscriptionUrl?: string;
    jsonSubscriptionUrl?: string;
    clashSubscriptionUrl?: string;
    subLinks?: string;
    lastSyncTime?: string;
    lastSyncError?: string;
    recycledTime?: string;
    remark?: string;
    createTime?: string;
    updateTime?: string;
  }
}

export function getFdmxuiClientPage(params: PageParam) {
  return requestClient.get<PageResult<FdmxuiClientApi.Client>>(
    '/fdmxui/client/page',
    { params },
  );
}

export function getMyFdmxuiClientPage(params: PageParam) {
  return requestClient.get<PageResult<FdmxuiClientApi.Client>>(
    '/fdmxui/client/my-page',
    { params },
  );
}

export function getFdmxuiClient(id: number) {
  return requestClient.get<FdmxuiClientApi.Client>(
    `/fdmxui/client/get?id=${id}`,
  );
}

export function getMyFdmxuiClientLinks(id: number) {
  return requestClient.get<FdmxuiClientApi.Client>(
    `/fdmxui/client/my-links?id=${id}`,
  );
}

export function createFdmxuiClient(data: FdmxuiClientApi.Client) {
  return requestClient.post<number>('/fdmxui/client/create', data);
}

export function refreshFdmxuiClientLinks(id: number) {
  return requestClient.post<boolean>(
    `/fdmxui/client/refresh-links?id=${id}`,
  );
}

export function recycleFdmxuiClient(id: number) {
  return requestClient.post<boolean>(`/fdmxui/client/recycle?id=${id}`);
}
