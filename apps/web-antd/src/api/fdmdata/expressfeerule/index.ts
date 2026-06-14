import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataExpressFeeRuleApi {
  export interface ExpressFeeRule {
    id?: number;
    templateId?: number;
    provinceName?: string;
    provinceNorm?: string;
    weightMinKg?: number;
    weightMaxKg?: number;
    fixedFee?: number;
    baseWeightKg?: number;
    baseFee?: number;
    extraUnitWeight?: number;
    extraUnitFee?: number;
    sort?: number;
    enabled?: number;
    remark?: string;
    createTime?: string;
  }
}

export function getExpressFeeRulePage(params: PageParam) {
  return requestClient.get<PageResult<FdmdataExpressFeeRuleApi.ExpressFeeRule>>(
    '/fdmdata/express-fee-rule/page',
    { params },
  );
}

export function getExpressFeeRule(id: number) {
  return requestClient.get<FdmdataExpressFeeRuleApi.ExpressFeeRule>(
    `/fdmdata/express-fee-rule/get?id=${id}`,
  );
}

export function createExpressFeeRule(data: FdmdataExpressFeeRuleApi.ExpressFeeRule) {
  return requestClient.post<number>('/fdmdata/express-fee-rule/create', data);
}

export function updateExpressFeeRule(data: FdmdataExpressFeeRuleApi.ExpressFeeRule) {
  return requestClient.put<boolean>('/fdmdata/express-fee-rule/update', data);
}

export function deleteExpressFeeRule(id: number) {
  return requestClient.delete<boolean>(`/fdmdata/express-fee-rule/delete?id=${id}`);
}
