import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataExtensionConfigApi {
  export interface ExtensionConfig {
    id?: number;
    channel?: string;
    configKey?: string;
    configVersion?: number;
    configJson?: string;
    enabled?: number;
    remark?: string;
    createTime?: string;
    updateTime?: string;
  }
}

export function getExtensionConfigPage(params: PageParam) {
  return requestClient.get<
    PageResult<FdmdataExtensionConfigApi.ExtensionConfig>
  >('/fdmdata/extension-config/page', { params });
}

export function getExtensionConfig(id: number) {
  return requestClient.get<FdmdataExtensionConfigApi.ExtensionConfig>(
    `/fdmdata/extension-config/get?id=${id}`,
  );
}

export function createExtensionConfig(
  data: FdmdataExtensionConfigApi.ExtensionConfig,
) {
  return requestClient.post<number>('/fdmdata/extension-config/create', data);
}

export function updateExtensionConfig(
  data: FdmdataExtensionConfigApi.ExtensionConfig,
) {
  return requestClient.put<boolean>('/fdmdata/extension-config/update', data);
}

export function deleteExtensionConfig(id: number) {
  return requestClient.delete<boolean>(
    `/fdmdata/extension-config/delete?id=${id}`,
  );
}
