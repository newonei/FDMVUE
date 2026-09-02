import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmWaimaoCustomerApi {
  export type CustomerLevel = 'A' | 'B' | 'C';
  /** 后端 LocalDateTime 默认可能序列化为 epoch-millis，也兼容 ISO 文本。 */
  export type DateTimeValue = number | string;
  export type SyncStatus = 'FAILED' | 'SYNCED';

  export type OkkiSearchField =
    | 'customer_list.contact.value'
    | 'customer_list.email'
    | 'customer_list.email.domain'
    | 'customer_list.name'
    | 'customer_list.tel'
    | 'name'
    | 'serial_id';

  export interface Contact {
    email?: null | string;
    externalContactKey?: null | string;
    externalContactId?: null | string;
    id: string;
    linkedin?: null | string;
    name?: null | string;
    phone?: null | string;
    position?: null | string;
    primaryFlag: boolean;
    source: string;
    telAreaCode?: null | string;
    wechat?: null | string;
    whatsapp?: null | string;
  }

  export interface SyncLog {
    createTime?: DateTimeValue | null;
    durationMs?: null | number;
    errorCode?: null | string;
    errorMessage?: null | string;
    id: string;
    operation: 'IMPORT' | 'REFRESH';
    operatorUserId?: null | string;
    result: 'FAILED' | 'SUCCESS';
    traceId?: null | string;
  }

  export interface PrimaryContact {
    email?: null | string;
    id?: null | string;
    name?: null | string;
    phone?: null | string;
  }

  export interface CustomerPageItem {
    countryCode?: null | string;
    countryName?: null | string;
    customerCode: string;
    id: string;
    lastSyncTime?: DateTimeValue | null;
    level: CustomerLevel;
    name: string;
    okkiOwnerNames?: null | string[];
    okkiSerialId?: null | string;
    okkiStageName?: null | string;
    ownerDeptId?: null | string;
    ownerDeptName?: null | string;
    ownerUserId: string;
    ownerUserName?: null | string;
    primaryContact?: null | PrimaryContact;
    shortName?: null | string;
    syncError?: null | string;
    syncStatus: SyncStatus;
  }

  export interface CustomerDetail extends CustomerPageItem {
    address?: null | string;
    companyPhone?: null | string;
    companyTelAreaCode?: null | string;
    contacts: Contact[];
    countryRegionRaw?: null | string;
    fax?: null | string;
    homepage?: null | string;
    lastAttemptTime?: DateTimeValue | null;
    manualOverrideFields?: null | string[];
    okkiCompanyId: string;
    okkiOwnerSnapshot?: null | OkkiOwner[];
    okkiStageId?: null | string;
    profileVersion: number;
    remoteUpdateTime?: DateTimeValue | null;
    remark?: null | string;
    syncLogs: SyncLog[];
  }

  export interface CountryOption {
    code?: null | string;
    filterValue: string;
    name: string;
  }

  export interface OwnerOption {
    deptId?: null | string;
    deptName?: null | string;
    id: string;
    name: string;
    transferable: boolean;
  }

  export interface FilterOptions {
    countries: CountryOption[];
    owners: OwnerOption[];
  }

  export interface PageReq extends PageParam {
    countryCode?: string;
    keyword?: string;
    level?: CustomerLevel;
    ownerUserId?: string;
    syncStatus?: SyncStatus;
  }

  export interface OkkiOwner {
    id?: null | string;
    name?: null | string;
  }

  export interface OkkiContact {
    email?: null | string;
    externalContactKey?: null | string;
    id?: null | string;
    linkedin?: null | string;
    name?: null | string;
    phone?: null | string;
    position?: null | string;
    primaryFlag?: boolean;
    telAreaCode?: null | string;
    wechat?: null | string;
    whatsapp?: null | string;
  }

  export interface OkkiCandidate {
    companyId: string;
    mapped: boolean;
    mappedCustomerId?: null | string;
    mappedCustomerVisible?: boolean;
    name: string;
    publicCustomer?: boolean;
    serialId?: null | string;
    shortName?: null | string;
  }

  export interface OkkiSearchReq extends PageParam {
    keyword: string;
    searchField?: OkkiSearchField;
  }

  export interface DuplicateMatch {
    customerCode?: null | string;
    customerId?: null | string;
    customerName?: null | string;
    matchReasons: string[];
    visible: boolean;
  }

  export interface OkkiPreview {
    address?: null | string;
    companyPhone?: null | string;
    companyTelAreaCode?: null | string;
    companyId: string;
    contacts: OkkiContact[];
    countryCode?: null | string;
    countryName?: null | string;
    countryRegionRaw?: null | string;
    duplicateMatches: DuplicateMatch[];
    fax?: null | string;
    homepage?: null | string;
    mapped: boolean;
    mappedCustomerId?: null | string;
    mappedCustomerVisible?: boolean;
    name: string;
    owners: OkkiOwner[];
    publicCustomer?: boolean;
    previewHash: string;
    recentFollowUpTime?: DateTimeValue | null;
    remark?: null | string;
    remoteCreateTime?: DateTimeValue | null;
    remoteUpdateTime?: DateTimeValue | null;
    serialId?: null | string;
    shortName?: null | string;
    stageId?: null | string;
    stageName?: null | string;
  }

  export interface ImportReq {
    attachmentIds: string[];
    confirmPotentialDuplicate: boolean;
    okkiCompanyId: string;
    previewHash: string;
    profile: CustomerProfileDraft;
  }

  /** OKKI 仅提供初始值；这里的字段才是本次实际写入 FDM 的可编辑资料。 */
  export interface CustomerProfileDraft {
    address?: null | string;
    companyPhone?: null | string;
    companyTelAreaCode?: null | string;
    contacts: CustomerProfileContactDraft[];
    countryCode?: null | string;
    countryName?: null | string;
    countryRegionRaw?: null | string;
    fax?: null | string;
    homepage?: null | string;
    name: string;
    remark?: null | string;
    shortName?: null | string;
  }

  export interface CustomerProfileContactDraft {
    /** 仅供前端稳定渲染新增行，提交前会移除。 */
    draftKey?: string;
    email?: null | string;
    externalContactKey?: null | string;
    id?: null | string;
    linkedin?: null | string;
    name?: null | string;
    phone?: null | string;
    position?: null | string;
    primaryFlag: boolean;
    /** 仅供界面标识本地/OKKI 来源，提交前会移除。 */
    source?: null | string;
    telAreaCode?: null | string;
    wechat?: null | string;
    whatsapp?: null | string;
  }

  export interface ImportResult {
    created: boolean;
    customerId: string;
  }

  export interface UpdateLevelReq {
    id: string;
    level: CustomerLevel;
  }

  export interface UpdateProfileReq {
    expectedProfileVersion: number;
    id: string;
    profile: CustomerProfileDraft;
  }

  export interface TransferReq {
    id: string;
    ownerUserId: string;
  }
}

