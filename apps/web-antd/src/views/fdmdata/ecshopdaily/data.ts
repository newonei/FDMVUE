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
    shopName: '',
    orderCount: 0,
    paidOrderCount: 0,
    refundOrderCount: 0,
    gmvAmount: 0,
    paidAmount: 0,
    refundAmount: 0,
    marketingCost: 0,
  };

/** 提交时可选整数字段（空则传 null） */
const OPTIONAL_INT_FIELDS = [
  'visitorCount',
  'pageViewCount',
  'buyerCount',
  'avgStayDurationSec',
  'productVisitorCount',
  'productPageViewCount',
  'paidProductCount',
  'returningBuyerCount',
  'productFavoriteBuyerCount',
  'cartAddUserCount',
  'reviewCount',
  'positiveReviewCount',
  'negativeReviewCount',
  'reviewWithImageCount',
  'pickupPackageCount',
  'shippedPackageCount',
  'deliveryPackageCount',
  'signedPackageCount',
] as const;

/** 提交时可选金额字段（空则传 null） */
const OPTIONAL_AMOUNT_FIELDS = [
  'paymentConversionRate',
  'avgOrderValue',
  'bounceRate',
  'avgPageViewPerVisitor',
  'uvValue',
  'returningBuyerPaidAmount',
  'descMatchScore',
  'logisticsServiceScore',
  'serviceAttitudeScore',
  'taobaokeCommission',
  'diamondDisplayCost',
  'trainAdCost',
] as const;

