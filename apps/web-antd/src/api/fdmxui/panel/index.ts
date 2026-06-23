import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmxuiPanelApi {
  export interface Panel {
    id?: number;
    panelName?: string;
    panelUrl?: string;
    apiToken?: string;
    hasApiToken?: boolean;
    webBasePath?: string;
    subBaseUrl?: string;
    subPath?: string;
    jsonPath?: string;
    clashPath?: string;
    enabled?: boolean;
    connectionStatus?: number;
    lastCheckTime?: string;
    lastError?: string;
    remark?: string;
    createTime?: string;
    updateTime?: string;
  }
}

export function getFdmxuiPanelPage(params: PageParam) {
  return requestClient.get<PageResult<FdmxuiPanelApi.Panel>>(
    '/fdmxui/panel/page',
    { params },
  );
}

export function getFdmxuiPanel(id: number) {
  return requestClient.get<FdmxuiPanelApi.Panel>(`/fdmxui/panel/get?id=${id}`);
}

export function getSimpleFdmxuiPanelList() {
  return requestClient.get<FdmxuiPanelApi.Panel[]>(
    '/fdmxui/panel/simple-list',
  );
}

export function createFdmxuiPanel(data: FdmxuiPanelApi.Panel) {
  return requestClient.post<number>('/fdmxui/panel/create', data);
}

export function updateFdmxuiPanel(data: FdmxuiPanelApi.Panel) {
  return requestClient.put<boolean>('/fdmxui/panel/update', data);
}

export function checkFdmxuiPanelConnection(id: number) {
  return requestClient.post<boolean>(`/fdmxui/panel/check-connection?id=${id}`);
}

export function deleteFdmxuiPanel(id: number) {
  return requestClient.delete<boolean>(`/fdmxui/panel/delete?id=${id}`);
}

export function exportFdmxuiPanelExcel(params: Record<string, unknown>) {
  return requestClient.download('/fdmxui/panel/export-excel', { params });
}
