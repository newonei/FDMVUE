import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataEcInvoiceApplyApi } from '#/api/fdmdata/ecinvoiceapply';

import { getRangePickerDefaultProps } from '#/utils';

export const EC_INVOICE_APPLY_DEFAULTS: Partial<FdmdataEcInvoiceApplyApi.EcInvoiceApply> =
  {
    invoiceType: 'blue',
    applySource: '手工录入',
    delayApplyFlag: 0,
    punishFlag: 0,
    refundFlag: 0,
    rightsFlag: 0,
    printInvoiceFlag: false,
    invalidInvoiceFlag: false,
    xmlFileUpload: false,
    xmlFileSendMessage: false,
  };

function formatAmount({ cellValue }: { cellValue: unknown }) {
  if (cellValue === null || cellValue === undefined || cellValue === '')
    return '';
  const n = Number(cellValue);
  return Number.isFinite(n) ? n.toFixed(2) : String(cellValue);
}

function formatBoolean({ cellValue }: { cellValue: unknown }) {
  return cellValue ? '是' : '否';
}

export function useFormSchema(): VbenFormSchema[] {
  return [
    { fieldName: 'id', component: 'Input', formItemClass: 'hidden' },
    {
      fieldName: 'platformCode',
      component: 'Input',
      formItemClass: 'hidden',
    },
    {
      fieldName: 'platformName',
      component: 'Input',
      formItemClass: 'hidden',
    },
    {
      fieldName: 'invoiceType',
      component: 'Input',
      formItemClass: 'hidden',
    },
    {
      fieldName: 'applySource',
      component: 'Input',
      formItemClass: 'hidden',
    },
    {
      fieldName: 'startTime',
      label: '日期',
      component: 'DatePicker',
      componentProps: {
        class: 'w-full',
        allowClear: true,
        format: 'YYYY-MM-DD',
        valueFormat: 'YYYY-MM-DD',
      },
      rules: 'required',
    },
    {
      fieldName: 'shopName',
      label: '店铺',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 128 },
      rules: 'required',
    },
    {
      fieldName: 'tid',
      label: '订单号',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 64 },
      rules: 'required',
    },
    {
      fieldName: 'amount',
      label: '总金额',
      component: 'InputNumber',
      componentProps: { class: 'w-full', min: 0.01, precision: 2 },
      rules: 'required',
    },
    {
      fieldName: 'quantity',
      label: '数量',
      component: 'InputNumber',
      componentProps: { class: 'w-full', min: 1, precision: 0 },
      rules: 'required',
    },
    {
      fieldName: 'unitPrice',
      label: '单价',
      component: 'InputNumber',
      componentProps: { class: 'w-full', min: 0.01, precision: 2 },
      rules: 'required',
    },
    {
      fieldName: 'title',
      label: '发票抬头',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 255 },
      rules: 'required',
    },
    {
      fieldName: 'payerRegisterNo',
      label: '税号',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 64 },
      rules: 'required',
    },
    {
      fieldName: 'invoiceStatus',
      label: '开票状态',
      component: 'InputNumber',
      componentProps: { class: 'w-full', min: 0, precision: 0 },
      rules: 'required',
    },
    {
      fieldName: 'invoiceDate',
      label: '开票日期',
      component: 'DatePicker',
      componentProps: {
        class: 'w-full',
        allowClear: true,
        format: 'YYYY-MM-DD HH:mm:ss',
        showTime: true,
        valueFormat: 'YYYY-MM-DD HH:mm:ss',
      },
      rules: 'required',
    },
  ];
}

export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'tid',
      label: '订单号',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'platformCode',
      label: '平台编码',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'shopName',
      label: '店铺名称',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'shopCompanyName',
      label: '店铺主体公司',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'title',
      label: '发票抬头',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'payerName',
      label: '付款方',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'applyStatus',
      label: '申请状态',
      component: 'InputNumber',
      componentProps: { class: 'w-full', precision: 0 },
    },
    {
      fieldName: 'invoiceStatus',
      label: '开票状态',
      component: 'InputNumber',
      componentProps: { class: 'w-full', precision: 0 },
    },
    {
      fieldName: 'platformStatusText',
      label: '平台状态',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'startTime',
      label: '开始日期',
      component: 'RangePicker',
      componentProps: { ...getRangePickerDefaultProps(), allowClear: true },
    },
    {
      fieldName: 'applyGmtCreate',
      label: '申请时间',
      component: 'RangePicker',
      componentProps: { ...getRangePickerDefaultProps(), allowClear: true },
    },
    {
      fieldName: 'orderFinishTime',
      label: '完成时间',
      component: 'RangePicker',
      componentProps: { ...getRangePickerDefaultProps(), allowClear: true },
    },
    {
      fieldName: 'invoiceDueTime',
      label: '开票截止',
      component: 'RangePicker',
      componentProps: { ...getRangePickerDefaultProps(), allowClear: true },
    },
  ];
}

export function useGridColumns(): VxeTableGridOptions<FdmdataEcInvoiceApplyApi.EcInvoiceApply>['columns'] {
  return [
    { type: 'checkbox', width: 40, fixed: 'left' },
    {
      field: 'tid',
      title: '交易订单号',
      minWidth: 170,
      fixed: 'left',
      showOverflow: 'tooltip',
    },
    { field: 'platformCode', title: '平台', minWidth: 90 },
    {
      field: 'shopName',
      title: '店铺',
      minWidth: 150,
      showOverflow: 'tooltip',
    },
    {
      field: 'shopCompanyName',
      title: '店铺主体公司',
      minWidth: 180,
      showOverflow: 'tooltip',
    },
    {
      field: 'title',
      title: '发票抬头',
      minWidth: 180,
      showOverflow: 'tooltip',
    },
    {
      field: 'amount',
      title: '开票金额',
      minWidth: 100,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'payerName',
      title: '付款方',
      minWidth: 180,
      showOverflow: 'tooltip',
    },
    {
      field: 'payerRegisterNo',
      title: '付款方税号',
      minWidth: 160,
      showOverflow: 'tooltip',
    },
    { field: 'applySource', title: '申请来源', minWidth: 100 },
    { field: 'invoiceType', title: '发票类型', minWidth: 96 },
    { field: 'invoiceNo', title: '发票号码', minWidth: 130 },
    { field: 'orderPayStatus', title: '支付状态', minWidth: 90 },
    { field: 'applyStatus', title: '申请状态', minWidth: 90 },
    { field: 'invoiceStatus', title: '开票状态', minWidth: 90 },
    {
      field: 'platformStatusText',
      title: '平台状态',
      minWidth: 110,
      showOverflow: 'tooltip',
    },
    {
      field: 'countdownText',
      title: '开票倒计时',
      minWidth: 140,
      showOverflow: 'tooltip',
    },
    {
      field: 'printInvoiceFlag',
      title: '可打印',
      minWidth: 80,
      formatter: formatBoolean,
    },
    {
      field: 'startTime',
      title: '开始日期',
      minWidth: 110,
      formatter: ({ cellValue }: { cellValue: unknown }) =>
        cellValue ? String(cellValue).slice(0, 10) : '',
    },
    {
      field: 'applyGmtCreate',
      title: '申请时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      field: 'orderFinishTime',
      title: '订单完成时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      field: 'invoiceDueTime',
      title: '开票截止时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      field: 'createTime',
      title: '创建时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      title: '操作',
      width: 140,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ];
}
