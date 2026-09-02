import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';
import type {
  TradeRelationLink,
  TradeStatusTone,
} from '#/views/fdm-trade-shared/components';

import { fdmTradeDocumentRoute } from '#/views/fdm-trade-shared/document-links';

export interface RequisitionRelationAccess {
  contract: boolean;
  fulfillmentPlan: boolean;
  requisition: boolean;
  shipment: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  APPROVED: '已审批',
  CANCELLED: '已取消',
  COMPLETED: '已完成',
  CONFIRMED: '已确认',
  DATA_INCOMPLETE: '数据不完整',
  DRAFT: '草稿',
  FAILED: '失败',
  NEEDS_REPLAN: '需要重排',
  READY: '已就绪',
  REJECTED: '已驳回',
  RESERVED: '已预占',
  SHIPPED: '已发货',
  SUBMITTED: '审批中',
  VOIDED: '已作废',
};

function statusPresentation(status?: null | string): {
  label?: string;
  tone?: TradeStatusTone;
} {
  const normalized = status?.trim().toUpperCase();
  if (!normalized) return {};
  const label = STATUS_LABELS[normalized] || status?.trim();
  if (['APPROVED', 'COMPLETED', 'CONFIRMED', 'SHIPPED'].includes(normalized)) {
    return { label, tone: 'success' };
  }
  if (['CANCELLED', 'FAILED', 'REJECTED', 'VOIDED'].includes(normalized)) {
    return { label, tone: 'danger' };
  }
  if (['DATA_INCOMPLETE', 'NEEDS_REPLAN'].includes(normalized)) {
    return { label, tone: 'warning' };
  }
  if (['READY', 'RESERVED', 'SUBMITTED'].includes(normalized)) {
    return { label, tone: 'processing' };
  }
  return { label, tone: 'default' };
}

function unavailableLink(options: {
  description: string;
  key: string;
  permissionGranted: boolean;
  type: string;
}): TradeRelationLink {
  return {
    description: options.description,
    disabled: true,
    icon: 'lucide:lock-keyhole',
    key: options.key,
    label: options.permissionGranted ? '暂无可查看的关联单据' : '暂无查看权限',
    status: options.permissionGranted ? '未返回' : '不可查看',
    statusTone: 'default',
    type: options.type,
  };
}

function sourceLink(options: {
  access: boolean;
  description: string;
  icon: string;
  keyPrefix: string;
  reference?: FdmProcurementRequisitionApi.TraceabilityDocumentRef | null;
  routeType: 'contract-order' | 'demand-plan';
  type: string;
}): TradeRelationLink {
  if (!options.access) {
    return unavailableLink({
      description: `缺少${options.type}查看权限`,
      key: `${options.keyPrefix}-unavailable`,
      permissionGranted: false,
      type: options.type,
    });
  }

  if (!options.reference) {
    return unavailableLink({
      description: '当前详情响应没有返回可验证的来源单据引用',
      key: `${options.keyPrefix}-missing`,
      permissionGranted: true,
      type: options.type,
    });
  }

  if (options.reference.accessible !== true) {
    return unavailableLink({
      description: `${options.type}不在当前账号数据范围内`,
      key: `${options.keyPrefix}-unavailable`,
      permissionGranted: false,
      type: options.type,
    });
  }

  if (!options.reference.id) {
    return unavailableLink({
      description: '服务端没有返回当前用户可查看的真实单据身份',
      key: `${options.keyPrefix}-identity-missing`,
      permissionGranted: true,
      type: options.type,
    });
  }

  const reference = options.reference!;
  const status = statusPresentation(reference.status);
  const meta = [
    reference.version === null || reference.version === undefined
      ? undefined
      : `v${reference.version}`,
    reference.matchedLineCount
      ? `匹配 ${reference.matchedLineCount} 行`
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    description: options.description,
    icon: options.icon,
    key: `${options.keyPrefix}-${reference.id}`,
    label: reference.documentNo?.trim() || `${options.type} ${reference.id}`,
    meta: meta || undefined,
    status: status.label,
    statusTone: status.tone,
    to: fdmTradeDocumentRoute(options.routeType, reference.id!),
    type: options.type,
  };
}

