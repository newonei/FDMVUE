import { requestClient } from '#/api/request';

import {
  deleteBusinessDocumentFile,
  downloadBusinessDocumentFile,
  renameBusinessDocumentFile,
} from './business-documents';
import { deleteCustomsFile, downloadCustomsFile } from './customs';
import {
  deleteAttachment,
  downloadAttachment,
  renameAttachment,
} from './index';
import {
  deleteProcurementFile,
  downloadProcurementFile,
  getProcurementOrder,
} from './procurement';
import {
  deleteProcurementFinanceFile,
  downloadProcurementFinanceFile,
} from './procurement-finance';
import { downloadContractProductAttachment } from './products';

/** 下载来源：决定走哪个既有下载接口 */
export type ContractFileSource =
  | 'BUSINESS'
  | 'CONTRACT'
  | 'CUSTOMS'
  | 'PROC_CONTRACT'
  | 'PROC_FINANCE'
  | 'PRODUCT';
export type ContractFileGroup =
  | 'CONTRACT'
  | 'CUSTOMS'
  | 'FINANCE'
  | 'LOGISTICS'
  | 'PRODUCT'
  | 'PURCHASE';
export interface ContractFile {
  id: string;
  source: ContractFileSource;
  group: ContractFileGroup;
  sourceKind: string;
  sourceTitle: string;
  sourceId?: null | string;
  sourceCode?: null | string;
  /** 报关批次、采购财务单据、独立单据或采购单编号 */
  parentId?: null | string;
  category: string;
  categoryLabel: string;
  name: string;
  type?: null | string;
  size: number;
  uploadedBy?: null | number;
  /** 接口按时间戳返回 */
  createdAt?: null | number | string;
  revision?: null | number;
  /** 报关资料已被新版本替换 */
  superseded: boolean;
  canDelete?: boolean;
}
export interface ContractFileListing {
  enabled: boolean;
  uploadCategories: string[];
  items: ContractFile[];
}

export function getContractFiles(contractId: string) {
  return requestClient.get<ContractFileListing>(
    `/fdmplatform/v1/contracts/${encodeURIComponent(contractId)}/related-files`,
  );
}

/** 各来源自己的下载接口会重新校验归属与读取权限 */
export function downloadContractFile(
  contractId: string,
  file: ContractFile,
): Promise<Blob> {
  const parent = file.parentId ?? '';
  switch (file.source) {
    case 'BUSINESS': {
      return downloadBusinessDocumentFile(parent, file.id);
    }
    case 'CUSTOMS': {
      return downloadCustomsFile(parent, file.id);
    }
    case 'PROC_CONTRACT': {
      return downloadProcurementFile(contractId, parent, file.id);
    }
    case 'PROC_FINANCE': {
      return downloadProcurementFinanceFile(parent, file.id);
    }
    case 'PRODUCT': {
      return downloadContractProductAttachment(contractId, file.id);
    }
    default: {
      return downloadAttachment(contractId, file.id);
    }
  }
}

/** 合同资料和独立单据附件支持改名；报关、采购财务等仍按各自流程管理 */
export function contractFileRenamable(file: ContractFile) {
  return file.source === 'CONTRACT' || file.source === 'BUSINESS';
}

export function renameContractFile(
  contractId: string,
  file: ContractFile,
  name: string,
  idempotencyKey: string,
) {
  return file.source === 'BUSINESS'
    ? renameBusinessDocumentFile(
        file.parentId ?? '',
        file.id,
        name,
        idempotencyKey,
      )
    : renameAttachment(contractId, file.id, name, idempotencyKey);
}

export async function deleteContractFile(
  contractId: string,
  file: ContractFile,
  idempotencyKey: string,
) {
  const parent = file.parentId ?? '';
  switch (file.source) {
    case 'BUSINESS': {
      return deleteBusinessDocumentFile(parent, file.id);
    }
    case 'CONTRACT': {
      return deleteAttachment(contractId, file.id);
    }
    case 'CUSTOMS': {
      return deleteCustomsFile(parent, file.id);
    }
    case 'PROC_CONTRACT': {
      const order = await getProcurementOrder(contractId, parent);
      return deleteProcurementFile(contractId, parent, file.id, {
        contractVersion: order.version,
        expectedVersion: order.details.version,
        idempotencyKey,
      });
    }
    case 'PROC_FINANCE': {
      return deleteProcurementFinanceFile(parent, file.id);
    }
    default: {
      throw new Error('当前资料由产品档案维护');
    }
  }
}
