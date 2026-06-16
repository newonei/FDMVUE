import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataExpressFeeTemplateApi {
  export interface ExpressFeeTemplate {
    id?: number;
    templateCode?: string;
    templateName?: string;
    carrierCode?: string;
    carrierName?: string;
    billingType?: string;
    weightField?: string;
    enabled?: number;
    remark?: string;
    createTime?: string;
  }
}

export function getExpressFeeTemplatePage(params: PageParam) {
  return requestClient.get<
    PageResult<FdmdataExpressFeeTemplateApi.ExpressFeeTemplate>
  >('/fdmdata/express-fee-template/page', { params });
}

export function getExpressFeeTemplate(id: number) {
  return requestClient.get<FdmdataExpressFeeTemplateApi.ExpressFeeTemplate>(
    `/fdmdata/express-fee-template/get?id=${id}`,
  );
}

export function createExpressFeeTemplate(
  data: FdmdataExpressFeeTemplateApi.ExpressFeeTemplate,
) {
  return requestClient.post<number>(
    '/fdmdata/express-fee-template/create',
    data,
  );
}

export function updateExpressFeeTemplate(
  data: FdmdataExpressFeeTemplateApi.ExpressFeeTemplate,
) {
  return requestClient.put<boolean>(
    '/fdmdata/express-fee-template/update',
    data,
  );
}

export function deleteExpressFeeTemplate(id: number) {
  return requestClient.delete<boolean>(
    `/fdmdata/express-fee-template/delete?id=${id}`,
  );
}

export async function getExpressFeeTemplateOptions() {
  const page = await getExpressFeeTemplatePage({
    enabled: 1,
    pageNo: 1,
    pageSize: 100,
  } as PageParam & { enabled: number });
  return page.list
    .toSorted((a, b) => {
      const aIsZto = a.carrierCode === 'ZTO' ? 0 : 1;
      const bIsZto = b.carrierCode === 'ZTO' ? 0 : 1;
      return aIsZto - bIsZto || Number(b.id ?? 0) - Number(a.id ?? 0);
    })
    .map((item) => ({
      label: `${item.templateName ?? item.templateCode}（${item.carrierName ?? ''}）`,
      value: item.id!,
    }));
}