const BASE_URL = '/fdmwaimao/customer';

interface RequestFailure {
  data?: { code?: number | string; msg?: string };
  response?: {
    data?: { code?: number | string; msg?: string };
    headers?: Record<string, unknown> & {
      get?: (name: string) => null | string;
    };
  };
}

export function getBusinessErrorCode(error: unknown) {
  const failure = error as RequestFailure;
  return failure.data?.code ?? failure.response?.data?.code;
}

/** 只展示 FDM 后端的脱敏文案与链路号，不拼接底层 OKKI 异常。 */
export function formatOkkiError(error: unknown) {
  const failure = error as RequestFailure;
  const backendMessage =
    failure.data?.msg ??
    failure.response?.data?.msg ??
    'OKKI 操作失败，请稍后重试';
  const headers = failure.response?.headers;
  const traceValue =
    headers?.get?.('trace-id') ??
    headers?.['trace-id'] ??
    headers?.['Trace-Id'];
  const traceId = String(traceValue ?? '');
  return /^[\w.:-]{1,128}$/.test(traceId)
    ? `${backendMessage}（追踪编号：${traceId}）`
    : backendMessage;
}

export function getCustomerPage(params: FdmWaimaoCustomerApi.PageReq) {
  return requestClient.get<PageResult<FdmWaimaoCustomerApi.CustomerPageItem>>(
    `${BASE_URL}/page`,
    { params },
  );
}

export function getCustomer(id: string) {
  return requestClient.get<FdmWaimaoCustomerApi.CustomerDetail>(
    `${BASE_URL}/get`,
    { params: { id } },
  );
}

export function getCustomerFilterOptions() {
  return requestClient.get<FdmWaimaoCustomerApi.FilterOptions>(
    `${BASE_URL}/filter-options`,
  );
}

export function searchOkkiCustomers(
  params: FdmWaimaoCustomerApi.OkkiSearchReq,
) {
  return requestClient.get<PageResult<FdmWaimaoCustomerApi.OkkiCandidate>>(
    `${BASE_URL}/okki/search`,
    { params, silent: true },
  );
}

export function previewOkkiCustomer(companyId: string) {
  return requestClient.get<FdmWaimaoCustomerApi.OkkiPreview>(
    `${BASE_URL}/okki/preview`,
    { params: { companyId }, silent: true },
  );
}

export function importOkkiCustomer(data: FdmWaimaoCustomerApi.ImportReq) {
  return requestClient.post<FdmWaimaoCustomerApi.ImportResult>(
    `${BASE_URL}/import-from-okki`,
    data,
    { silent: true },
  );
}

export function refreshCustomerFromOkki(id: string) {
  return requestClient.put<boolean>(`${BASE_URL}/refresh-from-okki`, null, {
    params: { id },
    silent: true,
  });
}

export function updateCustomerLevel(data: FdmWaimaoCustomerApi.UpdateLevelReq) {
  return requestClient.put<boolean>(`${BASE_URL}/update-level`, data);
}

export function updateCustomerProfile(
  data: FdmWaimaoCustomerApi.UpdateProfileReq,
) {
  return requestClient.put<boolean>(`${BASE_URL}/update-profile`, data);
}

export function transferCustomer(data: FdmWaimaoCustomerApi.TransferReq) {
  return requestClient.put<boolean>(`${BASE_URL}/transfer`, data);
}
