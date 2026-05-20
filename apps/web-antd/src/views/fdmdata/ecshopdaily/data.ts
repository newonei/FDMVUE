import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';

import { getRangePickerDefaultProps } from '#/utils';

/** 常用平台编码（可 AutoComplete 手工输入其它值） */
export const EC_PLATFORM_SUGGESTIONS = [
  { value: 'TAOBAO', label: '淘宝 TAOBAO' },
  { value: 'TMALL', label: '天猫 TMALL' },
  { value: 'PDD', label: '拼多多 PDD' },
  { value: 'DOUYIN', label: '抖音 DOUYIN' },
  { value: 'JD', label: '京东 JD' },
  { value: 'XHS', label: '小红书 XHS' },
  { value: 'SPH', label: '视频号 SPH' },
];

export const EC_SHOP_DAILY_CREATE_DEFAULTS: Partial<FdmdataEcShopDailyApi.EcShopDaily> =
  {
    currency: 'CNY',
    shopId: '',
    orderCount: 0,
    paidOrderCount: 0,
    refundOrderCount: 0,
    gmvAmount: 0,
    paidAmount: 0,
    refundAmount: 0,
    marketingCost: 0,
  };

function formatAmount({ cellValue }: { cellValue: unknown }) {
  if (cellValue === null || cellValue === undefined || cellValue === '') {
    return '';
  }
  const n = Number(cellValue);
  return Number.isFinite(n) ? n.toFixed(2) : String(cellValue);
}

function formatPercent({ cellValue }: { cellValue: unknown }) {
  if (cellValue === null || cellValue === undefined || cellValue === '') {
    return '';
  }
  const n = Number(cellValue);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : String(cellValue);
}

function formatDecimal({ cellValue }: { cellValue: unknown }) {
  if (cellValue === null || cellValue === undefined || cellValue === '') {
    return '';
  }
  const n = Number(cellValue);
  return Number.isFinite(n) ? n.toFixed(2) : String(cellValue);
}

function intCol(
  field: keyof FdmdataEcShopDailyApi.EcShopDaily & string,
  title: string,
  minWidth = 96,
): NonNullable<
  VxeTableGridOptions<FdmdataEcShopDailyApi.EcShopDaily>['columns']
>[number] {
  return {
    field,
    title,
    minWidth,
    align: 'right',
  };
}

function amountCol(
  field: keyof FdmdataEcShopDailyApi.EcShopDaily & string,
  title: string,
  minWidth = 104,
): NonNullable<
  VxeTableGridOptions<FdmdataEcShopDailyApi.EcShopDaily>['columns']
>[number] {
  return {
    field,
    title,
    minWidth,
    align: 'right',
    formatter: formatAmount,
  };
}

/** 新增/修改表单 */
export function useFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'id',
      component: 'Input',
      dependencies: {
        triggerFields: ['statDate'],
        show: () => false,
      },
    },
    {
      fieldName: 'statDate',
      label: '统计日期',
      rules: 'selectRequired',
      formItemClass: 'col-span-1',
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
      label: '平台',
      rules: 'required',
      formItemClass: 'col-span-1',
      component: 'AutoComplete',
      componentProps: {
        allowClear: true,
        placeholder: '选择或输入编码，如 TMALL',
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
      formItemClass: 'col-span-1',
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
      formItemClass: 'col-span-1',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '可选',
        maxlength: 128,
      },
    },
    {
      fieldName: 'currency',
      label: '币种',
      rules: 'selectRequired',
      formItemClass: 'col-span-1',
      component: 'Select',
      componentProps: {
        allowClear: false,
        options: [{ label: 'CNY 人民币', value: 'CNY' }],
      },
    },
    {
      fieldName: 'orderCount',
      label: '订单数',
      rules: 'selectRequired',
      formItemClass: 'col-span-1',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 0,
        precision: 0,
        placeholder: '0',
      },
    },
    {
      fieldName: 'paidOrderCount',
      label: '已支付单数',
      rules: 'selectRequired',
      formItemClass: 'col-span-1',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 0,
        precision: 0,
      },
    },
    {
      fieldName: 'refundOrderCount',
      label: '退款单数',
      rules: 'selectRequired',
      formItemClass: 'col-span-1',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 0,
        precision: 0,
      },
    },
    {
      fieldName: 'gmvAmount',
      label: '成交额',
      rules: 'selectRequired',
      formItemClass: 'col-span-1',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 0,
        precision: 2,
        placeholder: '0.00',
      },
    },
    {
      fieldName: 'paidAmount',
      label: '已支付金额',
      rules: 'selectRequired',
      formItemClass: 'col-span-1',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 0,
        precision: 2,
      },
    },
    {
      fieldName: 'refundAmount',
      label: '退款金额',
      rules: 'selectRequired',
      formItemClass: 'col-span-1',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 0,
        precision: 2,
      },
    },
    {
      fieldName: 'visitorCount',
      label: '访客数',
      formItemClass: 'col-span-1',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 0,
        precision: 0,
        placeholder: '可选',
      },
    },
    {
      fieldName: 'pageViewCount',
      label: '浏览量',
      formItemClass: 'col-span-1',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 0,
        precision: 0,
        placeholder: 'PV，可选',
      },
    },
    {
      fieldName: 'buyerCount',
      label: '成交买家',
      formItemClass: 'col-span-1',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 0,
        precision: 0,
        placeholder: '可选',
      },
    },
    {
      fieldName: 'marketingCost',
      label: '营销花费',
      rules: 'selectRequired',
      formItemClass: 'col-span-1',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 0,
        precision: 2,
        placeholder: '0.00',
      },
    },
    {
      fieldName: 'remark',
      label: '备注',
      formItemClass: 'col-span-1 sm:col-span-2',
      component: 'Textarea',
      componentProps: {
        maxlength: 512,
        rows: 3,
        showCount: true,
        placeholder: '可选',
      },
    },
  ];
}

