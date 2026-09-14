import type { DocumentKind } from '../documents/model';

import type { DocumentRow, PageQuery } from '#/api/fdmplatform';

import { documentDefinitions } from '../documents/model';

export type ContractDocumentKind = 'customs' | DocumentKind;

export function contractDocumentLaunch(kind: ContractDocumentKind) {
  if (['costs', 'customs', 'plans', 'tasks'].includes(kind))
    return { kind, mode: 'list' as const, action: undefined };
  const action = documentDefinitions[kind as DocumentKind].create[0];
  return { kind, mode: 'create' as const, action };
}

export function contractDocumentQuery(
  contractId: string,
  kind: DocumentKind,
  pageNo: number,
  pageSize: number,
  keyword?: string,
) {
  if (!contractId.trim()) throw new Error('请先选择关联合同');
  const params: PageQuery = {
    companyId: 0,
    contractId,
    pageNo,
    pageSize,
    keyword: keyword?.trim() || undefined,
  };
  return { resource: documentDefinitions[kind].resource, params };
}

export function contractDocumentRow(row: DocumentRow, contractId: string) {
  if (!contractId || row.contractId !== contractId)
    throw new Error('此单据不属于当前合同，请刷新后重新选择');
  return row.standaloneId ? { standaloneId: row.standaloneId } : { row };
}
