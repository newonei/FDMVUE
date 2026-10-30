import type { ContractFile } from '#/api/fdmplatform/contract-files';

import { describe, expect, it } from 'vitest';

import {
  contractFileCounts,
  contractFileSource,
  filterContractFiles,
} from './contract-files';

function file(overrides: Partial<ContractFile>): ContractFile {
  return {
    id: 'f',
    source: 'CONTRACT',
    group: 'CONTRACT',
    sourceKind: 'CONTRACT',
    sourceTitle: '合同',
    sourceCode: 'HT-1',
    category: 'SALES',
    categoryLabel: '商业合同',
    name: 'PI.pdf',
    size: 10,
    superseded: false,
    ...overrides,
  };
}

const items = [
  file({ id: 'pi' }),
  file({
    id: 'declaration-v1',
    source: 'CUSTOMS',
    group: 'CUSTOMS',
    sourceTitle: '报关批次',
    sourceCode: 'BG-7',
    categoryLabel: '委托及申报资料',
    name: '报关单.pdf',
    superseded: true,
  }),
  file({
    id: 'declaration-v2',
    source: 'CUSTOMS',
    group: 'CUSTOMS',
    sourceTitle: '报关批次',
    sourceCode: 'BG-7',
    categoryLabel: '委托及申报资料',
    name: '报关单-v2.pdf',
  }),
  file({
    id: 'payment',
    source: 'PROC_FINANCE',
    group: 'FINANCE',
    sourceTitle: '采购请款单',
    sourceCode: null,
    categoryLabel: '采购财务凭据',
    name: '水单.png',
  }),
];

describe('合同全部附件', () => {
  it('分组数量默认不计已替换的旧版本', () => {
    expect(contractFileCounts(items, false)).toMatchObject({
      ALL: 3,
      CONTRACT: 1,
      CUSTOMS: 1,
      FINANCE: 1,
      PURCHASE: 0,
    });
    expect(contractFileCounts(items, true).CUSTOMS).toBe(2);
  });

  it('按分组、关键词筛选，关键词覆盖文件名、来源单号和分类', () => {
    const base = { group: 'ALL', keyword: '', showSuperseded: false } as const;
    expect(
      filterContractFiles(items, { ...base, group: 'CUSTOMS' }).map(
        (item) => item.id,
      ),
    ).toEqual(['declaration-v2']);
    expect(
      filterContractFiles(items, {
        ...base,
        group: 'CUSTOMS',
        showSuperseded: true,
      }),
    ).toHaveLength(2);
    expect(
      filterContractFiles(items, { ...base, keyword: 'bg-7' }).map(
        (item) => item.id,
      ),
    ).toEqual(['declaration-v2']);
    expect(
      filterContractFiles(items, { ...base, keyword: ' 财务凭据 ' }).map(
        (item) => item.id,
      ),
    ).toEqual(['payment']);
  });

  it('来源显示单据类型与单号，无单号时只显示类型', () => {
    expect(contractFileSource(items[2]!)).toBe('报关批次 BG-7');
    expect(contractFileSource(items[3]!)).toBe('采购请款单');
  });
});
