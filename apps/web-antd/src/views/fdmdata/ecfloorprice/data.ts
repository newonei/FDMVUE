import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataEcFloorPriceApi } from '#/api/fdmdata/ecfloorprice';

import { DICT_TYPE } from '@vben/constants';
import { getDictLabel, getDictOptions } from '@vben/hooks';

import { defaultRefPrice, formatPrice } from './model';

export const PRICE_STATUS_OPTIONS = [
  { label: '已定价', value: 'PRICED' },
  { label: '未定价', value: 'UNPRICED' },
];

export function seriesLabel(code?: string) {
  if (!code) return '';
  return getDictLabel(DICT_TYPE.FDM_EC_PRICE_SERIES, code) || code;
}

export function materialLabel(key?: string) {
  if (!key) return '';
  return getDictLabel(DICT_TYPE.MATERIAL_TYPE, key) || key;
}

export function matKindLabel(kind?: string) {
  if (!kind) return '';
  return getDictLabel(DICT_TYPE.FDM_EC_PRICE_MAT_KIND, kind) || kind;
}

/** 列表上方筛选；系列在左侧选 */
export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'spec',
      label: '规格',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '如 185*61*6mm、185 61 0.6、瑜伽袜',
      },
    },
    {
      fieldName: 'matKind',
      label: '垫子类型',
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: getDictOptions(DICT_TYPE.FDM_EC_PRICE_MAT_KIND, 'string'),
      },
    },
    {
      fieldName: 'materialKey',
      label: '材质',
      component: 'Select',
      componentProps: {
        allowClear: true,
        showSearch: true,
        optionFilterProp: 'label',
        options: getDictOptions(DICT_TYPE.MATERIAL_TYPE, 'string'),
      },
    },
    {
      fieldName: 'priceStatus',
      label: '定价',
      component: 'Select',
      componentProps: { allowClear: true, options: PRICE_STATUS_OPTIONS },
    },
  ];
}

const priceFormatter = ({ cellValue }: { cellValue: unknown }) =>
  formatPrice(cellValue);

export function useGridColumns(): VxeTableGridOptions<FdmdataEcFloorPriceApi.FloorPrice>['columns'] {
  return [
    {
      field: 'seriesCode',
      title: '产品系列',
      minWidth: 130,
      formatter: ({ cellValue }) => seriesLabel(cellValue),
    },
    {
      field: 'materialKey',
      title: '材质',
      minWidth: 90,
      formatter: ({ cellValue }) => materialLabel(cellValue) || '不区分',
    },
    {
      field: 'specText',
      title: '规格',
      minWidth: 170,
      showOverflow: 'tooltip',
    },
    {
      field: 'matKind',
      title: '垫子类型',
      minWidth: 90,
      formatter: ({ cellValue }) => matKindLabel(cellValue),
    },
    {
      field: 'floorPrice',
      title: '公司底价',
      minWidth: 100,
      align: 'right',
      formatter: priceFormatter,
      slots: { default: 'floorPrice' },
    },
    {
      field: 'refPrice',
      title: '平台参考价',
      minWidth: 110,
      align: 'right',
      slots: { default: 'refPrice' },
    },
    { field: 'remark', title: '备注', minWidth: 160, showOverflow: 'tooltip' },
    { field: 'updaterName', title: '最后修改人', minWidth: 100 },
    {
      field: 'updateTime',
      title: '修改时间',
      minWidth: 150,
      formatter: 'formatDateTime',
    },
    { title: '操作', width: 170, fixed: 'right', slots: { default: 'actions' } },
  ];
}

export function useFormSchema(): VbenFormSchema[] {
  return [
    { fieldName: 'id', component: 'Input', formItemClass: 'hidden' },
    {
      fieldName: 'seriesCode',
      label: '产品系列',
      rules: 'required',
      component: 'Select',
      componentProps: {
        class: 'w-full',
        showSearch: true,
        optionFilterProp: 'label',
        options: getDictOptions(DICT_TYPE.FDM_EC_PRICE_SERIES, 'string'),
        placeholder: '请选择产品系列',
      },
    },
    {
      fieldName: 'materialKey',
      label: '材质',
      component: 'Select',
      componentProps: {
        class: 'w-full',
        allowClear: true,
        showSearch: true,
        optionFilterProp: 'label',
        options: getDictOptions(DICT_TYPE.MATERIAL_TYPE, 'string'),
        placeholder: '不填表示不区分材质',
      },
    },
    {
      fieldName: 'specText',
      label: '规格',
      rules: 'required',
      component: 'Input',
      componentProps: {
        maxlength: 128,
        placeholder: '如 185*61*0.6cm；配件填品名规格',
      },
    },
    {
      fieldName: 'matKind',
      label: '垫子类型',
      component: 'Select',
      componentProps: {
        class: 'w-full',
        allowClear: true,
        options: getDictOptions(DICT_TYPE.FDM_EC_PRICE_MAT_KIND, 'string'),
      },
    },
    {
      fieldName: 'floorPrice',
      label: '公司底价',
      component: 'InputNumber',
      componentProps: {
        min: 0,
        precision: 2,
        class: 'w-full',
        placeholder: '不填表示未定价',
      },
    },
    {
      fieldName: 'refPriceManual',
      label: '参考价',
      component: 'Switch',
      defaultValue: false,
      componentProps: {
        checkedChildren: '手动填写',
        unCheckedChildren: '底价×1.2',
      },
    },
    {
      fieldName: 'refPrice',
      label: '平台参考价',
      component: 'InputNumber',
      componentProps: { min: 0, precision: 2, class: 'w-full' },
      dependencies: {
        triggerFields: ['refPriceManual', 'floorPrice'],
        disabled: (values) => !values.refPriceManual,
        trigger: (values, formApi) => {
          if (!values.refPriceManual) {
            formApi.setFieldValue('refPrice', defaultRefPrice(values.floorPrice));
          }
        },
      },
    },
    {
      fieldName: 'sort',
      label: '排序',
      component: 'InputNumber',
      defaultValue: 0,
      componentProps: { min: 0, class: 'w-full' },
    },
    {
      fieldName: 'remark',
      label: '备注',
      component: 'Textarea',
      formItemClass: 'md:col-span-2',
      componentProps: { rows: 2, maxlength: 512, showCount: true },
    },
  ];
}
