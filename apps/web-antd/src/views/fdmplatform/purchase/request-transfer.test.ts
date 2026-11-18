import type { Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import { transferableRequestLines } from './request-transfer';

function contract(requests: unknown[], assignments: unknown[] = []) {
  return { requests, assignments } as unknown as Contract;
}

describe('采购申请按来源明细分批转单', () => {
  it('100 条明细转出 50 条后只带出余下 50 条，原申请保持完整', () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      id: `line-${index}`,
      contractItemId: `item-${index}`,
      quantity: 100,
      availableQuantity: index < 50 ? 0 : 100,
    }));
    const current = contract([{ id: 'request', items }]);
    const result = transferableRequestLines(current, 'request');
    expect(result).toHaveLength(50);
    expect(result[0]?.line.id).toBe('line-50');
    expect(items).toHaveLength(100);
  });

  it('同一合同产品的多条申请保留独立明细，草稿占用后预填可转余额', () => {
    const current = contract([
      {
        id: 'first',
        items: [
          {
            id: 'a',
            contractItemId: 'same',
            quantity: 100,
            draftReservedQuantity: 40,
            availableQuantity: 60,
          },
        ],
      },
      {
        id: 'second',
        items: [
          {
            id: 'b',
            contractItemId: 'same',
            quantity: 100,
            availableQuantity: 100,
          },
        ],
      },
    ]);
    expect(transferableRequestLines(current, 'first')).toMatchObject([
      { line: { id: 'a' }, remaining: '60', requestId: 'first' },
    ]);
    expect(transferableRequestLines(current, 'second')).toMatchObject([
      { line: { id: 'b' }, remaining: '100', requestId: 'second' },
    ]);
  });

  it('任务入口仅带出对应明细，使用任务余额并保留真实申请和任务身份', () => {
    const current = contract(
      [
        {
          id: 'request',
          items: [
            { id: 'a', availableQuantity: 0 },
            { id: 'b', availableQuantity: 100 },
          ],
        },
      ],
      [
        {
          id: 'task',
          requestId: 'request',
          requestItemId: 'a',
          method: 'BUY',
          availableQuantity: 60,
        },
      ],
    );
    expect(transferableRequestLines(current, 'task')).toMatchObject([
      {
        line: { id: 'a' },
        requestId: 'request',
        assignmentId: 'task',
        remaining: '60',
      },
    ]);
  });

  it('没有最新可转投影、存在历史歧义或已取消时不会按原申请量乐观回填', () => {
    expect(
      transferableRequestLines(
        contract([
          {
            id: 'request',
            items: [
              { id: 'missing', quantity: 100 },
              {
                id: 'ambiguous',
                quantity: 100,
                availableQuantity: 100,
                reconciliationRequired: true,
              },
            ],
          },
        ]),
        'request',
      ),
    ).toEqual([]);
    expect(
      transferableRequestLines(
        contract([
          {
            id: 'request',
            status: 'CANCELLED',
            items: [{ id: 'a', availableQuantity: 100 }],
          },
        ]),
        'request',
      ),
    ).toEqual([]);
  });
});
