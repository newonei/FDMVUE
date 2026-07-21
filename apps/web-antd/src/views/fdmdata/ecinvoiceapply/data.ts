import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataEcInvoiceApplyApi } from '#/api/fdmdata/ecinvoiceapply';

import { formatDateTime } from '@vben/utils';

import { getDataCompanySimpleList } from '#/api/fdmdata/datacompany';
import { getEcShopDailyShopOptions } from '#/api/fdmdata/ecshopdaily';
import { getRangePickerDefaultProps } from '#/utils';

export const EC_INVOICE_APPLY_DEFAULTS: Partial<FdmdataEcInvoiceApplyApi.EcInvoiceApply> =
  {
    invoiceType: '普通发票',
    // 新申请默认未开票，开票状态由实际开票流程更新，用户无需手工填写。
    invoiceStatus: 0,
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

const invoiceStatusOptions = [
  { label: '未开票', value: 0 },
  { label: '已开票', value: 1 },
];

function formatInvoiceStatus({ cellValue }: { cellValue: unknown }) {
  if (cellValue === null || cellValue === undefined || cellValue === '') {
    return '未开票';
  }
  const status = Number(cellValue);
  return (
    invoiceStatusOptions.find((item) => item.value === status)?.label ??
    String(cellValue)
  );
}

function formatOptionalDateTime({ cellValue }: { cellValue: unknown }) {
  if (cellValue === null || cellValue === undefined || cellValue === '') {
    return '';
  }
  if (typeof cellValue === 'number') {
    return cellValue <= 0 ? '' : formatDateTime(cellValue);
  }
  if (typeof cellValue === 'string') {
    const value = cellValue.trim();
    if (!value || value === '0' || /^1970-01-01(?:[ T]|$)/.test(value)) {
      return '';
    }
    return formatDateTime(value);
  }
  return '';
}

const companySelectProps = {
  api: getDataCompanySimpleList,
  labelField: 'companyName',
  valueField: 'id',
  allowClear: true,
  showSearch: true,
  optionFilterProp: 'label',
};

async function getShopNameOptions() {
  const shops = await getEcShopDailyShopOptions({ limit: 200 });
  const options = new Map<string, string>();

  shops.forEach((shop) => {
    const shopName = shop.shopName?.trim();
    if (!shopName) return;
    options.set(shopName.toLocaleLowerCase(), shopName);
  });

  return [...options.values()]
    .toSorted((left, right) => left.localeCompare(right, 'zh-CN'))
    .map((value) => ({ label: value, value }));
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
      component: 'ApiSelect',
      formItemClass: 'col-span-2',
      componentProps: {
        api: getShopNameOptions,
        labelField: 'label',
        valueField: 'value',
        class: 'w-full',
        allowClear: true,
        showSearch: true,
        optionFilterProp: 'label',
        placeholder: '请选择店铺',
      },
      rules: 'required',
    },
    {
      fieldName: 'companyId',
      label: '公司主体',
      component: 'ApiSelect',
      formItemClass: 'col-span-2',
      componentProps: {
        ...companySelectProps,
        class: 'w-full',
        placeholder: '请选择公司主体',
      },
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
      componentProps: {
        class: 'w-full',
        disabled: true,
        min: 0.01,
        placeholder: '根据总金额和数量自动计算',
        precision: 2,
      },
      rules: 'required',
    },
    {
      fieldName: 'invoiceType',
      label: '发票类型',
      component: 'Select',
      componentProps: {
        class: 'w-full',
        options: [
          { label: '普票', value: '普通发票' },
          { label: '专票', value: '增值税专用发票' },
        ],
      },
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
      componentProps: {
        allowClear: true,
        maxlength: 64,
        placeholder: '个人抬头可不填',
      },
    },
    // 状态和开票日期由开票流程维护，保留为隐藏字段以便编辑时原值不丢失。
    {
      fieldName: 'invoiceStatus',
      component: 'InputNumber',
      formItemClass: 'hidden',
    },
    {
      fieldName: 'invoiceDate',
      component: 'Input',
      formItemClass: 'hidden',
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
      component: 'ApiSelect',
      componentProps: {
        api: getShopNameOptions,
        labelField: 'label',
        valueField: 'value',
        allowClear: true,
        showSearch: true,
        optionFilterProp: 'label',
        placeholder: '请选择店铺',
      },
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
      component: 'Select',
      componentProps: {
        class: 'w-full',
        allowClear: true,
        options: invoiceStatusOptions,
      },
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
    {
      field: 'invoiceStatus',
      title: '开票状态',
      minWidth: 90,
      formatter: formatInvoiceStatus,
    },
    {
      field: 'invoiceFileUrl',
      title: '附件',
      width: 90,
      slots: { default: 'attachment' },
    },
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
      formatter: formatOptionalDateTime,
    },
    {
      field: 'orderFinishTime',
      title: '订单完成时间',
      minWidth: 160,
      formatter: formatOptionalDateTime,
    },
    {
      field: 'invoiceDueTime',
      title: '开票截止时间',
      minWidth: 160,
      formatter: formatOptionalDateTime,
    },
    {
      field: 'createTime',
      title: '创建时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      title: '操作',
      width: 230,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ];
}
