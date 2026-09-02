import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmWaimaoReceiptAllocationApi {
  export type AllocationStatus = 'APPLIED' | 'CANCELLED' | 'DRAFT' | 'VOIDED';
  export type CreationMode = 'AI' | 'MANUAL';
  export type DateTimeValue = number | string;
  export type DecimalValue = string;
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
    | 'VALIDATING'
    | string;

  export interface AllocationLine {
    allocatedContractAmount: DecimalValue;
    amountCny: DecimalValue;
    contractCurrency: string;
    contractCurrencyToCnyRate: DecimalValue;
    fieldOrigin: string;
    id: string;
    orderId: string;
    orderNo: string;
    orderSubject: string;
    rateDate: string;
    rateFallbackUsed: boolean;
    rateRetrievedAt?: DateTimeValue | null;
    rateSnapshotHash: string;
    rateSource: string;
    reason?: null | string;
    roundingAdjustmentCny: DecimalValue;
    sourceAmount: DecimalValue;
    sourceCurrencyToCnyRate: DecimalValue;
  }

  export interface Allocation {
    allocationNo: string;
    appliedAt?: DateTimeValue | null;
    bankReceiptId: string;
    bankReceiptVersionSnapshot: number;
    companyId: string;
    companyName: string;
    creationMode: CreationMode;
    customerId: string;
    customerName: string;
    generationModelId?: null | string;
    generationProposalVersion?: null | number;
    generationRunId?: null | string;
    generationRunVersion?: null | string;
    id: string;
    lines: AllocationLine[];
    ownerDeptId?: null | string;
    ownerUserId?: null | string;
    remark?: null | string;
    sourceCurrency: string;
    status: AllocationStatus;
    totalSourceAmount: DecimalValue;
    version: number;
    voidedAt?: DateTimeValue | null;
  }

  export interface PageReq extends PageParam {
    bankReceiptId?: string;
    companyId?: string;
    customerId?: string;
    keyword?: string;
    status?: AllocationStatus;
  }

  /** 人工草稿只包含用户可编辑事实，AI lineage 与汇率证据由服务端维护。 */
  export interface ManualDraftReq {
    bankReceiptId: string;
    customerId: string;
    expectedBankReceiptVersion: number;
    idempotencyKey: string;
    lines: Array<{
      orderId: string;
      reason?: string;
      sourceAmount: DecimalValue;
    }>;
    remark?: string;
  }

  export interface ActionReq {
    confirmPotentialDuplicate: boolean;
    expectedVersion: number;
    id: string;
    idempotencyKey: string;
    reason?: string;
  }

  export interface ActionResult {
    id: string;
    newlyCreated: boolean;
    resultVersion: number;
    status: AllocationStatus;
  }

  export interface ModelOption {
    capabilities: string[];
    code: string;
    id: string;
    name: string;
  }

  export interface GenerationStartReq {
    bankReceiptId: string;
    expectedSourceVersion: number;
    idempotencyKey: string;
    instruction?: string;
    modelId: string;
  }

  export interface GenerationTicket {
    created: boolean;
    runId: string;
    status: GenerationStatus;
    version: string;
  }

  export interface GenerationProposalLine {
    confidence?: null | string;
    orderRef: string;
    reason?: null | string;
    sourceCurrencyAmount: DecimalValue;
  }

  export interface GenerationProposal {
    customerRef: string;
    lines: GenerationProposalLine[];
  }

  export interface GenerationJob {
    proposalJson?: null | string;
    runId: string;
    sourceId: string;
    sourceVersion: string;
    status: GenerationStatus;
    version: string;
    warnings: string[];
  }

  export interface MaterializeReq {
    expectedRunVersion: string;
    idempotencyKey: string;
    remark?: string;
    runId: string;
  }
}

const BASE_URL = '/fdmwaimao/receipt-allocation';

export const RECEIPT_ALLOCATION_DUPLICATE_CONFIRM_REQUIRED = 1_206_013_006;

interface RequestFailure {
  data?: { code?: number | string; msg?: string };
  response?: { data?: { code?: number | string; msg?: string } };
}

