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
    bankAccountId?: null | number;
    billType?: null | string;
    businessSourceId?: null | number;
    businessSourceType?: null | string;
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
    source?: 'BUSINESS' | 'IMPORT' | 'MANUAL';
    sourceRef?: null | string;
    summary?: null | string;
    updateTime?: string;
  }

  type WithoutNull<T> = { [K in keyof T]: Exclude<T[K], null> };

  /** 可选表单值用 undefined，显式传 null 的 bankAccountId 取消关联 */
  export type SaveReq = WithoutNull<
    Omit<
      Entry,
      | 'bankAccountId'
      | 'businessSourceId'
      | 'businessSourceType'
      | 'createTime'
      | 'entryMonth'
      | 'id'
      | 'rmbAmount'
      | 'source'
      | 'sourceRef'
      | 'updateTime'
    >
  > & {
    bankAccountId?: null | number;
    entryMonth?: string;
    id?: number;
    rmbAmount?: Decimal;
  };

  export interface Filter {
    bankAccount?: string;
    bankAccountId?: number;
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
    accountOptions: {
      accountName?: null | string;
      accountType: FdmcaiwuBankBalanceApi.AccountType;
      id: number;
      name: string;
    }[];
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

/** 可关联的账户，以及以前填过的账户名称、类别、部门等 */
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

export namespace FdmcaiwuBankBalanceApi {
  type Decimal = FdmcaiwuJournalApi.Decimal;
  export type AccountType = 'BANK' | 'PRIVATE';

  /** 账户简称用于匹配日记账历史名称；期初余额是期初月份月初的余额 */
  export interface Account {
    accountName?: null | string;
    accountNo?: null | string;
    accountType: AccountType;
    active?: boolean;
    bankName?: null | string;
    companyId?: null | number;
    companyName?: null | string;
    currency: string;
    enabled?: boolean;
    id?: number;
    name: string;
    nature?: string;
    openingBalance: Decimal;
    openingMonth: string;
    remark?: string;
    sort?: number;
  }

  export type AccountSaveReq = Omit<
    Account,
    'accountName' | 'accountNo' | 'bankName' | 'companyName'
  > & {
    accountName: string;
    accountNo: string;
    bankName: string;
  };

  export interface CompanyOption {
    id: number;
    name: string;
  }

  export interface BalanceFilter {
    accountId?: number;
    accountType?: AccountType;
    active?: boolean;
    /** 0 查询未归属主体的账户 */
    companyId?: number;
    currency?: string;
  }

  export interface Month {
    /** 期初前或还没到的月份为 null */
    balance: Decimal | null;
    expense: Decimal;
    income: Decimal;
    month: number;
  }

  export interface Row {
    /** 只在日记账里出现、还没设置成账户时为空 */
    accountId: null | number;
    accountName?: null | string;
    accountNo?: null | string;
    accountType: AccountType | null;
    active?: null | boolean;
    bankName?: null | string;
    companyId?: null | number;
    companyName?: null | string;
    currency: string;
    /** 外币账户里币种不同、未计入的笔数 */
    mismatchCount: number;
    months: Month[];
    name: string;
    nature: null | string;
    openingMonth: null | string;
    previousBalance: Decimal | null;
    yearBalance: Decimal | null;
    yearExpense: Decimal;
    yearIncome: Decimal;
  }

  export interface Table {
    currentMonth: number;
    rows: Row[];
    totals: Row[];
    year: number;
  }
}

export function getBankAccounts() {
  return requestClient.get<FdmcaiwuBankBalanceApi.Account[]>(
    `${baseUrl}/bank-account/list`,
  );
}

export function getBankAccountCompanies() {
  return requestClient.get<FdmcaiwuBankBalanceApi.CompanyOption[]>(
    `${baseUrl}/bank-account/companies`,
  );
}

/** 新增或修改账户；历史名称变更会同步日记账 */
export function saveBankAccount(data: FdmcaiwuBankBalanceApi.AccountSaveReq) {
  return requestClient.post<number>(`${baseUrl}/bank-account/save`, data);
}

export function deleteBankAccount(id: number) {
  return requestClient.delete<boolean>(`${baseUrl}/bank-account/delete`, {
    params: { id },
  });
}

export function getBankBalance(
  year: number,
  filters?: FdmcaiwuBankBalanceApi.BalanceFilter,
) {
  return requestClient.get<FdmcaiwuBankBalanceApi.Table>(`${baseUrl}/balance`, {
    params: { ...filters, year },
  });
}

export function exportBankBalanceExcel(
  year: number,
  filters?: FdmcaiwuBankBalanceApi.BalanceFilter,
) {
  return requestClient.download(`${baseUrl}/balance/export-excel`, {
    params: { ...filters, year },
  });
}

/** 导入模板：收入、支出两张工作表，列头与导出一致 */
export function downloadJournalImportTemplate() {
  return requestClient.download(`${baseUrl}/import-template`);
}
