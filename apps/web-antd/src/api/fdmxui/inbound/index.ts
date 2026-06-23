import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmxuiInboundApi {
  export interface Inbound {
    id?: number;
    panelId?: number;
    panelName?: string;
    xuiInboundId?: number;
    nodeId?: number;
    remark?: string;
    tag?: string;
    protocol?: string;
    port?: number;
    ssMethod?: string;
    tlsFlowCapable?: boolean;
    available?: boolean;
    lastSyncTime?: string;
    lastSyncError?: string;
    createTime?: string;
    updateTime?: string;
  }
}

export function getFdmxuiInboundPage(params: PageParam) {
  return requestClient.get<PageResult<FdmxuiInboundApi.Inbound>>(
    '/fdmxui/inbound/page',
    { params },
  );
}

export function getSimpleFdmxuiInboundList(panelId: number) {
  return requestClient.get<FdmxuiInboundApi.Inbound[]>(
    `/fdmxui/inbound/simple-list?panelId=${panelId}`,
  );
}

export function syncFdmxuiInbound(panelId: number) {
  return requestClient.post<number>(`/fdmxui/inbound/sync?panelId=${panelId}`);
}