/** 列表检索（仅常用条件，避免表单过长） */
export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'statDate',
      label: '统计日期',
      component: 'RangePicker',
      componentProps: {
        ...getRangePickerDefaultProps(),
        allowClear: true,
      },
    },
    {
      fieldName: 'platformCode',
      label: '平台',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '如 TMALL、PDD',
      },
    },
    {
      fieldName: 'shopId',
      label: '店铺 ID',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '精确匹配',
      },
    },
    {
      fieldName: 'shopName',
      label: '店铺名称',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '模糊搜索',
      },
    },
  ];
}

/** 列表列 */
export function useGridColumns(): VxeTableGridOptions<FdmdataEcShopDailyApi.EcShopDaily>['columns'] {
  return [
    { type: 'checkbox', width: 48, fixed: 'left' },
    {
      field: 'id',
      title: 'ID',
      width: 80,
      fixed: 'left',
    },
    {
      field: 'statDate',
      title: '统计日',
      minWidth: 112,
      fixed: 'left',
    },
    {
      field: 'platformCode',
      title: '平台',
      minWidth: 88,
      fixed: 'left',
    },
    {
      field: 'shopId',
      title: '店铺 ID',
      minWidth: 120,
      showOverflow: true,
    },
    {
      field: 'shopName',
      title: '店铺名称',
      minWidth: 140,
      showOverflow: true,
    },
    {
      field: 'currency',
      title: '币种',
      width: 72,
    },
    {
      field: 'orderCount',
      title: '订单数',
      minWidth: 88,
      align: 'right',
    },
    {
      field: 'paidOrderCount',
      title: '已支付',
      minWidth: 88,
      align: 'right',
    },
    {
      field: 'refundOrderCount',
      title: '退款单',
      minWidth: 88,
      align: 'right',
    },
    {
      field: 'gmvAmount',
      title: '成交额',
      minWidth: 104,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'paidAmount',
      title: '已支付额',
      minWidth: 104,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'refundAmount',
      title: '退款额',
      minWidth: 104,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'netSalesAmount',
      title: '净销售额',
      minWidth: 104,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'visitorCount',
      title: '访客',
      minWidth: 80,
      align: 'right',
    },
    {
      field: 'pageViewCount',
      title: '浏览量',
      minWidth: 88,
      align: 'right',
    },
    {
      field: 'buyerCount',
      title: '买家',
      minWidth: 80,
      align: 'right',
    },
    {
      field: 'marketingCost',
      title: '营销花费',
      minWidth: 100,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'paymentConversionRate',
      title: '支付转化率',
      minWidth: 108,
      align: 'right',
      formatter: formatPercent,
    },
    amountCol('avgOrderValue', '客单价'),
    {
      field: 'bounceRate',
      title: '跳失率',
      minWidth: 88,
      align: 'right',
      formatter: formatPercent,
    },
    intCol('avgStayDurationSec', '停留时长(秒)', 112),
    {
      field: 'avgPageViewPerVisitor',
      title: '人均浏览量',
      minWidth: 104,
      align: 'right',
      formatter: formatDecimal,
    },
    {
      field: 'uvValue',
      title: 'UV价值',
      minWidth: 96,
      align: 'right',
      formatter: formatDecimal,
    },
    intCol('productVisitorCount', '商品访客'),
    intCol('productPageViewCount', '商品浏览量', 104),
    intCol('paidProductCount', '支付商品数', 104),
    intCol('returningBuyerCount', '支付老买家', 104),
    amountCol('returningBuyerPaidAmount', '老买家支付额', 116),
    intCol('productFavoriteBuyerCount', '收藏买家', 96),
    intCol('cartAddUserCount', '加购人数'),
    intCol('reviewCount', '评价数', 88),
    intCol('positiveReviewCount', '正面评价', 96),
    intCol('negativeReviewCount', '负面评价', 96),
    intCol('reviewWithImageCount', '有图评价', 96),
    {
      field: 'descMatchScore',
      title: '描述相符',
      minWidth: 96,
      align: 'right',
      formatter: formatDecimal,
    },
    {
      field: 'logisticsServiceScore',
      title: '物流服务',
      minWidth: 96,
      align: 'right',
      formatter: formatDecimal,
    },
    {
      field: 'serviceAttitudeScore',
      title: '服务态度',
      minWidth: 96,
      align: 'right',
      formatter: formatDecimal,
    },
    intCol('pickupPackageCount', '揽收包裹', 96),
    intCol('shippedPackageCount', '发货包裹', 96),
    intCol('deliveryPackageCount', '派送包裹', 96),
    intCol('signedPackageCount', '签收包裹', 96),
    amountCol('taobaokeCommission', '淘宝客佣金', 108),
    amountCol('diamondDisplayCost', '钻石展位', 104),
    amountCol('trainAdCost', '直通车', 96),
    {
      field: 'remark',
      title: '备注',
      minWidth: 140,
      showOverflow: true,
    },
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
