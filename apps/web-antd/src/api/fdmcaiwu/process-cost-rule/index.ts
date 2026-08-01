import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmcaiwuProcessCostRuleApi {
  export type DecimalValue = number | string;

  export interface Rule {
    allocationCostPerKg: DecimalValue;
    batchShippingOperationCostPerPiece: DecimalValue;
    cartonCostPerPiece: DecimalValue;
    compositeLarge: DecimalValue;
    compositeSmall: DecimalValue;
    compositeThick: DecimalValue;
    effectiveEndDate?: string;
    effectiveStartDate: string;
    embossLargeOrThick: DecimalValue;
    embossSmall: DecimalValue;
    enabled: boolean;
    foamingLaborPerKg: DecimalValue;
    id: number;
    oppCostPerPiece: DecimalValue;
    packingLaborLarge: DecimalValue;
    packingLaborSmall: DecimalValue;
    processRouteCode: string;
    punchLarge: DecimalValue;
    punchSmall: DecimalValue;
    punchThick: DecimalValue;
    ruleCode: string;
    ruleName: string;
    slicingLaborPerKg: DecimalValue;
    sourceLocation?: string;
    sourceVersion?: string;
    strapCostPerPiece: DecimalValue;
    thickThresholdMm: DecimalValue;
    version: string;
    verticalCutLargeOrThick: DecimalValue;
    verticalCutSmall: DecimalValue;
    widthThresholdMm: DecimalValue;
  }

  export interface PageReq extends PageParam {
    enabled?: boolean;
    keyword?: string;
    processRouteCode?: string;
  }

  export type SaveReq = Omit<Rule, 'id' | 'sourceVersion'> & { id?: number };
}

export function getProcessCostRulePage(
  params: FdmcaiwuProcessCostRuleApi.PageReq,
) {
  return requestClient.get<PageResult<FdmcaiwuProcessCostRuleApi.Rule>>(
    '/fdmcaiwu/process-cost-rule/page',
    { params },
  );
}

export function getProcessCostRule(id: number) {
  return requestClient.get<FdmcaiwuProcessCostRuleApi.Rule>(
    '/fdmcaiwu/process-cost-rule/get',
    { params: { id } },
  );
}

export function createProcessCostRule(
  data: FdmcaiwuProcessCostRuleApi.SaveReq,
) {
  return requestClient.post<number>('/fdmcaiwu/process-cost-rule/create', data);
}

export function updateProcessCostRule(
  data: FdmcaiwuProcessCostRuleApi.SaveReq,
) {
  return requestClient.put<boolean>('/fdmcaiwu/process-cost-rule/update', data);
}

export function deleteProcessCostRule(id: number) {
  return requestClient.delete<boolean>('/fdmcaiwu/process-cost-rule/delete', {
    params: { id },
  });
}
