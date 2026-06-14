import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataExpressReconDetailApi } from '#/api/fdmdata/expressrecondetail';

import { getRangePickerDefaultProps } from '#/utils';

import { EXPRESS_RECON_STATUS_OPTIONS } from '../expressreconbatch/data';

export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'batchId',
      label: '批次ID',
      component: 'InputNumber',
      componentProps: { class: 'w-full', min: 1, precision: 0 },
    },
    {
      fieldName: 'waybillNo',
      label: '运单号',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'shopName',
      label: '店铺',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'status',
      label: '状态',
      component: 'Select',
      componentProps: { allowClear: true, options: EXPRESS_RECON_STATUS_OPTIONS },
    },
    {
      fieldName: 'diffAmountMin',
      label: '差额下限',
      component: 'InputNumber',
      componentProps: { class: 'w-full', precision: 2 },
    },
    {
      fieldName: 'diffAmountMax',
      label: '差额上限',
      component: 'InputNumber',
      componentProps: { class: 'w-full', precision: 2 },
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

function formatWeight({ cellValue }: { cellValue: unknown }) {
  if (cellValue === null || cellValue === undefined || cellValue === '')
    return '';
  const n = Number(cellValue);
  return Number.isFinite(n) ? n.toFixed(3) : String(cellValue);
}

export function useGridColumns(): VxeTableGridOptions<FdmdataExpressReconDetailApi.ExpressReconDetail>['columns'] {
  return [
    {
      field: 'waybillNo',
      title: '运单号',
      minWidth: 150,
      fixed: 'left',
      showOverflow: 'tooltip',
    },
    {
      field: 'status',
      title: '状态',
      minWidth: 110,
      fixed: 'left',
    },
    {
      field: 'statusMessage',
      title: '说明',
      minWidth: 180,
      showOverflow: 'tooltip',
    },
    {
      field: 'shopName',
      title: '店铺',
      minWidth: 160,
      showOverflow: 'tooltip',
    },
    { field: 'provinceNorm', title: '订单省份', minWidth: 100 },
    { field: 'billProvince', title: '账单省份', minWidth: 100 },
    {
      field: 'estimatedWeight',
      title: '订单重量',
      minWidth: 100,
      align: 'right',
      formatter: formatWeight,
    },
    {
      field: 'billWeight',
      title: '账单重量',
      minWidth: 100,
      align: 'right',
      formatter: formatWeight,
    },
    {
      field: 'estimatedAmount',
      title: '预估费用',
      minWidth: 104,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'actualAmount',
      title: '实际费用',
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
      field: 'internalOrderNos',
      title: '内部订单号',
      minWidth: 160,
      showOverflow: 'tooltip',
    },
    {
      field: 'onlineOrderNos',
      title: '线上订单号',
      minWidth: 180,
      showOverflow: 'tooltip',
    },
    {
      field: 'orderLineCount',
      title: '订单行数',
      minWidth: 90,
      align: 'right',
    },
    {
      field: 'billLineCount',
      title: '账单行数',
      minWidth: 90,
      align: 'right',
    },
    {
      field: 'createTime',
      title: '创建时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
  ];
}
