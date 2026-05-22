import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataEcShopDailyBrushApi } from '#/api/fdmdata/ecshopdailybrush';

import { getRangePickerDefaultProps } from '#/utils';

import { EC_PLATFORM_SUGGESTIONS } from '../ecshopdaily/data';

export { EC_PLATFORM_SUGGESTIONS };

export const EC_SHOP_DAILY_BRUSH_DEFAULTS: Partial<FdmdataEcShopDailyBrushApi.EcShopDailyBrush> =
  {
    shopId: '',
    shopName: '',
    brushOrderCount: 0,
    brushPrincipal: 0,
    brushCommission: 0,
    brushTotalCost: 0,
  };

/** 新增/修改表单 */
export function useFormSchema(): VbenFormSchema[] {
  return [
    { fieldName: 'id', component: 'Input', formItemClass: 'hidden' },
    {
      fieldName: 'statDate',
      label: '刷单日期',
      rules: 'selectRequired',
      component: 'DatePicker',
      componentProps: {
        class: 'w-full',
        allowClear: true,
        format: 'YYYY-MM-DD',
        valueFormat: 'YYYY-MM-DD',
      },
    },
    {
      fieldName: 'platformCode',
      label: '平台编码',
      rules: 'required',
      component: 'AutoComplete',
      componentProps: {
        allowClear: true,
        placeholder: '如 TMALL、TAOBAO、JD',
        options: EC_PLATFORM_SUGGESTIONS,
        filterOption: (input: string, option?: { value: string }) =>
          (option?.value ?? '')
            .toLowerCase()
            .includes((input || '').toLowerCase()),
      },
    },
    {
      fieldName: 'shopId',
      label: '店铺 ID',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '无则留空',
        maxlength: 64,
      },
    },
    {
      fieldName: 'shopName',
      label: '店铺名称',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '与日汇总店铺名称保持一致',
        maxlength: 128,
      },
    },
    {
      fieldName: 'brushOrderCount',
      label: '刷单单量',
      rules: 'selectRequired',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 0,
        precision: 0,
        placeholder: '0',
      },
    },
    {
      fieldName: 'brushPrincipal',
      label: '刷单本金',
      rules: 'selectRequired',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 0,
        precision: 2,
        placeholder: '买家实付金额',
      },
    },
    {
      fieldName: 'brushCommission',
      label: '刷单佣金',
      rules: 'selectRequired',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 0,
        precision: 2,
        placeholder: '0.00',
      },
    },
    {
      fieldName: 'brushTotalCost',
      label: '刷单总成本',
      rules: 'selectRequired',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 0,
        precision: 2,
        placeholder: '本金+佣金+其他',
      },
    },
    {
      fieldName: 'remark',
      label: '备注',
      component: 'Textarea',
      componentProps: {
        maxlength: 256,
        rows: 2,
        showCount: true,
        placeholder: '可选，如：商品/活动说明',
      },
    },
  ];
}

/** 列表检索表单 */
export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'statDate',
      label: '刷单日期',
      component: 'RangePicker',
      componentProps: { ...getRangePickerDefaultProps(), allowClear: true },
    },
    {
      fieldName: 'platformCode',
      label: '平台',
      component: 'Input',
      componentProps: { allowClear: true, placeholder: '如 TMALL、PDD' },
    },
    {
      fieldName: 'shopId',
      label: '店铺 ID',
      component: 'Input',
      componentProps: { allowClear: true, placeholder: '精确匹配' },
    },
    {
      fieldName: 'shopName',
      label: '店铺名称',
      component: 'Input',
      componentProps: { allowClear: true, placeholder: '模糊搜索' },
    },
  ];
}

function formatAmount({ cellValue }: { cellValue: unknown }) {
  if (cellValue === null || cellValue === undefined || cellValue === '')
    return '';
  const n = Number(cellValue);
  return Number.isFinite(n) ? n.toFixed(2) : String(cellValue);
}

/** 列表列 */
export function useGridColumns(): VxeTableGridOptions<FdmdataEcShopDailyBrushApi.EcShopDailyBrush>['columns'] {
  return [
    { type: 'checkbox', width: 40, fixed: 'left' },
    {
      field: 'statDate',
      title: '刷单日期',
      minWidth: 112,
      fixed: 'left',
      formatter: ({ cellValue }: { cellValue: unknown }) =>
        cellValue ? String(cellValue).slice(0, 10) : '',
    },
    { field: 'platformCode', title: '平台', minWidth: 88, fixed: 'left' },
    {
      field: 'shopId',
      title: '店铺 ID',
      minWidth: 120,
      showOverflow: 'tooltip',
    },
    {
      field: 'shopName',
      title: '店铺名称',
      minWidth: 140,
      showOverflow: 'tooltip',
    },
    {
      field: 'brushOrderCount',
      title: '刷单单量',
      minWidth: 96,
      align: 'right',
    },
    {
      field: 'brushPrincipal',
      title: '刷单本金',
      minWidth: 104,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'brushCommission',
      title: '刷单佣金',
      minWidth: 104,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'brushTotalCost',
      title: '刷单总成本',
      minWidth: 108,
      align: 'right',
      formatter: formatAmount,
    },
    { field: 'remark', title: '备注', minWidth: 140, showOverflow: 'tooltip' },
    {
      field: 'createTime',
      title: '创建时间',
      minWidth: 156,
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
