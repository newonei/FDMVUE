import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataExpressReconPeriodApi } from '#/api/fdmdata/expressreconperiod';

import { getRangePickerDefaultProps } from '#/utils';

export const PERIOD_STATUS_OPTIONS = [
  { label: '导入中', value: 'IMPORTING' },
  { label: '就绪', value: 'READY' },
  { label: '导入失败', value: 'FAILED' },
];

const periodStatusLabelMap = new Map(
  PERIOD_STATUS_OPTIONS.map((item) => [item.value, item.label]),
);

export function formatPeriodStatus({ cellValue }: { cellValue: unknown }) {
  if (cellValue === null || cellValue === undefined || cellValue === '') {
    return '';
  }
  return periodStatusLabelMap.get(String(cellValue)) ?? String(cellValue);
}

export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'periodName',
      label: '订单池名称',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'orderMonth',
      label: '发货月份',
      component: 'Input',
      componentProps: { allowClear: true, placeholder: '如 2026-05' },
    },
    {
      fieldName: 'status',
      label: '状态',
      component: 'Select',
      componentProps: { allowClear: true, options: PERIOD_STATUS_OPTIONS },
    },
    {
      fieldName: 'createTime',
      label: '创建时间',
      component: 'RangePicker',
      componentProps: { ...getRangePickerDefaultProps(), allowClear: true },
    },
  ];
}

export function useGridColumns(): VxeTableGridOptions<FdmdataExpressReconPeriodApi.ExpressReconPeriod>['columns'] {
  return [
    {
      field: 'periodName',
      title: '订单池名称',
      minWidth: 200,
      fixed: 'left',
      showOverflow: 'tooltip',
    },
    { field: 'orderMonth', title: '发货月份', minWidth: 100 },
    {
      field: 'status',
      title: '状态',
      minWidth: 96,
      formatter: formatPeriodStatus,
    },
    { field: 'orderCount', title: '订单运单数', minWidth: 100, align: 'right' },
    {
      field: 'carrierCount',
      title: '已对账快递',
      minWidth: 100,
      align: 'right',
    },
    {
      field: 'reconciledWaybillCount',
      title: '已对账运单',
      minWidth: 100,
      align: 'right',
    },
    {
      field: 'unreconciledWaybillCount',
      title: '未对账运单',
      minWidth: 100,
      align: 'right',
      slots: { default: 'colUnreconciled' },
    },
    {
      field: 'orderFileName',
      title: '订单文件',
      minWidth: 180,
      showOverflow: 'tooltip',
    },
    {
      field: 'createTime',
      title: '创建时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    { title: '操作', width: 300, fixed: 'right', slots: { default: 'actions' } },
  ];
}
