import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmFactoryCapabilityApi {
  export type CapabilityStatus = 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN';
  export type EvidenceMode = 'AUTHORITATIVE' | 'HUMAN_CONFIRMED';
  export type FactoryStatus = 'DISABLED' | 'ENABLED';

  export interface PageReq extends PageParam {
    companyId: string;
    effectiveDate?: string;
    factoryId?: string;
    productId?: string;
    skuId?: string;
    status?: CapabilityStatus;
  }

  export interface BaseSaveReq {
    companyId: string;
    directShipSupported: boolean;
    evidenceByUserId?: string;
    evidenceMode: EvidenceMode;
    evidenceNote?: string;
    evidenceSourceName?: string;
    evidenceSourceRefId?: string;
    evidenceSourceSystem?: string;
    evidenceSourceVersion?: string;
    evidenceTime: string;
    evidenceValidUntil: string;
    factoryId: string;
    productId: string;
    skuId: string;
    productVersionToken: string;
    status: CapabilityStatus;
    supportedCertificationRequirements: string[];
    supportedCountryComplianceRequirements: string[];
    supportedCustomerComplianceRequirements: string[];
    supportedPackagingRequirements: string[];
    validFrom: string;
    validUntil?: string;
  }

  export type CreateReq = BaseSaveReq;

  export interface UpdateReq extends BaseSaveReq {
    id: string;
    version: number;
  }

  export type Capability = Omit<
    BaseSaveReq,
    | 'evidenceByUserId'
    | 'evidenceNote'
    | 'evidenceSourceName'
    | 'evidenceSourceRefId'
    | 'evidenceSourceSystem'
    | 'evidenceSourceVersion'
    | 'validUntil'
  > & {
    authorityHash: string;
    createTime?: null | string;
    evidenceByUserId?: null | string;
    evidenceNote?: null | string;
    evidenceSourceName?: null | string;
    evidenceSourceRefId?: null | string;
    evidenceSourceSystem?: null | string;
    evidenceSourceVersion?: null | string;
    id: string;
    updateTime?: null | string;
    validUntil?: null | string;
    version: number;
  };

  export interface Factory {
    companyId: string;
    defaultLeadTimeDays: number;
    factoryCode: string;
    factoryName: string;
    factoryId: string;
    status: FactoryStatus;
    timezone: string;
    validFrom: string;
    validUntil?: null | string;
    version: number;
  }

  export interface FactoryListReq {
    companyId: string;
    effectiveDate?: string;
    factoryCode?: string;
    factoryName?: string;
    status?: FactoryStatus;
  }
}

const BASE_URL = '/fdmfactory/capability';
const FACTORY_BASE_URL = '/fdmfactory/factory';

function longString(value: unknown, field: string): string {
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  throw new TypeError(`${field} 不是有效的正整数 ID`);
}

function optionalLongString(
  value: unknown,
  field: string,
): null | string | undefined {
  return value === null || value === undefined
    ? value
    : longString(value, field);
}

function normalizeCapability(
  value: FdmFactoryCapabilityApi.Capability,
): FdmFactoryCapabilityApi.Capability {
  return {
    ...value,
    companyId: longString(value.companyId, 'capability.companyId'),
    evidenceByUserId: optionalLongString(
      value.evidenceByUserId,
      'capability.evidenceByUserId',
    ),
    factoryId: longString(value.factoryId, 'capability.factoryId'),
    id: longString(value.id, 'capability.id'),
    productId: longString(value.productId, 'capability.productId'),
    skuId: longString(value.skuId, 'capability.skuId'),
    supportedCertificationRequirements: [
      ...(value.supportedCertificationRequirements || []),
    ],
    supportedCountryComplianceRequirements: [
      ...(value.supportedCountryComplianceRequirements || []),
    ],
    supportedCustomerComplianceRequirements: [
      ...(value.supportedCustomerComplianceRequirements || []),
    ],
    supportedPackagingRequirements: [
      ...(value.supportedPackagingRequirements || []),
    ],
  };
}

function normalizeFactory(
  value: FdmFactoryCapabilityApi.Factory,
): FdmFactoryCapabilityApi.Factory {
  return {
    ...value,
    companyId: longString(value.companyId, 'factoryFactory.companyId'),
    factoryId: longString(value.factoryId, 'factory.factoryId'),
  };
}

export async function getFactoryCapabilityPage(
  params: FdmFactoryCapabilityApi.PageReq,
) {
  const result = await requestClient.get<
    PageResult<FdmFactoryCapabilityApi.Capability>
  >(`${BASE_URL}/page`, { params });
  return {
    ...result,
    list: (result.list || []).map((capability) =>
      normalizeCapability(capability),
    ),
  };
}

export async function getFactoryCapability(params: {
  companyId: string;
  id: string;
}) {
  const result = await requestClient.get<FdmFactoryCapabilityApi.Capability>(
    `${BASE_URL}/get`,
    { params },
  );
  return normalizeCapability(result);
}

export async function createFactoryCapability(
  data: FdmFactoryCapabilityApi.CreateReq,
) {
  const result = await requestClient.post<unknown>(`${BASE_URL}/create`, data);
  return longString(result, 'capability.id');
}

export function updateFactoryCapability(
  data: FdmFactoryCapabilityApi.UpdateReq,
) {
  return requestClient.put<boolean>(`${BASE_URL}/update`, data);
}

export async function getFactoryList(
  params: FdmFactoryCapabilityApi.FactoryListReq,
) {
  const result = await requestClient.get<FdmFactoryCapabilityApi.Factory[]>(
    `${FACTORY_BASE_URL}/list`,
    { params },
  );
  return (result || []).map((factory) => normalizeFactory(factory));
}
