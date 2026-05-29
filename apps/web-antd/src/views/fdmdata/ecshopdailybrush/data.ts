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

const BRUSH_COLUMN_HELP: Record<string, string> = {
  brushCommission: '刷单佣金：刷单产生的佣金或服务费，参与刷单总成本分析。',
  brushOrderCount:
    '刷单单量：当前统计日录入的刷单订单数量；主表真实订单会按 paid_order_count - brush_order_count 计算。',
  brushPrincipal:
    '刷单本金：刷单本金/金额；主表真实销售额会按 paid_amount - refund_amount - brush_principal 计算。',
  brushTotalCost:
    '刷单总成本 = 刷单本金 + 刷单佣金 + 其他刷单相关费用。用于评估刷单成本。',
  createTime: '创建时间：该刷单记录写入系统的时间。',
  platformCode: '平台：刷单记录归属的平台编码。',
  remark: '备注：刷单说明或来源补充。',
  shopId: '店铺 ID：店铺内部或平台编号，可用于匹配 fdm_just_shop 店铺名称。',
  shopName: '店铺名称：刷单记录归属店铺。',
  statDate: '刷单日期：刷单数据归属的统计日期。',
};

function columnHelp(field: string) {
  const content = BRUSH_COLUMN_HELP[field];
  return content
    ? { content, icon: 'vxe-icon-question-circle-fill' }
    : undefined;
}

/** 列表列 */
export function useGridColumns(): VxeTableGridOptions<FdmdataEcShopDailyBrushApi.EcShopDailyBrush>['columns'] {
  return [
    { type: 'checkbox', width: 40, fixed: 'left' },
    {
      field: 'statDate',
      title: '刷单日期',
      titleSuffix: columnHelp('statDate'),
      minWidth: 112,
      fixed: 'left',
      formatter: ({ cellValue }: { cellValue: unknown }) =>
        cellValue ? String(cellValue).slice(0, 10) : '',
    },
    {
      field: 'platformCode',
      title: '平台',
      titleSuffix: columnHelp('platformCode'),
      minWidth: 88,
      fixed: 'left',
    },
    {
      field: 'shopId',
      title: '店铺 ID',
      titleSuffix: columnHelp('shopId'),
      minWidth: 120,
      showOverflow: 'tooltip',
    },
    {
      field: 'shopName',
      title: '店铺名称',
      titleSuffix: columnHelp('shopName'),
      minWidth: 140,
      showOverflow: 'tooltip',
    },
    {
      field: 'brushOrderCount',
      title: '刷单单量',
      titleSuffix: columnHelp('brushOrderCount'),
      minWidth: 96,
      align: 'right',
    },
    {
      field: 'brushPrincipal',
      title: '刷单本金',
      titleSuffix: columnHelp('brushPrincipal'),
      minWidth: 104,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'brushCommission',
      title: '刷单佣金',
      titleSuffix: columnHelp('brushCommission'),
      minWidth: 104,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'brushTotalCost',
      title: '刷单总成本',
      titleSuffix: columnHelp('brushTotalCost'),
      minWidth: 108,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'remark',
      title: '备注',
      titleSuffix: columnHelp('remark'),
      minWidth: 140,
      showOverflow: 'tooltip',
    },
    {
      field: 'createTime',
      title: '创建时间',
      titleSuffix: columnHelp('createTime'),
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
