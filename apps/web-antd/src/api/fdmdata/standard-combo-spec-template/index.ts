import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace StandardComboSpecTemplateApi {
  export interface Row {
    id?: number;
    accessoryId: number;
    accessoryItemCode?: string;
    accessoryProductName?: string;
    specLwKey?: string;
    specFullKey?: string;
    remark?: string;
    createTime?: string;
  }

  export interface MatchRow {
    accessoryId: number;
    specLwKey?: string;
    specFullKey?: string;
  }
}

export function getStandardComboSpecTemplatePage(
  params: PageParam & {
    accessoryId?: number;
    specLwKey?: string;
    specFullKey?: string;
    createTime?: string[];
  },
) {
  return requestClient.get<PageResult<StandardComboSpecTemplateApi.Row>>(
    '/fdmdata/standard-combo-spec-template/page',
    { params },
  );
}

export function getStandardComboSpecTemplate(id: number) {
  return requestClient.get<StandardComboSpecTemplateApi.Row>(
    `/fdmdata/standard-combo-spec-template/get?id=${id}`,
  );
}

export function createStandardComboSpecTemplate(data: Partial<StandardComboSpecTemplateApi.Row>) {
  return requestClient.post<number>('/fdmdata/standard-combo-spec-template/create', data);
}

export function updateStandardComboSpecTemplate(data: Partial<StandardComboSpecTemplateApi.Row>) {
  return requestClient.put<boolean>('/fdmdata/standard-combo-spec-template/update', data);
}

export function deleteStandardComboSpecTemplate(id: number) {
  return requestClient.delete<boolean>(`/fdmdata/standard-combo-spec-template/delete?id=${id}`);
}

export function listStandardComboSpecMatchRows() {
  return requestClient.get<StandardComboSpecTemplateApi.MatchRow[]>(
    '/fdmdata/standard-combo-spec-template/list-match-rows',
  );
}
