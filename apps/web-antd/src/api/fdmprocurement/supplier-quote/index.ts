import { requestClient } from '#/api/request';

import { normalizeId } from '../id-normalizer';

export namespace FdmProcurementSupplierQuoteApi {
  export interface Tier {
    id: string;
    maxQty?: null | number | string;
    minQty: number | string;
    unitPrice: number | string;
  }

  export interface Quote {
    companyId: string;
    currency: string;
    id: string;
    leadTimeDays: number;
    paymentTerms: string;
    quoteNo: string;
    quoteVersion: number;
    skuId: string;
    sourceChecksum?: null | string;
    sourceFilename?: null | string;
    status: 'ACTIVE' | 'DRAFT' | 'EXPIRED' | 'VOIDED';
    supplierId: string;
    supplierProductId: string;
    taxIncluded: boolean;
    taxRate: number | string;
    tiers: Tier[];
    unitFreightAmount: number | string;
    validFrom: string;
    validUntil: string;
  }

  export interface CreateVersionReq {
    companyId: string;
    currency: string;
    leadTimeDays: number;
    paymentTerms: string;
    quoteNo: string;
    sourceChecksum?: string;
    sourceFilename?: string;
    status: Quote['status'];
    supplierProductId: string;
    taxIncluded: boolean;
    taxRate: number | string;
    tiers: Array<{
      maxQty?: number | string;
      minQty: number | string;
      unitPrice: number | string;
    }>;
    unitFreightAmount: number | string;
    validFrom: string;
    validUntil: string;
  }
}

const BASE_URL = '/fdmprocurement/supplier-quote';

export function normalizeSupplierQuote(
  value: FdmProcurementSupplierQuoteApi.Quote,
): FdmProcurementSupplierQuoteApi.Quote {
  return {
    ...value,
    companyId: normalizeId(value.companyId, 'supplierQuote.companyId'),
    id: normalizeId(value.id, 'supplierQuote.id'),
    skuId: normalizeId(value.skuId, 'supplierQuote.skuId'),
    supplierId: normalizeId(value.supplierId, 'supplierQuote.supplierId'),
    supplierProductId: normalizeId(
      value.supplierProductId,
      'supplierQuote.supplierProductId',
    ),
    tiers: (value.tiers || []).map((tier) => ({
      ...tier,
      id: normalizeId(tier.id, 'supplierQuote.tier.id'),
    })),
  };
}

export async function getProcurementSupplierQuoteList(params: {
  companyId: string;
  supplierProductId: string;
}) {
  const result = await requestClient.get<
    FdmProcurementSupplierQuoteApi.Quote[]
  >(`${BASE_URL}/list`, { params });
  return (result || []).map((quote) => normalizeSupplierQuote(quote));
}

export async function createProcurementSupplierQuoteVersion(
  data: FdmProcurementSupplierQuoteApi.CreateVersionReq,
) {
  return normalizeId(
    await requestClient.post<number | string>(
      `${BASE_URL}/create-version`,
      data,
    ),
    'supplierQuote.create.id',
  );
}