export function isReceiptAllocationDuplicateConfirmationError(error: unknown) {
  const failure = error as RequestFailure;
  const code = failure.data?.code ?? failure.response?.data?.code;
  return Number(code) === RECEIPT_ALLOCATION_DUPLICATE_CONFIRM_REQUIRED;
}

export function getReceiptAllocationPage(
  params: FdmWaimaoReceiptAllocationApi.PageReq,
) {
  return requestClient.get<
    PageResult<FdmWaimaoReceiptAllocationApi.Allocation>
  >(`${BASE_URL}/page`, { params });
}

export function getReceiptAllocation(id: string) {
  return requestClient.get<FdmWaimaoReceiptAllocationApi.Allocation>(
    `${BASE_URL}/get`,
    { params: { id } },
  );
}

export function createReceiptAllocationDraft(
  data: FdmWaimaoReceiptAllocationApi.ManualDraftReq,
) {
  const payload: FdmWaimaoReceiptAllocationApi.ManualDraftReq = {
    bankReceiptId: data.bankReceiptId,
    customerId: data.customerId,
    expectedBankReceiptVersion: data.expectedBankReceiptVersion,
    idempotencyKey: data.idempotencyKey,
    lines: data.lines.map((line) => ({
      orderId: line.orderId,
      reason: line.reason,
      sourceAmount: line.sourceAmount,
    })),
    remark: data.remark,
  };
  return requestClient.post<FdmWaimaoReceiptAllocationApi.ActionResult>(
    `${BASE_URL}/create-draft`,
    payload,
  );
}

function transition(
  action: 'apply' | 'cancel' | 'void',
  data: FdmWaimaoReceiptAllocationApi.ActionReq,
) {
  const payload: FdmWaimaoReceiptAllocationApi.ActionReq = {
    confirmPotentialDuplicate: data.confirmPotentialDuplicate,
    expectedVersion: data.expectedVersion,
    id: data.id,
    idempotencyKey: data.idempotencyKey,
    reason: data.reason,
  };
  return requestClient.put<FdmWaimaoReceiptAllocationApi.ActionResult>(
    `${BASE_URL}/${action}`,
    payload,
  );
}

export const applyReceiptAllocation = (
  data: FdmWaimaoReceiptAllocationApi.ActionReq,
) => transition('apply', data);

export const cancelReceiptAllocation = (
  data: FdmWaimaoReceiptAllocationApi.ActionReq,
) => transition('cancel', data);

export const voidReceiptAllocation = (
  data: FdmWaimaoReceiptAllocationApi.ActionReq,
) => transition('void', data);

export function getReceiptAllocationGenerationModels(bankReceiptId: string) {
  return requestClient.get<FdmWaimaoReceiptAllocationApi.ModelOption[]>(
    `${BASE_URL}/generation/models`,
    { params: { bankReceiptId } },
  );
}

export function startReceiptAllocationGeneration(
  data: FdmWaimaoReceiptAllocationApi.GenerationStartReq,
) {
  const payload: FdmWaimaoReceiptAllocationApi.GenerationStartReq = {
    bankReceiptId: data.bankReceiptId,
    expectedSourceVersion: data.expectedSourceVersion,
    idempotencyKey: data.idempotencyKey,
    instruction: data.instruction,
    modelId: data.modelId,
  };
  return requestClient.post<FdmWaimaoReceiptAllocationApi.GenerationTicket>(
    `${BASE_URL}/generation/start`,
    payload,
  );
}

export function getReceiptAllocationGenerationJob(runId: string) {
  return requestClient.get<FdmWaimaoReceiptAllocationApi.GenerationJob>(
    `${BASE_URL}/generation/job`,
    { params: { runId } },
  );
}

export function materializeReceiptAllocationGeneration(
  data: FdmWaimaoReceiptAllocationApi.MaterializeReq,
) {
  const payload: FdmWaimaoReceiptAllocationApi.MaterializeReq = {
    expectedRunVersion: data.expectedRunVersion,
    idempotencyKey: data.idempotencyKey,
    remark: data.remark,
    runId: data.runId,
  };
  return requestClient.post<FdmWaimaoReceiptAllocationApi.ActionResult>(
    `${BASE_URL}/generation/materialize`,
    payload,
  );
}
