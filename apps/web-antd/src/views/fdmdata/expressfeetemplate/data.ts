import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataExpressFeeTemplateApi } from '#/api/fdmdata/expressfeetemplate';

import { getRangePickerDefaultProps } from '#/utils';

export const BILLING_TYPE_OPTIONS = [
  { label: '混合规则', value: 'MIXED' },
  { label: '阶梯固定价', value: 'STEP' },
  { label: '首重续重', value: 'FIRST_CONTINUED' },
];

export const ENABLED_OPTIONS = [
  { label: '启用', value: 1 },
  { label: '停用', value: 0 },
];

export const EXPRESS_FEE_TEMPLATE_DEFAULTS: Partial<FdmdataExpressFeeTemplateApi.ExpressFeeTemplate> =
  {
    carrierCode: 'ZTO',
    carrierName: '中通快递',
    billingType: 'MIXED',
    weightField: 'goodsWeight',
    enabled: 1,
  };

export function useFormSchema(): VbenFormSchema[] {
  return [
    { fieldName: 'id', component: 'Input', formItemClass: 'hidden' },
    {
      fieldName: 'templateCode',
      label: '模板编码',
      rules: 'required',
      component: 'Input',
      componentProps: { allowClear: true, placeholder: '如 zto_202605' },
    },
    {
      fieldName: 'templateName',
      label: '模板名称',
      rules: 'required',
      component: 'Input',
      componentProps: { allowClear: true, placeholder: '如 中通2026年5月报价' },
    },
    {
      fieldName: 'carrierCode',
      label: '快递编码',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'carrierName',
      label: '快递公司',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'billingType',
      label: '计费类型',
      component: 'Select',
      componentProps: { options: BILLING_TYPE_OPTIONS },
    },
    {
      fieldName: 'weightField',
      label: '重量来源',
      component: 'Select',
      componentProps: {
        options: [
          { label: '订单商品重量', value: 'goodsWeight' },
          { label: '订单重量', value: 'orderWeight' },
          { label: '商品资料重量', value: 'materialWeight' },
        ],
      },
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
      fieldName: 'templateCode',
      label: '模板编码',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'templateName',
      label: '模板名称',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'carrierCode',
      label: '快递编码',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'billingType',
      label: '计费类型',
      component: 'Select',
      componentProps: { allowClear: true, options: BILLING_TYPE_OPTIONS },
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

export function useGridColumns(): VxeTableGridOptions<FdmdataExpressFeeTemplateApi.ExpressFeeTemplate>['columns'] {
  return [
    { type: 'checkbox', width: 40, fixed: 'left' },
    {
      field: 'templateCode',
      title: '模板编码',
      minWidth: 150,
      fixed: 'left',
      showOverflow: 'tooltip',
    },
    {
      field: 'templateName',
      title: '模板名称',
      minWidth: 180,
      showOverflow: 'tooltip',
    },
    { field: 'carrierCode', title: '快递编码', minWidth: 100 },
    { field: 'carrierName', title: '快递公司', minWidth: 110 },
    { field: 'billingType', title: '计费类型', minWidth: 120 },
    { field: 'weightField', title: '重量来源', minWidth: 120 },
    {
      field: 'enabled',
      title: '状态',
      minWidth: 80,
      formatter: ({ cellValue }: { cellValue: unknown }) =>
        Number(cellValue) === 1 ? '启用' : '停用',
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
    { title: '操作', width: 220, fixed: 'right', slots: { default: 'actions' } },
  ];
}
