import type { FinanceDepartment } from './finance-stats';
import type { Decimal } from './index';
import type { SupplierDepartment } from './supplier-stats';

import { requestClient } from '#/api/request';

export type CompanyBoardSection =
  | 'cashflow'
  | 'domestic'
  | 'foreign'
  | 'purchasing';

export interface CompanyAmountCount {
  amount: Decimal;
  count: number;
}

export type CompanyAgingBucket = 'D30' | 'D60' | 'D90' | 'OVER90' | 'UNSHIPPED';

/** 一条业务线（外贸 / 内销）的全公司签约，金额折人民币；金智合同金额本身是人民币。 */
export interface CompanySales {
  channel: 'DOMESTIC' | 'FOREIGN';
  asOf: string;
  currency: 'CNY';
  /** 24 个月，最后一个是本月 */
  months: string[];
  signed: Decimal[];
  contracts: number[];
  thisMonth: CompanyAmountCount;
  lastMonth: CompanyAmountCount;
  lastYearMonth: CompanyAmountCount;
  ytd: CompanyAmountCount;
  lastYtd: CompanyAmountCount;
  recent12: CompanyAmountCount;
  previous12: CompanyAmountCount;
  /** 执行中（不含草稿和金智待补齐）的合同 */
  active: CompanyAmountCount;
  unpaid: CompanyAmountCount;
  due: { overdue: number; soon: number; soonDays: number };
  stages: Record<string, number>;
  /** 只有财务能看到 */
  aging?: Record<CompanyAgingBucket, CompanyAmountCount>;
  topCustomers: {
    amount: Decimal;
    contracts: number;
    id?: null | string;
    name?: null | string;
  }[];
  /** 缺汇率、只计份数没计金额的币种 */
  unconverted: string[];
  /** 金智迁入、还没补齐的合同：只计签约，不计在手和应收 */
  historyContracts: number;
}

export interface CompanyBoard {
  generatedAt: string;
  /** 当前账号能看的块；读失败的块也在这里，同时列在 unavailable */
  sections: CompanyBoardSection[];
  unavailable: CompanyBoardSection[];
  foreign?: CompanySales | null;
  domestic?: CompanySales | null;
  cashflow?: FinanceDepartment | null;
  purchasing?: null | SupplierDepartment;
}

/** 没有业务协同部门权限的账号会被拒绝，看板只隐藏这几块，不弹错误。 */
export function getCompanyBoard() {
  return requestClient.get<CompanyBoard>('/fdmplatform/v1/company-board', {
    silent: true,
  });
}
