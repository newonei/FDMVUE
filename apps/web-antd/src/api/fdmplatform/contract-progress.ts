import { requestClient } from '#/api/request';

export interface ContractRelatedSummary {
  requests: { active: number; total: number };
  purchaseOrders: { received: number; total: number };
  shipments: { total: number };
  receipts: {
    confirmed?: number;
    other?: number;
    pending?: number;
    /** Optional during rolling deployment; absent is not zero. */
    statusBreakdownAvailable?: boolean;
    total: number;
  };
  invoices: { total: number };
}
export function getContractRelatedSummary(contractId: string) {
  return requestClient.get<ContractRelatedSummary>(
    `/fdmplatform/v1/contracts/${encodeURIComponent(contractId)}/related-summary`,
  );
}
