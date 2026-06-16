import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataExpressReconDetailApi {
  export interface ExpressReconDetail {
    id?: number;
    batchId?: number;
    templateId?: number;
    feeRuleId?: number;
    waybillNo?: string;
    shopName?: string;
    orderProvince?: string;
    billProvince?: string;
    provinceNorm?: string;
    provinceMatched?: number;
    expressCompany?: string;
    estimatedWeight?: number;
    billWeight?: number;
    weightDiff?: number;
    estimatedAmount?: number;
    actualAmount?: number;
    diffAmount?: number;
    status?: string;
    statusMessage?: string;
    internalOrderNos?: string;
    onlineOrderNos?: string;
    orderLineCount?: number;
    billLineCount?: number;
    createTime?: string;
  }

  export interface ExpressOrderItem {
    id?: number;
    skuCode?: string;
    productName?: string;
    quantity?: number;
    materialWeight?: number;
  }
}

export function getExpressReconDetailPage(params: PageParam) {
  return requestClient.get<
    PageResult<FdmdataExpressReconDetailApi.ExpressReconDetail>
  >('/fdmdata/express-recon-detail/page', { params });
}

export function getExpressReconOrderItemList(params: {
  batchId: number;
  waybillNo: string;
}) {
  return requestClient.get<FdmdataExpressReconDetailApi.ExpressOrderItem[]>(
    '/fdmdata/express-recon-detail/order-item-list',
    { params },
  );
}

export function exportExpressReconDetailExcel(params: Record<string, unknown>) {
  return requestClient.download('/fdmdata/express-recon-detail/export-excel', {
    params,
  });
}