function requiredInt(raw: unknown, fallback = 0): number {
  if (raw === '' || raw === null || raw === undefined) {
    return fallback;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function requiredAmount(raw: unknown, fallback = 0): number {
  if (raw === '' || raw === null || raw === undefined) {
    return fallback;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function optionalInt(raw: unknown): null | number {
  if (raw === '' || raw === null || raw === undefined) {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function optionalAmount(raw: unknown): null | number {
  if (raw === '' || raw === null || raw === undefined) {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * 与后端 EcShopDailySaveReqVO 对齐；净销售额由服务端计算，不提交。
 */
export function buildEcShopDailySubmitPayload(
  raw: Record<string, any>,
): FdmdataEcShopDailyApi.EcShopDaily {
  const payload: Record<string, any> = {
    id: raw.id,
    statDate: raw.statDate,
    platformCode: String(raw.platformCode ?? '').trim(),
    shopId: String(raw.shopId ?? '').trim(),
    shopName: String(raw.shopName ?? '').trim(),
    currency: String(raw.currency ?? 'CNY'),
    orderCount: requiredInt(raw.orderCount),
    paidOrderCount: requiredInt(raw.paidOrderCount),
    refundOrderCount: requiredInt(raw.refundOrderCount),
    gmvAmount: requiredAmount(raw.gmvAmount),
    paidAmount: requiredAmount(raw.paidAmount),
    refundAmount: requiredAmount(raw.refundAmount),
    marketingCost: requiredAmount(raw.marketingCost),
    remark: String(raw.remark ?? '').trim() || undefined,
  };
  for (const key of OPTIONAL_INT_FIELDS) {
    payload[key] = optionalInt(raw[key]);
  }
  for (const key of OPTIONAL_AMOUNT_FIELDS) {
    payload[key] = optionalAmount(raw[key]);
  }
  return payload as FdmdataEcShopDailyApi.EcShopDaily;
}

function formInt(
  fieldName: keyof FdmdataEcShopDailyApi.EcShopDaily & string,
  label: string,
  required = false,
): VbenFormSchema {
  return {
    fieldName,
    label,
    rules: required ? 'selectRequired' : undefined,
    component: 'InputNumber',
    componentProps: {
      class: 'w-full',
      min: 0,
      precision: 0,
      placeholder: required ? '0' : '可选',
    },
  };
}

function formAmount(
  fieldName: keyof FdmdataEcShopDailyApi.EcShopDaily & string,
  label: string,
  required = false,
  precision = 2,
): VbenFormSchema {
  return {
    fieldName,
    label,
    rules: required ? 'selectRequired' : undefined,
    component: 'InputNumber',
    componentProps: {
      class: 'w-full',
      min: 0,
      precision,
      placeholder: required ? '0.00' : '可选',
    },
  };
}

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

/** 新增/修改表单（与 fdm_ec_shop_daily 全字段对齐，净销售额仅展示） */
export function useFormSchema(): VbenFormSchema[] {
  const fullWidth = 'col-span-2 min-w-0';
  const section = (key: string, title: string): VbenFormSchema => ({
    fieldName: `_divider_${key}`,
    label: '',
    component: 'Divider',
    formItemClass: fullWidth,
    componentProps: {
      orientation: 'left',
      plain: true,
      children: title,
    },
  });

  return [
    // id 通过 CSS 隐藏即可；不挂 triggerFields 依赖，避免
    // destroyOnClose 销毁阶段触发依赖重算导致 Vue 崩溃。
    {
      fieldName: 'id',
      component: 'Input',
      formItemClass: 'hidden',
    },

    section('basic', '基本信息'),
    {
      fieldName: 'statDate',
      label: '统计日期',
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
        placeholder: 'shop_id 为空时用于区分多店',
        maxlength: 128,
      },
    },
    {
      fieldName: 'currency',
      label: '币种',
      rules: 'selectRequired',
      component: 'Select',
      componentProps: {
        allowClear: false,
        options: [{ label: 'CNY 人民币', value: 'CNY' }],
      },
    },

    section('sales', '订单与金额'),
    formInt('orderCount', '订单笔数', true),
    formInt('paidOrderCount', '已支付订单笔数', true),
    formInt('refundOrderCount', '退款完成订单笔数', true),
    formAmount('gmvAmount', '成交额', true),
    formAmount('paidAmount', '已支付金额', true),
    formAmount('refundAmount', '退款金额', true),
    {
      fieldName: 'netSalesAmount',
      label: '净销售额',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        disabled: true,
        precision: 2,
        placeholder: '保存时自动计算',
      },
      dependencies: {
        triggerFields: ['paidAmount', 'refundAmount'],
        componentProps: (values) => {
          const paid = Number(values.paidAmount ?? 0);
          const refund = Number(values.refundAmount ?? 0);
          const net = (paid - refund).toFixed(2);
          return {
            class: 'w-full',
            disabled: true,
            precision: 2,
            value: Number.isFinite(Number(net)) ? Number(net) : undefined,
          };
        },
      },
    },
    formAmount('marketingCost', '营销花费', true),
    formAmount('avgOrderValue', '客单价'),

    section('traffic', '流量与转化'),
    formInt('visitorCount', '访客数'),
    formInt('pageViewCount', '浏览量（PV）'),
    formInt('buyerCount', '成交买家数'),
    formAmount('paymentConversionRate', '支付转化率(%)', false, 4),
    formAmount('bounceRate', '跳失率(%)', false, 4),
    formInt('avgStayDurationSec', '平均停留时长(秒)'),
    formAmount('avgPageViewPerVisitor', '人均浏览量'),
    formAmount('uvValue', 'UV价值', false, 4),

    section('product', '商品与买家行为'),
    formInt('productVisitorCount', '商品访客数'),
    formInt('productPageViewCount', '商品浏览量'),
    formInt('paidProductCount', '支付商品数'),
    formInt('returningBuyerCount', '支付老买家数'),
    formAmount('returningBuyerPaidAmount', '老买家支付金额'),
    formInt('productFavoriteBuyerCount', '商品收藏买家数'),
    formInt('cartAddUserCount', '加购人数'),

    section('review', '评价与服务质量'),
    formInt('reviewCount', '评价数'),
    formInt('positiveReviewCount', '正面评价数'),
    formInt('negativeReviewCount', '负面评价数'),
    formInt('reviewWithImageCount', '有图评价数'),
    formAmount('descMatchScore', '描述相符评分'),
    formAmount('logisticsServiceScore', '物流服务评分'),
    formAmount('serviceAttitudeScore', '服务态度评分'),

    section('logistics', '物流包裹'),
    formInt('pickupPackageCount', '揽收包裹数'),
    formInt('shippedPackageCount', '发货包裹数'),
    formInt('deliveryPackageCount', '派送包裹数'),
    formInt('signedPackageCount', '签收成功包裹数'),

    section('marketing', '营销投放'),
    formAmount('taobaokeCommission', '淘宝客佣金'),
    formAmount('diamondDisplayCost', '钻石展位消耗'),
    formAmount('trainAdCost', '直通车消耗'),

    section('remark', '备注'),
    {
      fieldName: 'remark',
      label: '备注',
      formItemClass: fullWidth,
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
