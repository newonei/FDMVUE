import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';

import { describe, expect, it } from 'vitest';

import { buildRequisitionRelationLinks } from './relation-links';

function requisition(
  traceability?: FdmProcurementRequisitionApi.RequisitionTraceability,
): FdmProcurementRequisitionApi.Requisition {
  return {
    companyId: '1',
    id: '301',
    items: [],
    ownerUserId: '164',
    requisitionNo: 'WM-PR-301',
    sourceOrderId: '101',
    sourceOrderVersion: 2,
    sourcePlanId: '201',
    sourcePlanVersion: 3,
    sourceSnapshotHash: 'a'.repeat(64),
    status: 'READY',
    traceability,
    validationStatus: 'PASSED',
    version: 4,
  };
}

const fullAccess = {
  contract: true,
  fulfillmentPlan: true,
  requisition: true,
  shipment: true,
};

describe('procurement requisition relation links', () => {
  it('builds only trusted internal routes from real relation ids', () => {
    const links = buildRequisitionRelationLinks(
      requisition({
        shipments: [
          {
            accessible: true,
            documentNo: 'WM-SHP-401',
            documentType: 'SHIPMENT',
            id: '401',
            matchedLineCount: 2,
            status: 'DRAFT',
            version: 1,
          },
        ],
        shipmentQueryAllowed: true,
        sourceContract: {
          accessible: true,
          documentNo: 'DD-101',
          documentType: 'CONTRACT_ORDER',
          id: '101',
          status: 'CONFIRMED',
          version: 2,
        },
        sourceFulfillmentPlan: {
          accessible: true,
          documentNo: 'WM-FUL-201',
          documentType: 'FULFILLMENT_PLAN',
          id: '201',
          status: 'CONFIRMED',
          version: 3,
        },
      }),
      fullAccess,
    );

    expect(links.map((link) => link.label)).toEqual([
      'DD-101',
      'WM-FUL-201',
      'WM-PR-301',
      'WM-SHP-401',
    ]);
    expect(links[0]?.to).toBe('/fdmwaimao/contract-order/detail/101');
    expect(links[1]?.to).toBe('/fdmwaimao/demand-analysis/detail/201');
    expect(links[2]?.to).toBe('/fdmprocurement/requisition/detail/301');
    expect(links[3]?.to).toEqual({
      path: '/fdmwaimao/shipment',
      query: { shipmentId: '401' },
    });
    expect(links[3]?.description).toContain('共同的履约计划行匹配');
  });

  it('renders explicit disabled states instead of fake links', () => {
    const links = buildRequisitionRelationLinks(
      requisition({
        shipmentQueryAllowed: false,
        shipments: [],
        sourceContract: {
          accessible: false,
          documentType: 'CONTRACT_ORDER',
        },
        sourceFulfillmentPlan: {
          accessible: false,
          documentType: 'FULFILLMENT_PLAN',
        },
      }),
      {
        contract: false,
        fulfillmentPlan: true,
        requisition: true,
        shipment: true,
      },
    );

    expect(links).toHaveLength(4);
    expect(links[0]).toEqual(
      expect.objectContaining({
        disabled: true,
        label: '暂无查看权限',
      }),
    );
    expect(links[0]?.to).toBeUndefined();
    expect(links[1]).toEqual(
      expect.objectContaining({
        disabled: true,
        label: '暂无查看权限',
      }),
    );
    expect(links[1]?.to).toBeUndefined();
    expect(links[3]).toEqual(
      expect.objectContaining({
        disabled: true,
        label: '暂无查看权限',
      }),
    );
    expect(links[3]?.to).toBeUndefined();
  });

  it('keeps the shipment stage as a disabled empty state when no matched shipment exists', () => {
    const links = buildRequisitionRelationLinks(
      requisition({
        shipmentQueryAllowed: true,
        shipments: [],
      }),
      fullAccess,
    );

    expect(links[3]).toEqual(
      expect.objectContaining({
        disabled: true,
        label: '尚未生成或暂无可查看的发货单',
      }),
    );
    expect(links[3]?.to).toBeUndefined();
  });

  it('does not infer an empty shipment stage when the backend omitted traceability', () => {
    const links = buildRequisitionRelationLinks(requisition(), fullAccess);

    expect(links[0]).toEqual(
      expect.objectContaining({
        disabled: true,
        key: 'contract-missing',
        label: '暂无可查看的关联单据',
      }),
    );
    expect(links[1]).toEqual(
      expect.objectContaining({
        disabled: true,
        key: 'plan-missing',
        label: '暂无可查看的关联单据',
      }),
    );
    expect(links[3]).toEqual(
      expect.objectContaining({
        disabled: true,
        key: 'shipment-traceability-missing',
        label: '服务端未返回发货关联关系',
      }),
    );
    expect(links[3]?.to).toBeUndefined();
  });

  it('keeps invalid shipment references disabled with stable unique keys', () => {
    const links = buildRequisitionRelationLinks(
      requisition({
        shipmentQueryAllowed: true,
        shipments: [
          { accessible: false, documentType: 'SHIPMENT' },
          { accessible: false, documentType: 'SHIPMENT' },
        ],
      }),
      fullAccess,
    );

    expect(links.slice(3).map((link) => link.key)).toEqual([
      'shipment-unavailable-SHIPMENT-0',
      'shipment-unavailable-SHIPMENT-1',
    ]);
    expect(links.slice(3).every((link) => !link.to && link.disabled)).toBe(
      true,
    );
  });

  it('falls back to the real id when an accessible reference has no document number', () => {
    const links = buildRequisitionRelationLinks(
      requisition({
        shipmentQueryAllowed: true,
        shipments: [],
        sourceContract: {
          accessible: true,
          documentNo: null,
          documentType: 'CONTRACT_ORDER',
          id: '101',
        },
      }),
      fullAccess,
    );

    expect(links[0]).toEqual(
      expect.objectContaining({
        label: '合同订单 101',
        to: '/fdmwaimao/contract-order/detail/101',
      }),
    );
  });
});