export function buildRequisitionRelationLinks(
  requisition: FdmProcurementRequisitionApi.Requisition,
  access: RequisitionRelationAccess,
): TradeRelationLink[] {
  const traceability = requisition.traceability;
  const requisitionStatus = statusPresentation(requisition.status);
  const shipments = traceability?.shipments || [];

  const links: TradeRelationLink[] = [
    sourceLink({
      access: access.contract,
      description: '业务起点：客户确认的外贸合同订单',
      icon: 'lucide:file-signature',
      keyPrefix: 'contract',
      reference: traceability?.sourceContract,
      routeType: 'contract-order',
      type: '合同订单',
    }),
    sourceLink({
      access: access.fulfillmentPlan,
      description: '合同产品经过库存、生产与外采拆分后的确认计划',
      icon: 'lucide:workflow',
      keyPrefix: 'plan',
      reference: traceability?.sourceFulfillmentPlan,
      routeType: 'demand-plan',
      type: '履约需求计划',
    }),
    {
      description: '当前采购申请，保留合同与履约计划的来源血缘',
      disabled: !access.requisition,
      icon: 'lucide:clipboard-list',
      key: `requisition-${requisition.id}`,
      label: access.requisition ? requisition.requisitionNo : '暂无查看权限',
      meta: access.requisition ? `版本 v${requisition.version}` : undefined,
      status: access.requisition ? requisitionStatus.label : '不可查看',
      statusTone: access.requisition ? requisitionStatus.tone : 'default',
      to: access.requisition
        ? fdmTradeDocumentRoute('purchase-requisition', requisition.id)
        : undefined,
      type: '采购申请单',
    },
  ];

  if (!access.shipment || traceability?.shipmentQueryAllowed === false) {
    links.push(
      unavailableLink({
        description: '缺少发货管理查看权限',
        key: 'shipment-unavailable',
        permissionGranted: false,
        type: '发货单',
      }),
    );
    return links;
  }

  if (!traceability || traceability.shipmentQueryAllowed !== true) {
    links.push({
      description: '当前详情响应没有返回可验证的发货关联查询结果',
      disabled: true,
      icon: 'lucide:package-search',
      key: 'shipment-traceability-missing',
      label: '服务端未返回发货关联关系',
      status: '未返回',
      statusTone: 'default',
      type: '发货单',
    });
    return links;
  }

  if (shipments.length === 0) {
    links.push({
      description: '服务端尚未返回当前用户可查看的真实发货单',
      disabled: true,
      icon: 'lucide:package-open',
      key: 'shipment-empty',
      label: '尚未生成或暂无可查看的发货单',
      status: '未生成',
      statusTone: 'default',
      type: '发货单',
    });
    return links;
  }

  links.push(
    ...shipments.map((shipment, index) => {
      if (shipment.accessible !== true || !shipment.id) {
        return unavailableLink({
          description: '发货单不在当前账号数据范围内或缺少真实单据身份',
          key: `shipment-unavailable-${shipment.documentType}-${index}`,
          permissionGranted: false,
          type: '发货单',
        });
      }
      const status = statusPresentation(shipment.status);
      const meta = [
        shipment.version === null || shipment.version === undefined
          ? undefined
          : `v${shipment.version}`,
        shipment.matchedLineCount
          ? `匹配 ${shipment.matchedLineCount} 个采购来源行`
          : undefined,
      ]
        .filter(Boolean)
        .join(' · ');
      return {
        description:
          '按采购申请行与发货行共同的履约计划行匹配，不表示采购申请直接生成发货单',
        icon: 'lucide:package-check',
        key: `shipment-${shipment.id}`,
        label: shipment.documentNo?.trim() || `发货单 ${shipment.id}`,
        meta: meta || undefined,
        status: status.label,
        statusTone: status.tone,
        to: fdmTradeDocumentRoute('shipment', shipment.id),
        type: '发货单',
      } satisfies TradeRelationLink;
    }),
  );
  return links;
}
