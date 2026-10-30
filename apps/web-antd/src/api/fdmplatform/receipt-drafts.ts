import { requestClient } from '#/api/request';

/** 回款草稿：只存表单内容，不计入合同回款；提交时随 CREATE_RECEIPT 带上 draftId */
export interface ReceiptDraft {
  id: string;
  values: Record<string, string>;
  createdAt?: number | string;
  updatedAt?: number | string;
  version: number;
}

const base = (contractId: string) =>
  `/fdmplatform/v1/contracts/${encodeURIComponent(contractId)}/receipt-drafts`;

export function getReceiptDrafts(contractId: string) {
  return requestClient.get<ReceiptDraft[]>(base(contractId));
}

export function saveReceiptDraft(
  contractId: string,
  values: Record<string, unknown>,
  draft?: Pick<ReceiptDraft, 'id' | 'version'>,
) {
  return requestClient.post<ReceiptDraft>(base(contractId), {
    draftId: draft?.id,
    expectedVersion: draft?.version,
    values,
  });
}

export function deleteReceiptDraft(contractId: string, draftId: string) {
  return requestClient.delete<boolean>(
    `${base(contractId)}/${encodeURIComponent(draftId)}`,
  );
}
