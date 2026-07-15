import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataShopCompanyApi } from '#/api/fdmdata/shopcompany';

import { getDataCompanySimpleList } from '#/api/fdmdata/datacompany';
import { getRangePickerDefaultProps } from '#/utils';

export const PLATFORM_OPTIONS = [
  { label: '淘宝/天猫', value: 'TAOBAO' },
  { label: '拼多多', value: 'PDD' },
  { label: '京东', value: 'JD' },
  { label: '小红书', value: 'XHS' },
  { label: '抖音', value: 'DY' },
  { label: '视频号', value: 'SPH' },
  { label: '其他', value: 'OTHER' },
];

export const ENABLED_OPTIONS = [
  { label: '启用', value: 1 },
  { label: '停用', value: 0 },
];

export const SHOP_COMPANY_DEFAULTS: Partial<FdmdataShopCompanyApi.ShopCompany> =
  {
    enabled: 1,
  };

export function getPlatformName(platformCode?: string) {
  return (
    PLATFORM_OPTIONS.find((item) => item.value === platformCode)?.label ??
    platformCode ??
    ''
  );
}

export function formatTaxRate(value: unknown) {
  if (value === undefined || value === null || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `${(num * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

export function formatEnabled(value: unknown) {
  return Number(value) === 1 ? '启用' : '停用';
}

const companySelectProps = {
  api: getDataCompanySimpleList,
  labelField: 'companyName',
  valueField: 'id',
  allowClear: true,
  showSearch: true,
  optionFilterProp: 'label',
};

export function useFormSchema(): VbenFormSchema[] {
  return [
    { fieldName: 'id', component: 'Input', formItemClass: 'hidden' },
    {
      fieldName: 'platformCode',
      label: '平台',
      rules: 'required',
      component: 'Select',
      componentProps: { options: PLATFORM_OPTIONS },
    },
    {
      fieldName: 'shopName',
      label: '标准店铺名',
      rules: 'required',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'shopAlias',
      label: '页面短名/别名',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '例如京东页面只显示的店铺短名',
      },
    },
    {
      fieldName: 'companyId',
      label: '公司主体',
      rules: 'required',
      component: 'ApiSelect',
      componentProps: {
        ...companySelectProps,
        placeholder: '请选择公司主体',
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
      fieldName: 'platformCode',
      label: '平台',
      component: 'Select',
      componentProps: { allowClear: true, options: PLATFORM_OPTIONS },
    },
    {
      fieldName: 'shopName',
      label: '店铺名称',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'shopAlias',
      label: '店铺别名',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'companyId',
      label: '公司主体',
      component: 'ApiSelect',
      componentProps: {
        ...companySelectProps,
        placeholder: '请选择公司主体',
      },
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

export function useGridColumns(): VxeTableGridOptions<FdmdataShopCompanyApi.ShopCompany>['columns'] {
  return [
    { type: 'checkbox', width: 40, fixed: 'left' },
    {
      field: 'platformCode',
      title: '平台',
      minWidth: 110,
      fixed: 'left',
      formatter: ({ cellValue }: { cellValue: unknown }) =>
        getPlatformName(String(cellValue ?? '')),
    },
    {
      field: 'shopName',
      title: '标准店铺名',
      minWidth: 240,
      fixed: 'left',
      showOverflow: 'tooltip',
    },
    {
      field: 'shopAlias',
      title: '页面短名/别名',
      minWidth: 170,
      showOverflow: 'tooltip',
    },
    {
      field: 'companyName',
      title: '公司主体',
      minWidth: 220,
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
