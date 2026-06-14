import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataExpressReconBatchApi } from '#/api/fdmdata/expressreconbatch';

import { getRangePickerDefaultProps } from '#/utils';

export const EXPRESS_RECON_STATUS_OPTIONS = [
  { label: '匹配一致', value: 'MATCHED' },
  { label: '存在差额', value: 'DIFF' },
  { label: '仅订单有', value: 'ONLY_ORDER' },
  { label: '仅账单有', value: 'ONLY_BILL' },
  { label: '规则缺失', value: 'RULE_MISSING' },
  { label: '省份不一致', value: 'PROVINCE_MISMATCH' },
];

export const BATCH_STATUS_OPTIONS = [
  { label: '导入中', value: 'IMPORTING' },
  { label: '已对账', value: 'RECONCILED' },
  { label: '导入失败', value: 'FAILED' },
];

export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'batchNo',
      label: '批次编号',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'batchName',
      label: '批次名称',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'billMonth',
      label: '账单月份',
      component: 'Input',
      componentProps: { allowClear: true, placeholder: '如 2026-05' },
    },
    {
      fieldName: 'status',
      label: '状态',
      component: 'Select',
      componentProps: { allowClear: true, options: BATCH_STATUS_OPTIONS },
    },
    {
      fieldName: 'createTime',
      label: '创建时间',
      component: 'RangePicker',
      componentProps: { ...getRangePickerDefaultProps(), allowClear: true },
    },
  ];
}

function formatAmount({ cellValue }: { cellValue: unknown }) {
  if (cellValue === null || cellValue === undefined || cellValue === '')
    return '';
  const n = Number(cellValue);
  return Number.isFinite(n) ? n.toFixed(2) : String(cellValue);
}

const batchStatusLabelMap = new Map(
  BATCH_STATUS_OPTIONS.map((item) => [item.value, item.label]),
);

function formatBatchStatus({ cellValue }: { cellValue: unknown }) {
  if (cellValue === null || cellValue === undefined || cellValue === '') {
    return '';
  }
  return batchStatusLabelMap.get(String(cellValue)) ?? String(cellValue);
}

export function useGridColumns(): VxeTableGridOptions<FdmdataExpressReconBatchApi.ExpressReconBatch>['columns'] {
  return [
    { type: 'checkbox', width: 40, fixed: 'left' },
    {
      field: 'batchNo',
      title: '批次编号',
      minWidth: 170,
      fixed: 'left',
      showOverflow: 'tooltip',
    },
    {
      field: 'batchName',
      title: '批次名称',
      minWidth: 180,
      showOverflow: 'tooltip',
    },
    { field: 'carrierName', title: '快递公司', minWidth: 110 },
    { field: 'billMonth', title: '账单月份', minWidth: 100 },
    { field: 'status', title: '状态', minWidth: 96, formatter: formatBatchStatus },
    {
      field: 'totalWaybillCount',
      title: '总运单',
      minWidth: 88,
      align: 'right',
    },
    {
      field: 'matchedCount',
      title: '已匹配',
      minWidth: 88,
      align: 'right',
    },
    {
      field: 'diffCount',
      title: '差额数',
      minWidth: 88,
      align: 'right',
    },
    {
      field: 'ruleMissingCount',
      title: '规则缺失',
      minWidth: 96,
      align: 'right',
    },
    {
      field: 'estimatedAmount',
      title: '预估金额',
      minWidth: 104,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'actualAmount',
      title: '账单金额',
      minWidth: 104,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'diffAmount',
      title: '差额',
      minWidth: 104,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'orderFileName',
      title: '订单文件',
      minWidth: 180,
      showOverflow: 'tooltip',
    },
    {
      field: 'billFileName',
      title: '账单文件',
      minWidth: 180,
      showOverflow: 'tooltip',
    },
    {
      field: 'createTime',
      title: '创建时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    { title: '操作', width: 220, fixed: 'right', slots: { default: 'actions' } },
  ];
}
