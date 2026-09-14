import { requestClient } from '#/api/request';

export interface ContractRelatedSummary {
  requests: { active: number; total: number };
  purchaseOrders: { received: number; total: number };
  shipments: { total: number };
  receipts: { total: number };
  invoices: { total: number };
}
export function getContractRelatedSummary(contractId: string) {
  return requestClient.get<ContractRelatedSummary>(
    `/fdmplatform/v1/contracts/${encodeURIComponent(contractId)}/related-summary`,
  );
}
