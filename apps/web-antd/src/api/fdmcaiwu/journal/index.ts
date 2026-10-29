import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmcaiwuJournalApi {
  export type Decimal = number | string;
  export type Direction = 'EXPENSE' | 'INCOME';
  export type InvoiceStatus = 'NOT_REQUIRED' | 'PENDING' | 'RECEIVED';
  export type Dimension = 'BANK' | 'CATEGORY' | 'COMPANY' | 'DEPT' | 'HANDLER';

  /** 收入、支出共用；票据、发票、付款方式、送达只在支出有 */
  export interface Entry {
    amount: Decimal;
    bankAccount?: null | string;
    billType?: null | string;
    category?: null | string;
    companyId?: null | number;
    companyName?: null | string;
    counterparty?: null | string;
    createTime?: string;
    currency: string;
    deliveredDate?: null | string;
    deliverer?: null | string;
    deptName?: null | string;
    direction: Direction;
    entryDate: string;
    /** yyyy-MM */
    entryMonth: string;
    exchangeRate?: Decimal | null;
    handlerName?: null | string;
    id: number;
    invoiceAmount?: Decimal | null;
    invoiceNo?: null | string;
    invoiceStatus?: InvoiceStatus | null;
    paymentMethod?: null | string;
    remark?: null | string;
    rmbAmount: Decimal;
    source?: 'IMPORT' | 'MANUAL';
    sourceRef?: null | string;
    summary?: null | string;
    updateTime?: string;
  }

  type WithoutNull<T> = { [K in keyof T]: Exclude<T[K], null> };

  /** 表单里空值用 undefined，接口返回的 null 先经 toSaveReq 转换 */
  export type SaveReq = WithoutNull<
    Omit<
      Entry,
      | 'createTime'
      | 'entryMonth'
      | 'id'
      | 'rmbAmount'
      | 'source'
      | 'sourceRef'
      | 'updateTime'
    >
  > & {
    entryMonth?: string;
    id?: number;
    rmbAmount?: Decimal;
  };

  export interface Filter {
    bankAccount?: string;
    category?: string;
    companyName?: string;
    deptName?: string;
    direction?: Direction;
    handlerName?: string;
    invoiceStatus?: InvoiceStatus;
    keyword?: string;
    monthFrom?: string;
    monthTo?: string;
  }

  export type PageReq = Filter & PageParam;

  export interface Totals {
    count: number;
    currencies: { amount: Decimal; currency: string }[];
    invoiceAmount: Decimal;
    rmbAmount: Decimal;
  }

  export interface Options {
    bankAccounts: string[];
    billTypes: string[];
    categories: string[];
    companyNames: string[];
    counterparties: string[];
    deliverers: string[];
    deptNames: string[];
    handlerNames: string[];
    paymentMethods: string[];
  }

  export interface SummaryReq {
    companyName?: string;
    dimension: Dimension;
    monthFrom?: string;
    monthTo?: string;
  }

  export interface SummaryRow {
    expenseCount: number;
    expenseRmb: Decimal;
    incomeCount: number;
    incomeRmb: Decimal;
    month: string;
    name: string;
    netRmb: Decimal;
  }

  export interface ImportSheet {
    direction: Direction;
    duplicateRows: number;
    errorRows: number;
    newRows: number;
    sheetName: string;
    totalRows: number;
  }

  export interface ImportPreview {
    duplicateRows: number;
    errorRows: number;
    errors: { message: string; rowNumber: number; sheetName: string }[];
    fileName: string;
    newRows: number;
    samples: Entry[];
    sheets: ImportSheet[];
  }

  export interface ImportResult {
    created: number;
    duplicateRows: number;
    errorRows: number;
  }
}

const baseUrl = '/fdmcaiwu/journal';

export function getJournalPage(params: FdmcaiwuJournalApi.PageReq) {
  return requestClient.get<PageResult<FdmcaiwuJournalApi.Entry>>(
    `${baseUrl}/page`,
    { params },
  );
}

/** 当前筛选条件下的全部合计，不只本页 */
export function getJournalTotals(params: FdmcaiwuJournalApi.Filter) {
  return requestClient.get<FdmcaiwuJournalApi.Totals>(`${baseUrl}/totals`, {
    params,
  });
}

export function getJournal(id: number) {
  return requestClient.get<FdmcaiwuJournalApi.Entry>(`${baseUrl}/get`, {
    params: { id },
  });
}

/** 以前填过的收付款行、类别、部门、经手人等，按使用次数排序 */
export function getJournalOptions(direction?: FdmcaiwuJournalApi.Direction) {
  return requestClient.get<FdmcaiwuJournalApi.Options>(`${baseUrl}/options`, {
    params: { direction },
  });
}

export function createJournal(data: FdmcaiwuJournalApi.SaveReq) {
  return requestClient.post<number>(`${baseUrl}/create`, data);
}

export function updateJournal(data: FdmcaiwuJournalApi.SaveReq) {
  return requestClient.put<boolean>(`${baseUrl}/update`, data);
}

export function deleteJournals(ids: number[]) {
  return requestClient.delete<boolean>(
    `${baseUrl}/delete-list?ids=${ids.join(',')}`,
  );
}

export function getJournalSummary(params: FdmcaiwuJournalApi.SummaryReq) {
  return requestClient.get<FdmcaiwuJournalApi.SummaryRow[]>(
    `${baseUrl}/summary`,
    { params },
  );
}

/** 按筛选导出，列头与原收入表、支出表一致；不选方向时两张表都导 */
export function exportJournalExcel(params: FdmcaiwuJournalApi.Filter) {
  return requestClient.download(`${baseUrl}/export-excel`, { params });
}

export function exportJournalSummaryExcel(
  params: FdmcaiwuJournalApi.SummaryReq,
) {
  return requestClient.download(`${baseUrl}/summary/export-excel`, { params });
}

/** 预览导入，不写库 */
export function previewJournalImport(file: File) {
  return requestClient.upload<FdmcaiwuJournalApi.ImportPreview>(
    `${baseUrl}/import/preview`,
    { file },
  );
}

/** 导入：已在系统里的和有问题的行跳过 */
export function applyJournalImport(file: File) {
  return requestClient.upload<FdmcaiwuJournalApi.ImportResult>(
    `${baseUrl}/import/apply`,
    { file },
  );
}
