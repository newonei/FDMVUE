import type { Contract, Directory, MasterRecord } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import { field, masterOptions } from './data';
import { withDirectory, withEvidence } from './directory';
import {
  contextualValues,
  contractDetailTabs,
  detailTabFor,
  workspaceAllowsAction,
  workspaces,
} from './workspaces';

describe('shared business collaboration', () => {
  it('opens every contract detail tab from every business menu', () => {
    for (const workspace of Object.keys(
      workspaces,
    ) as (keyof typeof workspaces)[]) {
      for (const tab of contractDetailTabs) {
        expect(detailTabFor(workspace, tab)).toBe(tab);
      }
    }
  });
  it('offers finance and procurement operations in trade contracts when their business states permit them', () => {
    const contract = {
      companyId: 21,
      ownerUserId: 99,
      allowedActions: ['CREATE_REQUEST', 'DECIDE_PLAN', 'CONFIRM_RECEIPT'],
    } as Contract;
    for (const workspace of Object.keys(
      workspaces,
    ) as (keyof typeof workspaces)[]) {
      expect(workspaceAllowsAction(workspace, contract, 'DECIDE_PLAN')).toBe(
        true,
      );
      expect(
        workspaceAllowsAction(workspace, contract, 'CONFIRM_RECEIPT'),
      ).toBe(true);
      expect(workspaceAllowsAction(workspace, contract, 'CREATE_REQUEST')).toBe(
        true,
      );
    }
  });
  it('keeps unavailable business transitions disabled and waits for an actual contract', () => {
    const contract = { allowedActions: ['CREATE_REQUEST'] } as Contract;
    expect(
      workspaceAllowsAction('finance-receipts', contract, 'REVERSE_RECEIPT'),
    ).toBe(false);
    expect(
      workspaceAllowsAction('trade-contracts', undefined, 'CREATE_REQUEST'),
    ).toBe(false);
  });
  it('keeps department lists and initial tabs useful without treating them as access scopes', () => {
    expect(workspaces['trade-requests'].groups?.[0]?.resource).toBe(
      'purchase-requests',
    );
    expect(
      workspaces['purchase-tasks'].groups?.map((group) => group.resource),
    ).toEqual(['assignments', 'purchase-requests']);
    expect(workspaces['finance-invoices'].groups?.[0]?.resource).toBe(
      'invoices',
    );
    expect(detailTabFor('trade-requests', 'cost')).toBe('progress');
    expect(detailTabFor('finance-costs', 'purchase')).toBe('progress');
    expect(detailTabFor('purchase-orders', 'unknown')).toBe('progress');
    expect(detailTabFor('finance-costs', undefined)).toBe('progress');
    expect(contractDetailTabs).toEqual([
      'overview',
      'products',
      'progress',
      'audit',
      'attachments',
    ]);
  });
  it('carries a selected document identity and approval version, never replacing contract version', () => {
    expect(
      contextualValues('purchase-plans', { id: 'plan-a', version: 3 }),
    ).toEqual({ planId: 'plan-a', planVersion: 3 });
    expect(
      contextualValues('purchase-orders', { id: 'order-a', version: 9 }),
    ).toEqual({ orderId: 'order-a' });
  });
});

describe('real identity and evidence inputs', () => {
  it('excludes disabled master records from new business choices without mutating the history data', () => {
    const records = [
      {
        id: 'enabled-sku',
        type: 'SKU',
        name: '现用品',
        code: 'SKU-A',
        active: true,
      },
      {
        id: 'disabled-sku',
        type: 'SKU',
        name: '停用品',
        code: 'SKU-B',
        active: false,
      },
    ] as MasterRecord[];
    expect(masterOptions(records, 'SKU').map((option) => option.value)).toEqual(
      ['enabled-sku'],
    );
    expect(records[1]?.id).toBe('disabled-sku');
    expect(records).toHaveLength(2);
  });
  it('offers server directory identities with department names without guessing from a name', () => {
    const directory: Directory = {
      users: [
        {
          id: 12,
          nickname: '采购甲',
          departmentId: 3,
          departmentName: '采购部门',
        },
      ],
      departments: [{ id: 3, name: '采购部门' }],
      companies: [],
    };
    const result = withDirectory(
      {
        action: 'ASSIGN_FULFILLMENT',
        title: '分派',
        description: '',
        fields: [
          field('ownerUserId', '经办人用户 ID', 'number'),
          field('departmentId', '业务部门 ID', 'number'),
        ],
      },
      directory,
    );
    expect(result.fields[0]?.type).toBe('select');
    expect(result.fields[0]?.options?.[0]).toEqual({
      value: 12,
      label: '采购甲 · 采购部门 (#12)',
    });
    expect(result.fields[1]?.options).toEqual([
      { value: 3, label: '采购部门' },
    ]);
  });
  it('keeps historical references and translates prior evidence strings for selectable attachment inputs', () => {
    const result = withEvidence(
      {
        action: 'CREATE_QUOTE',
        title: '报价',
        description: '',
        fields: [
          field('evidenceIds', '证据', 'textarea'),
          field('evidenceRef', '回款凭证'),
        ],
        initialValues: {
          evidenceIds: 'old-ref,archive-ref',
          evidenceRef: 'archive-ref',
        },
      },
      [],
    );
    expect(result.fields[0]?.type).toBe('references');
    expect(result.fields[1]?.type).toBe('reference');
    expect(result.initialValues?.evidenceIds).toEqual([
      'old-ref',
      'archive-ref',
    ]);
    expect(result.initialValues?.evidenceRef).toBe('archive-ref');
  });
});
