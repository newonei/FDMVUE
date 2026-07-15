import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataDataCompanyApi } from '#/api/fdmdata/datacompany';

import { getRangePickerDefaultProps } from '#/utils';

export const ENABLED_OPTIONS = [
  { label: '启用', value: 1 },
  { label: '停用', value: 0 },
];

export const TAXPAYER_TYPE_OPTIONS = [
  { label: '一般纳税人', value: 'GENERAL' },
  { label: '小规模纳税人', value: 'SMALL_SCALE' },
  { label: '其他', value: 'OTHER' },
];

export const DATA_COMPANY_DEFAULTS: Partial<FdmdataDataCompanyApi.DataCompany> =
  {
    enabled: 1,
  };

export function formatTaxRate(value: unknown) {
  if (value === undefined || value === null || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `${(num * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

export function formatEnabled(value: unknown) {
  return Number(value) === 1 ? '启用' : '停用';
}

export function formatTaxpayerType(value: unknown) {
  const option = TAXPAYER_TYPE_OPTIONS.find((item) => item.value === value);
  return option?.label ?? (value ? String(value) : '');
}

export function useFormSchema(): VbenFormSchema[] {
  return [
    { fieldName: 'id', component: 'Input', formItemClass: 'hidden' },
    {
      fieldName: 'companyCode',
      label: '公司编码',
      component: 'Input',
      componentProps: { allowClear: true, placeholder: '例如 WHFDM' },
    },
    {
      fieldName: 'companyName',
      label: '公司名称',
      rules: 'required',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'companyShortName',
      label: '公司简称',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'taxNo',
      label: '公司税号',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'taxpayerType',
      label: '纳税人类型',
      component: 'Select',
      componentProps: { allowClear: true, options: TAXPAYER_TYPE_OPTIONS },
    },
    {
      fieldName: 'defaultTaxRate',
      label: '默认税率',
      component: 'InputNumber',
      componentProps: {
        min: 0,
        max: 1,
        precision: 4,
        step: 0.01,
        placeholder: '例如 0.13',
        class: 'w-full',
      },
    },
    {
      fieldName: 'invoicePhone',
      label: '开票电话',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'invoiceAddress',
      label: '开票地址',
      component: 'Textarea',
      componentProps: { rows: 2, maxlength: 512, showCount: true },
    },
    {
      fieldName: 'bankName',
      label: '开户行',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'bankAccount',
      label: '银行账号',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'enabled',
      label: '状态',
      component: 'Select',
      componentProps: { options: ENABLED_OPTIONS },
    },
    {
      fieldName: 'remark',
      label: '备注',
      component: 'Textarea',
      componentProps: { rows: 2, maxlength: 512, showCount: true },
    },
  ];
}

export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'companyName',
      label: '公司名称',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'taxNo',
      label: '公司税号',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'taxpayerType',
      label: '纳税人类型',
      component: 'Select',
      componentProps: { allowClear: true, options: TAXPAYER_TYPE_OPTIONS },
    },
    {
      fieldName: 'enabled',
      label: '状态',
      component: 'Select',
      componentProps: { allowClear: true, options: ENABLED_OPTIONS },
    },
    {
      fieldName: 'createTime',
      label: '创建时间',
      component: 'RangePicker',
      componentProps: { ...getRangePickerDefaultProps(), allowClear: true },
    },
  ];
}

export function useGridColumns(): VxeTableGridOptions<FdmdataDataCompanyApi.DataCompany>['columns'] {
  return [
    { type: 'checkbox', width: 40, fixed: 'left' },
    {
      field: 'companyName',
      title: '公司名称',
      minWidth: 220,
      fixed: 'left',
      showOverflow: 'tooltip',
    },
    {
      field: 'taxNo',
      title: '公司税号',
      minWidth: 190,
      showOverflow: 'tooltip',
    },
    {
      field: 'defaultTaxRate',
      title: '默认税率',
      minWidth: 100,
      formatter: ({ cellValue }: { cellValue: unknown }) =>
        formatTaxRate(cellValue),
    },
    {
      field: 'taxpayerType',
      title: '纳税人类型',
      minWidth: 120,
      formatter: ({ cellValue }: { cellValue: unknown }) =>
        formatTaxpayerType(cellValue),
    },
    {
      field: 'companyShortName',
      title: '简称',
      minWidth: 120,
      showOverflow: 'tooltip',
    },
    {
      field: 'invoicePhone',
      title: '开票电话',
      minWidth: 130,
      showOverflow: 'tooltip',
    },
    {
      field: 'bankName',
      title: '开户行',
      minWidth: 180,
      showOverflow: 'tooltip',
    },
    {
      field: 'enabled',
      title: '状态',
      minWidth: 80,
      formatter: ({ cellValue }: { cellValue: unknown }) =>
        formatEnabled(cellValue),
    },
    {
      field: 'remark',
      title: '备注',
      minWidth: 180,
      showOverflow: 'tooltip',
    },
    {
      field: 'createTime',
      title: '创建时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    { title: '操作', width: 150, fixed: 'right', slots: { default: 'actions' } },
  ];
}
