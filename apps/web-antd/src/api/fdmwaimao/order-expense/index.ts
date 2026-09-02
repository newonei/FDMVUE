import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmWaimaoOrderExpenseApi {
  export type AmountOrigin = 'HUMAN_ENTERED' | 'MISSING';
  export type DateTimeValue = number | string;
  export type DecimalValue = string;
  export type ExpenseStatus =
    | 'APPROVED'
    | 'CANCELLED'
    | 'DRAFT'
    | 'REJECTED'
    | 'SUBMITTED'
    | 'VOIDED';
  export type GenerationStatus =
    | 'CANCELLED'
    | 'CONTEXT_BUILDING'
    | 'CREATED'
    | 'EXPIRED'
    | 'FAILED'
    | 'GENERATING'
    | 'MATERIALIZED'
    | 'PARSING'
    | 'QUEUED'
    | 'READY'
    | 'RULE_BLOCKED'
    | 'STALE'
    | 'VALIDATING';
  export type SourceType = 'FDM_WAIMAO_CONTRACT_ORDER' | 'FDM_WAIMAO_SHIPMENT';

  export interface PageReq extends PageParam {
    companyId?: string;
    currency?: string;
    customerId?: string;
    expenseDate?: [string, string];
    keyword?: string;
    ownerUserId?: string;
    sourceType?: SourceType;
    status?: ExpenseStatus;
  }

  export interface ExpenseLine {
    amount?: DecimalValue | null;
    amountCny?: DecimalValue | null;
    amountOrigin: AmountOrigin;
    categoryName: string;
    categoryRef: string;
    description: string;
    evidenceRef?: null | string;
    evidenceType?: null | string;
    id: string;
    lineNo: number;
  }

  export interface ExpenseEvent {
    expectedVersion?: null | number;
    fromStatus?: ExpenseStatus | null;
    id: string;
    operatedAt: DateTimeValue;
    operatedBy: string;
    operation: string;
    reason?: null | string;
    resultVersion: number;
    toStatus: ExpenseStatus;
  }

  export interface Expense {
    amountOrigin: AmountOrigin;
    companyId: string;
    companyName?: null | string;
    contractOrderId?: null | string;
    contractOrderNo?: null | string;
    creationMode: 'AI' | 'MANUAL';
    currency?: null | string;
    currencyToCnyRate?: DecimalValue | null;
    customerId?: null | string;
    customerName?: null | string;
    events: ExpenseEvent[];
    expenseDate?: null | string;
    expenseNo: string;
    generationProposalHash?: null | string;
    generationProposalVersion?: null | number;
    generationRunId?: null | string;
    id: string;
    lines: ExpenseLine[];
    ownerDeptId?: null | string;
    ownerUserId?: null | string;
    rateDate?: null | string;
    rateFallbackUsed?: boolean | null;
    rateSource?: null | string;
    sourceId: string;
    sourceNo: string;
    sourceSubject?: null | string;
    sourceType: SourceType;
    sourceVersion: number;
    status: ExpenseStatus;
    submittedAt?: DateTimeValue | null;
    submittedSnapshotHash?: null | string;
    totalAmount?: DecimalValue | null;
    totalAmountCny?: DecimalValue | null;
    version: number;
  }

  export interface Category {
    categoryCode: string;
    categoryName: string;
    categoryRef: string;
    description?: null | string;
    sourceScope: 'ALL' | 'CONTRACT_ORDER' | 'SHIPMENT';
  }

  export interface ModelOption {
    capabilities: string[];
    code: string;
    id: string;
    name: string;
  }

  export interface GenerationOptions {
    blockers: string[];
    categories: Category[];
    companyId: string;
    models: ModelOption[];
    sourceId: string;
    sourceNo: string;
    sourceType: SourceType;
    sourceVersion: number;
    warnings: string[];
  }

  export interface GenerationRule {
    code: string;
    evidence?: null | Record<string, unknown>;
    fieldPath?: null | string;
    message: string;
    passed: boolean;
    severity: 'BLOCKER' | 'INFO' | 'WARNING' | string;
  }

  export interface GenerationProposalLine {
    amount?: null;
    amountOrigin: 'MISSING';
    categoryName: string;
    categoryRef: string;
    description: string;
    evidenceRef: string;
    evidenceType: string;
  }

  export interface GenerationProposal {
    lines: GenerationProposalLine[];
    summary?: null | string;
  }

  export interface GenerationJob {
    completedAt?: DateTimeValue | null;
    errorCode?: null | string;
    errorMessage?: null | string;
    generationType: 'ORDER_TO_EXPENSE_DRAFT';
    id: string;
    missingData: string[];
    modelId: string;
    modelName?: null | string;
    proposal?: GenerationProposal | null;
    proposalHash?: null | string;
    proposalVersion?: null | number;
    requestedAt?: DateTimeValue | null;
    rules: GenerationRule[];
    sourceId: string;
    sourceSnapshotHash: string;
    sourceType: SourceType;
    sourceVersion: string;
    status: GenerationStatus;
    version: string;
    warnings: string[];
  }

  export interface ActionReq {
    expectedVersion: number;
    id: string;
    idempotencyKey: string;
    reason?: string;
  }

  export interface ActionResult {
    executedNow: boolean;
    id: string;
    resultVersion: number;
    status: ExpenseStatus;
  }

  export interface UpdateDraftReq {
    currency: string;
    expectedVersion: number;
    expenseDate: string;
    id: string;
    idempotencyKey: string;
    lines: Array<{
      amount: string;
      categoryRef: string;
      description: string;
      id: string;
    }>;
  }

  export interface GenerationStartReq {
    expectedSourceVersion: number;
    idempotencyKey: string;
    instruction?: string;
    modelId: string;
    sourceId: string;
    sourceType: SourceType;
  }

  export interface GenerationActionReq {
    expectedVersion: string;
    id: string;
  }

  export interface GenerationRegenerateReq extends GenerationActionReq {
    idempotencyKey: string;
    instruction?: string;
    modelId: string;
  }

  export interface MaterializeReq {
    expectedRunVersion: string;
    expectedSourceSnapshotHash: string;
    generationRunId: string;
    idempotencyKey: string;
    proposalVersion: number;
  }
}

