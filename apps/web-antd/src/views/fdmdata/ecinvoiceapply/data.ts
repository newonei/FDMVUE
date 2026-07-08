import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataEcInvoiceApplyApi } from '#/api/fdmdata/ecinvoiceapply';

import { getRangePickerDefaultProps } from '#/utils';

export const EC_INVOICE_APPLY_DEFAULTS: Partial<FdmdataEcInvoiceApplyApi.EcInvoiceApply> =
  {
    platformCode: 'TM',
    platformName: '天猫',
    invoiceType: 'blue',
    delayApplyFlag: 0,
    punishFlag: 0,
    refundFlag: 0,
    rightsFlag: 0,
    printInvoiceFlag: false,
    invalidInvoiceFlag: false,
    xmlFileUpload: false,
    xmlFileSendMessage: false,
  };

export const INVOICE_TYPE_OPTIONS = [
  { label: '蓝票', value: 'blue' },
  { label: '红票', value: 'red' },
  { label: '电子普票', value: '电子普票' },
  { label: '电子专票', value: '电子专票' },
  { label: '普通发票', value: '普通发票' },
  { label: '增值税专用发票', value: '增值税专用发票' },
];

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
      fieldName: 'tid',
      label: '交易订单号',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 64 },
    },
    {
      fieldName: 'platformCode',
      label: '平台编码',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 32 },
    },
    {
      fieldName: 'platformName',
      label: '平台名称',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 64 },
    },
    {
      fieldName: 'shopName',
      label: '店铺名称',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 128 },
    },
    {
      fieldName: 'shopCompanyName',
      label: '店铺主体公司',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 128 },
    },
    {
      fieldName: 'title',
      label: '发票抬头',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 255 },
    },
    {
      fieldName: 'amount',
      label: '开票金额',
      component: 'InputNumber',
      componentProps: { class: 'w-full', min: 0, precision: 2 },
    },
    {
      fieldName: 'serialNo',
      label: '流水号',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 64 },
    },
    {
      fieldName: 'applySource',
      label: '申请来源',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 64 },
    },
    {
      fieldName: 'startTime',
      label: '开始日期',
      component: 'DatePicker',
      componentProps: {
        class: 'w-full',
        allowClear: true,
        format: 'YYYY-MM-DD',
        valueFormat: 'YYYY-MM-DD',
      },
    },
    {
      fieldName: 'applyGmtCreate',
      label: '申请创建时间',
      component: 'DatePicker',
      componentProps: {
        class: 'w-full',
        allowClear: true,
        format: 'YYYY-MM-DD HH:mm:ss',
        showTime: true,
        valueFormat: 'YYYY-MM-DD HH:mm:ss',
      },
    },
    {
      fieldName: 'orderFinishTime',
      label: '订单完成时间',
      component: 'DatePicker',
      componentProps: {
        class: 'w-full',
        allowClear: true,
        format: 'YYYY-MM-DD HH:mm:ss',
        showTime: true,
        valueFormat: 'YYYY-MM-DD HH:mm:ss',
      },
    },
    {
      fieldName: 'invoiceDueTime',
      label: '开票截止时间',
      component: 'DatePicker',
      componentProps: {
        class: 'w-full',
        allowClear: true,
        format: 'YYYY-MM-DD HH:mm:ss',
        showTime: true,
        valueFormat: 'YYYY-MM-DD HH:mm:ss',
      },
    },
    {
      fieldName: 'invoiceCode',
      label: '发票代码',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 64 },
    },
    {
      fieldName: 'invoiceNo',
      label: '发票号码',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 64 },
    },
    {
      fieldName: 'invoiceId',
      label: '发票ID',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 64 },
    },
    {
      fieldName: 'invoiceKind',
      label: '发票种类',
      component: 'InputNumber',
      componentProps: { class: 'w-full', precision: 0 },
    },
    {
      fieldName: 'invoiceType',
      label: '发票类型',
      component: 'Select',
      componentProps: { allowClear: true, options: INVOICE_TYPE_OPTIONS },
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
    },
    {
      fieldName: 'payerName',
      label: '付款方名称',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 255 },
    },
    {
      fieldName: 'payerRegisterNo',
      label: '付款方税号',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 64 },
    },
    {
      fieldName: 'payerPhone',
      label: '付款方电话',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 32 },
    },
    {
      fieldName: 'payerEmail',
      label: '付款方邮箱',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 128 },
    },
    {
      fieldName: 'payerBank',
      label: '付款方开户行',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 255 },
    },
    {
      fieldName: 'payerBankAccount',
      label: '付款方账号',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 128 },
    },
    {
      fieldName: 'payerAddress',
      label: '付款方地址',
      component: 'Textarea',
      formItemClass: 'col-span-2',
      componentProps: { rows: 2, maxlength: 512, showCount: true },
    },
    {
      fieldName: 'orderPayStatus',
      label: '支付状态',
      component: 'InputNumber',
      componentProps: { class: 'w-full', precision: 0 },
    },
    {
      fieldName: 'status',
      label: '业务状态',
      component: 'InputNumber',
      componentProps: { class: 'w-full', precision: 0 },
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
      componentProps: { allowClear: true, maxlength: 64 },
    },
    {
      fieldName: 'countdownText',
      label: '开票倒计时',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 128 },
    },
    {
      fieldName: 'rightsDueDate',
      label: '维权到期时间',
      component: 'DatePicker',
      componentProps: {
        class: 'w-full',
        allowClear: true,
        format: 'YYYY-MM-DD HH:mm:ss',
        showTime: true,
        valueFormat: 'YYYY-MM-DD HH:mm:ss',
      },
    },
    {
      fieldName: 'tradeLink',
      label: '交易链接',
      component: 'Input',
      formItemClass: 'col-span-2',
      componentProps: { allowClear: true, maxlength: 512 },
    },
    {
      fieldName: 'failedReason',
      label: '失败原因',
      component: 'Textarea',
      formItemClass: 'col-span-2',
      componentProps: { rows: 2, maxlength: 512, showCount: true },
    },
    {
      fieldName: 'rawJson',
      label: '原始JSON',
      component: 'Textarea',
      formItemClass: 'col-span-2',
      componentProps: { rows: 4 },
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
