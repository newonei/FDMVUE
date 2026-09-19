import { requestClient } from '#/api/request';

export type ContractReviewStatus =
  | 'AI_PENDING'
  | 'AUTO_APPROVED'
  | 'HUMAN_APPROVED'
  | 'MANUAL_REQUIRED'
  | 'RETURNED'
  | 'STALE';

export interface ContractReview {
  id: string;
  contractId: string;
  contractCode: string;
  businessVersion: number;
  contractVersion: number;
  submittedContractVersion: number;
  current: boolean;
  status: ContractReviewStatus;
  executionStatus: string;
  reasonCode?: string;
  summary: string;
  ruleIssues: string[];
  unreadAttachments: boolean;
  requestedBy: number;
  reviewerUserId: number;
  inboxUnavailableReason?: string;
  decisionSource?: 'HUMAN' | 'SYSTEM_AI';
  decidedBy?: number;
  decisionReason?: string;
  createdAt: string;
  completedAt?: string;
  ruleVersion: string;
  promptVersion: string;
  result?: {
    dataSufficient: boolean;
    evidenceIds: string[];
    issues: {
      evidenceIds: string[];
      message: string;
      severity: 'HIGH' | 'INFO' | 'WARNING';
    }[];
    summary: string;
    verdict: 'INSUFFICIENT' | 'PASS' | 'REVIEW';
  };
}

function base(contractId: string) {
  return `/fdmplatform/v1/contracts/${encodeURIComponent(contractId)}/reviews`;
}
export function getContractReviews(contractId: string) {
  return requestClient.get<ContractReview[]>(base(contractId));
}
export function submitContractReview(
  contractId: string,
  expectedVersion: number,
  idempotencyKey: string,
  reviewerUserId?: number,
) {
  return requestClient.post<ContractReview>(base(contractId), {
    expectedVersion,
    idempotencyKey,
    reviewerUserId,
  });
}
export function refreshContractReview(
  contractId: string,
  reviewId: string,
  expectedVersion: number,
) {
  return requestClient.post<ContractReview>(
    `${base(contractId)}/${encodeURIComponent(reviewId)}/refresh`,
    { expectedVersion },
  );
}
export function decideContractReview(
  contractId: string,
  reviewId: string,
  data: {
    decision: 'APPROVE' | 'RETURN';
    expectedVersion: number;
    idempotencyKey: string;
    reason: string;
  },
) {
  return requestClient.post<ContractReview>(
    `${base(contractId)}/${encodeURIComponent(reviewId)}/decision`,
    data,
  );
}