const BASE_URL = '/fdmwaimao/order-expense';

export function getOrderExpensePage(params: FdmWaimaoOrderExpenseApi.PageReq) {
  return requestClient.get<PageResult<FdmWaimaoOrderExpenseApi.Expense>>(
    `${BASE_URL}/page`,
    { params },
  );
}

export function getOrderExpense(id: string) {
  return requestClient.get<FdmWaimaoOrderExpenseApi.Expense>(
    `${BASE_URL}/get`,
    { params: { id } },
  );
}

export function getOrderExpenseCategories(
  sourceType: FdmWaimaoOrderExpenseApi.SourceType,
) {
  return requestClient.get<FdmWaimaoOrderExpenseApi.Category[]>(
    `${BASE_URL}/categories`,
    { params: { sourceType } },
  );
}

export function updateOrderExpenseDraft(
  data: FdmWaimaoOrderExpenseApi.UpdateDraftReq,
) {
  return requestClient.put<FdmWaimaoOrderExpenseApi.ActionResult>(
    `${BASE_URL}/update-draft`,
    data,
  );
}

function transition(
  action: 'approve' | 'cancel' | 'reject' | 'reopen' | 'submit' | 'void',
  data: FdmWaimaoOrderExpenseApi.ActionReq,
) {
  return requestClient.put<FdmWaimaoOrderExpenseApi.ActionResult>(
    `${BASE_URL}/${action}`,
    data,
  );
}

export const submitOrderExpense = (data: FdmWaimaoOrderExpenseApi.ActionReq) =>
  transition('submit', data);
export const approveOrderExpense = (data: FdmWaimaoOrderExpenseApi.ActionReq) =>
  transition('approve', data);
export const rejectOrderExpense = (data: FdmWaimaoOrderExpenseApi.ActionReq) =>
  transition('reject', data);
export const reopenOrderExpense = (data: FdmWaimaoOrderExpenseApi.ActionReq) =>
  transition('reopen', data);
export const cancelOrderExpense = (data: FdmWaimaoOrderExpenseApi.ActionReq) =>
  transition('cancel', data);
export const voidOrderExpense = (data: FdmWaimaoOrderExpenseApi.ActionReq) =>
  transition('void', data);

export function getOrderExpenseGenerationOptions(params: {
  expectedSourceVersion: number;
  sourceId: string;
  sourceType: FdmWaimaoOrderExpenseApi.SourceType;
}) {
  return requestClient.get<FdmWaimaoOrderExpenseApi.GenerationOptions>(
    `${BASE_URL}/generation/options`,
    { params },
  );
}

export function startOrderExpenseGeneration(
  data: FdmWaimaoOrderExpenseApi.GenerationStartReq,
) {
  return requestClient.post<FdmWaimaoOrderExpenseApi.GenerationJob>(
    `${BASE_URL}/generation/start`,
    data,
  );
}

export function getOrderExpenseGenerationJob(id: string) {
  return requestClient.get<FdmWaimaoOrderExpenseApi.GenerationJob>(
    `${BASE_URL}/generation/job`,
    { params: { id } },
  );
}

export function retryOrderExpenseGeneration(
  data: FdmWaimaoOrderExpenseApi.GenerationActionReq,
) {
  return requestClient.post<FdmWaimaoOrderExpenseApi.GenerationJob>(
    `${BASE_URL}/generation/retry`,
    data,
  );
}

export function regenerateOrderExpenseGeneration(
  data: FdmWaimaoOrderExpenseApi.GenerationRegenerateReq,
) {
  return requestClient.post<FdmWaimaoOrderExpenseApi.GenerationJob>(
    `${BASE_URL}/generation/regenerate`,
    data,
  );
}

export function cancelOrderExpenseGeneration(
  data: FdmWaimaoOrderExpenseApi.GenerationActionReq,
) {
  return requestClient.post<FdmWaimaoOrderExpenseApi.GenerationJob>(
    `${BASE_URL}/generation/cancel`,
    data,
  );
}

export function materializeOrderExpenseGeneration(
  data: FdmWaimaoOrderExpenseApi.MaterializeReq,
) {
  return requestClient.post<FdmWaimaoOrderExpenseApi.ActionResult>(
    `${BASE_URL}/generation/materialize`,
    data,
  );
}
