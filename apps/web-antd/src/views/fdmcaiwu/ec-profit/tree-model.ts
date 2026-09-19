import type { FdmcaiwuEcProfitApi } from '#/api/fdmcaiwu/ec-profit';

import { formatMetric, METRIC_GROUPS } from './model';

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
    title: metric.label,
    key: metric.key,
    align: 'right' as const,
    width: metric.key === 'purchaseCost' ? 170 : metric.rate ? 115 : 140,
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
export function nodeState(node: Node) {
  if (node.unassignedCount > 0) return '归属待确认';
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
export function expansionKeys(
  nodes: Node[],
  level: 'department' | 'shop',
): string[] {
  return nodes.flatMap((node) => [
    ...(node.children.length > 0 ? [node.key] : []),
    ...(level === 'shop' ? expansionKeys(node.children, level) : []),
  ]);
}
/** Filter whole groups; callers label unchanged department totals as department-wide. */
export function filterTree(
  nodes: Node[],
  departmentKey?: string,
  groupKey?: string,
): Node[] {
  return nodes
    .filter((node) => !departmentKey || node.key === departmentKey)
    .map((node) =>
      groupKey
        ? {
            ...node,
            children: node.children.filter((group) => group.key === groupKey),
          }
        : node,
    )
    .filter((node) => !groupKey || node.children.length > 0);
}
export function findGroup(nodes: Node[], key: string) {
  for (const department of nodes) {
    const group = department.children.find((node) => node.key === key);
    if (group) return { department, group };
  }
  return undefined;
}
export function yearCell(row: FdmcaiwuEcProfitApi.YearGroup, month: string) {
  return row.months.find((cell) => cell.month === month);
}
export function selectedTotal(
  view: FdmcaiwuEcProfitApi.MonthlyView,
  departmentKey?: string,
  groupKey?: string,
) {
  if (groupKey) return findGroup(view.departments, groupKey)?.group;
  if (departmentKey)
    return view.departments.find(
      (department) => department.key === departmentKey,
    );
  return view.total;
}
