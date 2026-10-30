import type { FdmcaiwuEcProfitApi } from '#/api/fdmcaiwu/ec-profit';

import { formatMetric, METRIC_GROUPS, toNumber } from './model';

type Node = FdmcaiwuEcProfitApi.GroupNode;
type MetricKey = keyof FdmcaiwuEcProfitApi.Metric;
export type TableNode = Omit<Node, 'children'> & { children?: TableNode[] };

/** Ant Table treats an empty children array as expandable; preserve API nodes unchanged. */
export function tableTree(nodes: Node[]): TableNode[] {
  return nodes.map(({ children, ...node }) => ({
    ...node,
    ...(children.length ? { children: tableTree(children) } : {}),
  }));
}

export const ALL_METRICS = METRIC_GROUPS.flatMap((group) => group.metrics);
export const CORE_METRICS: MetricKey[] = [
  'salesAmount',
  'purchaseCost',
  'dropshipPurchaseCost',
  'freightCost',
  'promotionCost',
  'platformFee',
  'taxFee',
  'grossProfit',
  'grossMargin',
];
export function financialColumns(full: boolean) {
  return ALL_METRICS.filter(
    (metric) => full || CORE_METRICS.includes(metric.key),
  ).map((metric) => ({
    title: metric.key === 'purchaseCost' ? '采购成本' : metric.label,
    key: metric.key,
    align: 'right' as const,
    width: metric.rate ? 96 : 128,
    fixed:
      metric.key === 'grossProfit' || metric.key === 'grossMargin'
        ? ('right' as const)
        : undefined,
  }));
}
export function isRateMetric(key: string) {
  return ALL_METRICS.find((metric) => metric.key === key)?.rate ?? false;
}
export function metricLabel(key: string) {
  return ALL_METRICS.find((metric) => metric.key === key)?.label ?? key;
}
export function nodeMetric(node: Node, key: string, received = false) {
  const values = received ? node.receivedSummary : node.summary;
  return formatMetric(values?.[key as MetricKey], isRateMetric(key));
}
export const UNCONFIGURED_KEY = 'UNCONFIGURED';

export function nodeState(node: Node) {
  if (node.nodeType === 'ADJUSTMENT')
    return node.item?.dataStatus === 'IMPORTED' ? '费用已导入' : '费用待导入';
  if (node.nodeType === 'SHOP')
    return node.item?.dataStatus === 'IMPORTED'
      ? node.dataState === 'COMPLETE'
        ? '已导入'
        : '指标待补齐'
      : '待导入';
  if (node.expectedShopCount === 0 && node.adjustmentCount === 0)
    return '本月无应报店铺';
  return {
    COMPLETE: '数据完整',
    EMPTY: '暂无数据',
    PARTIAL: '部分完成',
    WAITING_IMPORT: '待导入',
  }[node.dataState];
}
export function coverageText(node: Node) {
  return `${node.importedShopCount} / ${node.expectedShopCount} 家已导入`;
}
/** 'shop' 展开全部分组看到店铺，'group' 只看分组行 */
export function expansionKeys(nodes: Node[], level: 'group' | 'shop'): string[] {
  return level === 'shop'
    ? nodes.filter((node) => node.children.length > 0).map((node) => node.key)
    : [];
}
export function filterTree(nodes: Node[], groupKey?: string): Node[] {
  return groupKey ? nodes.filter((node) => node.key === groupKey) : nodes;
}
export function findGroup(nodes: Node[], key: string) {
  return nodes.find((node) => node.key === key);
}
export function yearCell(row: FdmcaiwuEcProfitApi.YearGroup, month: string) {
  return row.months.find((cell) => cell.month === month);
}
export function selectedTotal(
  view: FdmcaiwuEcProfitApi.MonthlyView,
  groupKey?: string,
) {
  return groupKey ? findGroup(view.groups, groupKey) : view.total;
}

/** 节点是否已全部导入：此时完整合计即可展示，否则只有已导入小计。 */
export function fullyImported(node: Node) {
  return (
    node.expectedShopCount === node.importedShopCount &&
    node.pendingAdjustmentCount === 0
  );
}

/** 全部导入则用完整合计，否则用已导入小计（调用方须标明）。 */
export function displaySummary(node: Node) {
  return fullyImported(node) ? node.summary : node.receivedSummary;
}

export interface LeafRow extends Omit<Node, 'children'> {
  groupKey: string;
  groupLabel: string;
}

/** 店铺及费用行拍平，用于排行、搜索和排序。 */
export function leafRows(groups: Node[]): LeafRow[] {
  return groups.flatMap((group) =>
    group.children.map(({ children: _children, ...leaf }) => ({
      ...leaf,
      groupKey: group.key,
      groupLabel: group.name,
    })),
  );
}

export interface GroupRank {
  key: string;
  name: string;
  node: Node;
  value: null | number;
  complete: boolean;
}

/** 分组按指标降序，未知值排最后；「未配置」不是真正的分组，固定排在最末。不完整的组用已导入小计并标记。 */
export function groupRanking(groups: Node[], key: MetricKey): GroupRank[] {
  return groups
    .map((group) => ({
      key: group.key,
      name: group.name,
      node: group,
      value: toNumber(displaySummary(group)?.[key]),
      complete: fullyImported(group),
    }))
    .sort((a, b) => {
      const pinned =
        Number(a.key === UNCONFIGURED_KEY) - Number(b.key === UNCONFIGURED_KEY);
      if (pinned !== 0) return pinned;
      return a.value === null ? 1 : b.value === null ? -1 : b.value - a.value;
    });
}
