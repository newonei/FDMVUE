import type { DocumentKind } from './model';

import type { AttachmentTarget } from '#/api/fdmplatform';

const paths: Record<DocumentKind, string> = {
  requests: 'requests',
  tasks: 'assignments',
  quotes: 'quotes',
  plans: 'plans',
  orders: 'purchaseOrders',
  arrivals: 'arrivals',
  purchaseReturns: 'returns',
  production: 'productionProgress',
  shipments: 'shipments',
  salesReturns: 'shipments',
  receipts: 'finance.receipts',
  refunds: 'finance.receipts',
  invoices: 'finance.invoices',
  allocations: 'finance.allocations',
  costs: 'finance.costs',
};
export function documentAttachmentTarget(
  kind: DocumentKind,
  id: string,
): AttachmentTarget {
  return { targetKind: paths[kind], targetId: id };
}
