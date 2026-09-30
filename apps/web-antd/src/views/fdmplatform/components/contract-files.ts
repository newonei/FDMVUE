import type {
  ContractFile,
  ContractFileGroup,
} from '#/api/fdmplatform/contract-files';

/** 合同附件上传分类 */
export const contractAttachmentCategories: Record<string, string> = {
  SPECIFICATION: '产品规格',
  SALES: '商业合同',
  PROCUREMENT: '询价采购',
  RECEIPT: '回款凭证',
  FINANCE: '发票与成本',
  STOCK: '库存与物流',
};

export const contractFileGroups: { key: ContractFileGroup; label: string }[] = [
  { key: 'CONTRACT', label: '合同资料' },
  { key: 'PRODUCT', label: '产品标准资料' },
  { key: 'PURCHASE', label: '采购' },
  { key: 'CUSTOMS', label: '报关' },
  { key: 'LOGISTICS', label: '仓储物流' },
  { key: 'FINANCE', label: '财务' },
];

export interface ContractFileFilter {
  group: 'ALL' | ContractFileGroup;
  keyword: string;
  showSuperseded: boolean;
}

/** 分组数量与当前是否显示旧版本一致，不随分组和关键词变化 */
export function contractFileCounts(
  items: readonly ContractFile[],
  showSuperseded: boolean,
): Record<'ALL' | ContractFileGroup, number> {
  const counts = { ALL: 0 } as Record<'ALL' | ContractFileGroup, number>;
  for (const group of contractFileGroups) counts[group.key] = 0;
  for (const item of items) {
    if (item.superseded && !showSuperseded) continue;
    counts.ALL++;
    counts[item.group] = (counts[item.group] ?? 0) + 1;
  }
  return counts;
}

export function contractFileSource(file: ContractFile): string {
  return [file.sourceTitle, file.sourceCode].filter(Boolean).join(' ');
}

export function filterContractFiles(
  items: readonly ContractFile[],
  filter: ContractFileFilter,
): ContractFile[] {
  const keyword = filter.keyword.trim().toLowerCase();
  return items.filter(
    (item) =>
      (filter.showSuperseded || !item.superseded) &&
      (filter.group === 'ALL' || item.group === filter.group) &&
      (!keyword ||
        [item.name, contractFileSource(item), item.categoryLabel]
          .join(' ')
          .toLowerCase()
          .includes(keyword)),
  );
}
