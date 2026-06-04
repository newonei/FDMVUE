import type { Ref } from 'vue';

import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';

import { markRaw } from 'vue';

import dayjs from 'dayjs';

import {
  FdmDateRangePicker,
  getYesterdayDateRange,
} from '#/components/fdm-date-range-picker';

/** 接口 LocalDate 可能为 YYYY-MM-DD 字符串或 [year, month, day] 数组 */
export function normalizeStatDateForForm(
  statDate: unknown,
): string | undefined {
  if (statDate === undefined || statDate === null || statDate === '') {
    return undefined;
  }
  if (typeof statDate === 'string') {
    const s = statDate.trim();
    if (!s) return undefined;
    const d = dayjs(s.length >= 10 ? s.slice(0, 10) : s);
    return d.isValid() ? d.format('YYYY-MM-DD') : undefined;
  }
  if (Array.isArray(statDate) && statDate.length >= 3) {
    const [y, m, d] = statDate;
    const parsed = dayjs(
      `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    );
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : undefined;
  }
  const d = dayjs(statDate as dayjs.ConfigType);
  return d.isValid() ? d.format('YYYY-MM-DD') : undefined;
}

/** 详情/列表行 → 表单可回填的值（DatePicker、平台编码等） */
export function mapEcShopDailyToFormValues(
  detail: Partial<FdmdataEcShopDailyApi.EcShopDaily> & Record<string, unknown>,
): Record<string, unknown> {
  const platformRaw =
    detail.platformCode ?? (detail.platform_code as string | undefined);
  return {
    ...detail,
    statDate: normalizeStatDateForForm(detail.statDate),
    platformCode:
      platformRaw !== null &&
      platformRaw !== undefined &&
      String(platformRaw).trim() !== ''
        ? String(platformRaw).trim()
        : undefined,
  };
}

/** 常用平台编码（供看板和表单下拉使用） */
export const EC_PLATFORM_SUGGESTIONS = [
  { value: 'TAOBAO', label: '淘宝' },
  { value: 'PDD', label: '拼多多' },
  { value: 'DOUYIN', label: '抖音' },
  { value: 'JD', label: '京东' },
  { value: 'XHS', label: '小红书' },
  { value: 'SPH', label: '视频号' },
];

const EC_PLATFORM_LABEL_MAP = new Map([
  ...EC_PLATFORM_SUGGESTIONS.map((item) => [item.value, item.label] as const),
  ['TMALL', '淘宝'] as const,
]);

export function formatEcPlatformLabel(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const code = String(value).trim();
  return EC_PLATFORM_LABEL_MAP.get(code) ?? code;
}

export function normalizeEcPlatformCode(raw: unknown): string | undefined {
  const code = String(raw ?? '').trim();
  return code ? code.toUpperCase() : undefined;
}

export interface EcShopDailyOption {
  label: string;
  value: string;
}

export interface EcShopDailyShopSelectOption extends EcShopDailyOption {
  shopId: string;
  shopName: string;
}

export interface EcShopDailyFormOptions {
  fixedPlatform?: boolean;
  onShopSearch?: (keyword: string) => void;
  platformCode?: string;
  shopOptions?: Ref<EcShopDailyShopSelectOption[]>;
  shopOptionsLoading?: Ref<boolean>;
}

export interface EcShopDailyGridOptions {
  hidePlatform?: boolean;
  platformCode?: string;
}

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

type EcShopDailyFormFieldKind = 'amount' | 'int' | 'percent' | 'text';

interface EcShopDailyPlatformFormField {
  detailField?: string;
  fieldName: string;
  kind: EcShopDailyFormFieldKind;
  label: string;
  placeholder?: string;
  precision?: number;
  required?: boolean;
}

interface EcShopDailyPlatformFormProfile {
  fields: EcShopDailyPlatformFormField[];
  importTemplate: string;
  label: string;
}

const EC_SHOP_DAILY_PLATFORM_FORM_PROFILES: Record<
  string,
  EcShopDailyPlatformFormProfile
> = {
  DOUYIN: {
    label: '抖音',
    importTemplate: '抖音电商经营数据 Excel',
    fields: [
      {
        fieldName: 'gmvAmount',
        label: '成交金额',
        kind: 'amount',
        required: true,
        detailField: 'transaction_amount',
      },
      {
        fieldName: 'paidAmount',
        label: '用户支付金额',
        kind: 'amount',
        required: true,
        detailField: 'paid_amount',
      },
      {
        fieldName: 'orderAmount',
        label: '下单金额',
        kind: 'amount',
        detailField: 'order_amount',
      },
      {
        fieldName: 'paidOrderCount',
        label: '成交订单数',
        kind: 'int',
        required: true,
        detailField: 'paid_order_count',
      },
      {
        fieldName: 'buyerCount',
        label: '成交人数',
        kind: 'int',
        detailField: 'buyer_count',
      },
      {
        fieldName: 'refundAmount',
        label: '退款金额(支付时间)',
        kind: 'amount',
        required: true,
        detailField: 'refund_amount_payment_time',
      },
      {
        fieldName: 'refundSuccessAmount',
        label: '退款金额(退款时间)',
        kind: 'amount',
        detailField: 'refund_amount_refund_time',
      },
      {
        fieldName: 'marketingCost',
        label: '支出金额',
        kind: 'amount',
        required: true,
        detailField: 'expense_amount',
      },
      {
        fieldName: 'adCost',
        label: '投放消耗',
        kind: 'amount',
        detailField: 'ad_cost',
      },
      {
        fieldName: 'platformCommission',
        label: '平台佣金',
        kind: 'amount',
        detailField: 'platform_commission',
      },
      {
        fieldName: 'talentCommission',
        label: '达人佣金',
        kind: 'amount',
        detailField: 'talent_commission',
      },
      {
        fieldName: 'brushPrincipal',
        label: '刷单金额',
        kind: 'amount',
        detailField: 'brush_amount',
      },
      {
        fieldName: 'brushOrderCount',
        label: '刷单量',
        kind: 'int',
        detailField: 'brush_order_count',
      },
    ],
  },
  JD: {
    label: '京东',
    importTemplate: '京东商智 Excel（第 1 行标题）',
    fields: [
      {
        fieldName: 'visitorCount',
        label: '访客数',
        kind: 'int',
        detailField: 'visitor_count',
      },
      {
        fieldName: 'pageViewCount',
        label: '浏览量',
        kind: 'int',
        detailField: 'page_view_count',
      },
      {
        fieldName: 'paidAmount',
        label: '成交金额',
        kind: 'amount',
        required: true,
        detailField: 'paid_amount',
      },
      {
        fieldName: 'buyerCount',
        label: '成交客户数',
        kind: 'int',
        detailField: 'buyer_count',
      },
      {
        fieldName: 'paidOrderCount',
        label: '成交单量',
        kind: 'int',
        required: true,
      },
      {
        fieldName: 'refundAmount',
        label: '退款金额',
        kind: 'amount',
        required: true,
        detailField: 'success_refund_amount',
      },
      {
        fieldName: 'refundOrderCount',
        label: '退款单量',
        kind: 'int',
      },
      {
        fieldName: 'marketingCost',
        label: '营销费用',
        kind: 'amount',
        required: true,
        detailField: 'marketing_cost',
      },
      {
        fieldName: 'promotionRedPacketAmount',
        label: '推广红包',
        kind: 'amount',
        detailField: 'promotion_red_packet_amount',
      },
      {
        fieldName: 'rebateReturnAmount',
        label: '反佣反货金',
        kind: 'amount',
        detailField: 'rebate_return_amount',
      },
      {
        fieldName: 'brushPrincipal',
        label: '刷单本金',
        kind: 'amount',
        detailField: 'brush_principal',
      },
      {
        fieldName: 'brushOrderCount',
        label: '刷单单量',
        kind: 'int',
        detailField: 'brush_order_count',
      },
      {
        fieldName: 'brushCommission',
        label: '刷单佣金',
        kind: 'amount',
        detailField: 'brush_commission',
      },
      {
        fieldName: 'brushTotalCostWithPlatformFee',
        label: '刷单总成本（加平台扣点）',
        kind: 'amount',
        detailField: 'brush_total_cost_with_platform_fee',
      },
    ],
  },
  PDD: {
    label: '拼多多',
    importTemplate: '拼多多经营数据 Excel',
    fields: [
      {
        fieldName: 'visitorCount',
        label: '访客数',
        kind: 'int',
        detailField: 'visitor_count',
      },
      {
        fieldName: 'pageViewCount',
        label: '浏览量',
        kind: 'int',
        detailField: 'page_view_count',
      },
      {
        fieldName: 'paidAmount',
        label: '支付金额',
        kind: 'amount',
        required: true,
        detailField: 'paid_amount',
      },
      {
        fieldName: 'buyerCount',
        label: '支付买家数',
        kind: 'int',
        detailField: 'buyer_count',
      },
      {
        fieldName: 'paidOrderCount',
        label: '支付订单数',
        kind: 'int',
        required: true,
      },
      {
        fieldName: 'refundAmount',
        label: '成功退款金额',
        kind: 'amount',
        required: true,
        detailField: 'success_refund_amount',
      },
      {
        fieldName: 'marketingCost',
        label: '营销花费',
        kind: 'amount',
        required: true,
        detailField: 'marketing_cost',
      },
      {
        fieldName: 'promotionRedPacketAmount',
        label: '推广红包金额',
        kind: 'amount',
        detailField: 'promotion_red_packet_amount',
      },
      {
        fieldName: 'brushPrincipal',
        label: '刷单本金',
        kind: 'amount',
        detailField: 'brush_principal',
      },
      {
        fieldName: 'brushOrderCount',
        label: '刷单单量',
        kind: 'int',
        detailField: 'brush_order_count',
      },
      {
        fieldName: 'brushCommission',
        label: '刷单佣金',
        kind: 'amount',
        detailField: 'brush_commission',
      },
      {
        fieldName: 'brushTotalCostWithPlatformFeeShipping',
        label: '刷单总成本（平台扣点+运费）',
        kind: 'amount',
        detailField: 'brush_total_cost_with_platform_fee_shipping',
      },
    ],
  },
  SPH: {
    label: '视频号',
    importTemplate: '视频号交易数据 Excel',
    fields: [
      {
        fieldName: 'gmvAmount',
        label: '成交金额',
        kind: 'amount',
        required: true,
        detailField: 'transaction_amount',
      },
      {
        fieldName: 'paidOrderCount',
        label: '成交订单数',
        kind: 'int',
        required: true,
        detailField: 'paid_order_count',
      },
      {
        fieldName: 'buyerCount',
        label: '成交人数',
        kind: 'int',
        detailField: 'buyer_count',
      },
      {
        fieldName: 'orderAmount',
        label: '下单金额',
        kind: 'amount',
        detailField: 'order_amount',
      },
      {
        fieldName: 'orderCount',
        label: '下单订单数',
        kind: 'int',
        required: true,
        detailField: 'order_count',
      },
      {
        fieldName: 'refundAmount',
        label: '退款金额',
        kind: 'amount',
        required: true,
        detailField: 'refund_amount',
      },
      {
        fieldName: 'refundAmount2',
        label: '成交退款金额',
        kind: 'amount',
        detailField: 'refund_amount_2',
      },
      {
        fieldName: 'orderUserCount',
        label: '下单人数',
        kind: 'int',
        detailField: 'order_user_count',
      },
      {
        fieldName: 'transactionAmount2',
        label: '实际成交金额',
        kind: 'amount',
        detailField: 'transaction_amount_2',
      },
    ],
  },
  TAOBAO: {
    label: '淘宝',
    importTemplate: '淘宝生意参谋 Excel（第 8 行标题）',
    fields: [
      {
        fieldName: 'orderCount',
        label: '订单笔数',
        kind: 'int',
        required: true,
      },
      {
        fieldName: 'paidOrderCount',
        label: '真实订单数',
        kind: 'int',
        required: true,
        detailField: 'metric_46482545',
      },
      {
        fieldName: 'refundOrderCount',
        label: '退款完成订单笔数',
        kind: 'int',
      },
      {
        fieldName: 'gmvAmount',
        label: '成交额(GMV)',
        kind: 'amount',
        required: true,
      },
      {
        fieldName: 'paidAmount',
        label: '支付金额',
        kind: 'amount',
        required: true,
        detailField: 'paid_amount',
      },
      {
        fieldName: 'refundAmount',
        label: '成功退款金额',
        kind: 'amount',
        required: true,
        detailField: 'success_refund_amount',
      },
      {
        fieldName: 'marketingCost',
        label: '营销费用总额',
        kind: 'amount',
        required: true,
        detailField: 'marketing_cost',
      },
      {
        fieldName: 'buyerCount',
        label: '支付买家数',
        kind: 'int',
        detailField: 'buyer_count',
      },
      {
        fieldName: 'orderUserCount',
        label: '下单人数',
        kind: 'int',
        detailField: 'order_user_count',
      },
      {
        fieldName: 'visitorCount',
        label: '访客数',
        kind: 'int',
        detailField: 'visitor_count',
      },
      {
        fieldName: 'pageViewCount',
        label: '浏览量',
        kind: 'int',
        detailField: 'page_view_count',
      },
      {
        fieldName: 'paymentConversionRate',
        label: '支付转化率',
        kind: 'percent',
        detailField: 'payment_conversion_rate',
      },
      {
        fieldName: 'avgOrderValue',
        label: '客单价',
        kind: 'amount',
        detailField: 'avg_order_value',
      },
      {
        fieldName: 'bounceRate',
        label: '跳失率',
        kind: 'percent',
        detailField: 'bounce_rate',
      },
      {
        fieldName: 'avgStayDurationSec',
        label: '平均停留时长',
        kind: 'text',
        detailField: 'avg_stay_duration',
      },
      {
        fieldName: 'pageViewCountPerUser',
        label: '人均浏览量',
        kind: 'int',
        detailField: 'page_view_count_2',
      },
      {
        fieldName: 'uvValue',
        label: 'UV 价值',
        kind: 'amount',
        detailField: 'uv_value',
      },
      {
        fieldName: 'productVisitorCount',
        label: '商品访客数',
        kind: 'int',
        detailField: 'product_visitor_count',
      },
      {
        fieldName: 'productPageViewCount',
        label: '商品浏览量',
        kind: 'int',
        detailField: 'product_page_view_count',
      },
      {
        fieldName: 'paidProductCount',
        label: '支付商品数',
        kind: 'int',
        detailField: 'paid_product_count',
      },
      {
        fieldName: 'paidItemCount',
        label: '支付件数',
        kind: 'int',
        detailField: 'paid_item_count',
      },
      {
        fieldName: 'returningBuyerCount',
        label: '支付老买家数',
        kind: 'int',
        detailField: 'returning_buyer_count',
      },
      {
        fieldName: 'returningBuyerPaidAmount',
        label: '老买家支付金额',
        kind: 'amount',
        detailField: 'returning_buyer_paid_amount',
      },
      {
        fieldName: 'productFavoriteBuyerCount',
        label: '商品收藏买家数',
        kind: 'int',
        detailField: 'product_favorite_buyer_count',
      },
      {
        fieldName: 'cartAddUserCount',
        label: '加购人数',
        kind: 'int',
        detailField: 'metric_bda235c9',
      },
      {
        fieldName: 'cartAddRate',
        label: '加购率',
        kind: 'percent',
        detailField: 'metric_10e8e840',
      },
      {
        fieldName: 'refundRate',
        label: '退款占比',
        kind: 'percent',
        detailField: 'metric_f45d7950',
      },
      {
        fieldName: 'reviewCount',
        label: '评价数',
        kind: 'int',
        detailField: 'review_count',
      },
      {
        fieldName: 'positiveReviewCount',
        label: '正面评价数',
        kind: 'int',
        detailField: 'review_count_2',
      },
      {
        fieldName: 'negativeReviewCount',
        label: '负面评价数',
        kind: 'int',
        detailField: 'review_count_3',
      },
      {
        fieldName: 'imageReviewCount',
        label: '有图评价数',
        kind: 'int',
        detailField: 'review_count_4',
      },
      {
        fieldName: 'descMatchScore',
        label: '描述相符评分',
        kind: 'amount',
        detailField: 'desc_match_score',
      },
      {
        fieldName: 'logisticsServiceScore',
        label: '物流服务评分',
        kind: 'amount',
        detailField: 'logistics_service_score',
      },
      {
        fieldName: 'serviceAttitudeScore',
        label: '服务态度评分',
        kind: 'amount',
        detailField: 'service_attitude_score',
      },
      {
        fieldName: 'positiveReviewRate',
        label: '好评率',
        kind: 'percent',
        detailField: 'metric_8f7e3a1a',
      },
      {
        fieldName: 'negativeReviewRate',
        label: '差评率',
        kind: 'percent',
        detailField: 'metric_302543c3',
      },
      {
        fieldName: 'pickupPackageCount',
        label: '揽收包裹数',
        kind: 'int',
        detailField: 'pickup_package_count',
      },
      {
        fieldName: 'shippedPackageCount',
        label: '发货包裹数',
        kind: 'int',
        detailField: 'shipped_package_count',
      },
      {
        fieldName: 'deliveryPackageCount',
        label: '派送包裹数',
        kind: 'int',
        detailField: 'delivery_package_count',
      },
      {
        fieldName: 'signedPackageCount',
        label: '签收成功包裹数',
        kind: 'int',
        detailField: 'signed_package_count',
      },
      {
        fieldName: 'pickupRate',
        label: '揽收率',
        kind: 'percent',
        detailField: 'metric_ce0485cc',
      },
      {
        fieldName: 'taobaokeCommission',
        label: '淘宝客佣金',
        kind: 'amount',
        detailField: 'taobaoke_commission',
      },
      {
        fieldName: 'diamondDisplayCost',
        label: '钻石展位消耗',
        kind: 'amount',
        detailField: 'diamond_display_cost',
      },
      {
        fieldName: 'keywordAdCost',
        label: '关键词推广消耗',
        kind: 'amount',
        detailField: 'keyword_ad_cost',
      },
      {
        fieldName: 'audienceAdCost',
        label: '人群推广消耗',
        kind: 'amount',
        detailField: 'audience_ad_cost',
      },
      {
        fieldName: 'shortVideoAdCost',
        label: '超级短视频',
        kind: 'amount',
        detailField: 'short_video_ad_cost',
      },
      {
        fieldName: 'sitewideAdCost',
        label: '全站推广',
        kind: 'amount',
        detailField: 'sitewide_ad_cost',
      },
      {
        fieldName: 'contentVisitorCount',
        label: '内容引导访客数',
        kind: 'int',
        detailField: 'content_visitor_count',
      },
      {
        fieldName: 'contentSeedTransactionAmount',
        label: '内容引导种草成交金额',
        kind: 'amount',
        detailField: 'content_seed_transaction_amount',
      },
      {
        fieldName: 'actualSalesAmount',
        label: '实际销售额',
        kind: 'amount',
        detailField: 'actual_sales_amount',
      },
      {
        fieldName: 'costRatio',
        label: '花费占比',
        kind: 'percent',
        detailField: 'cost_ratio',
      },
      {
        fieldName: 'parentRecord',
        label: '父记录',
        kind: 'text',
        detailField: 'parent_record',
      },
      {
        fieldName: 'brushPrincipal',
        label: '刷单本金',
        kind: 'amount',
        detailField: 'brush_principal',
      },
      {
        fieldName: 'brushOrderCount',
        label: '刷单单量',
        kind: 'int',
        detailField: 'brush_order_count',
      },
      {
        fieldName: 'brushCommission',
        label: '刷单佣金',
        kind: 'amount',
        detailField: 'brush_commission',
      },
      {
        fieldName: 'brushTotalCostWithPlatformFeeShipping',
        label: '刷单总成本（平台扣点+运费）',
        kind: 'amount',
        detailField: 'brush_total_cost_with_platform_fee_shipping',
      },
      {
        fieldName: 'returningBuyerSalesRatio',
        label: '老顾客销售占比',
        kind: 'percent',
        detailField: 'metric_a328447d',
      },
      {
        fieldName: 'favoriteRate',
        label: '收藏率',
        kind: 'percent',
        detailField: 'metric_240d5d4b',
      },
      {
        fieldName: 'consultingUv',
        label: '咨询人数',
        kind: 'int',
        detailField: 'consulting_uv',
      },
      {
        fieldName: 'consultRate',
        label: '咨询转化率',
        kind: 'percent',
        detailField: 'consult_rate',
      },
      {
        fieldName: 'customerCount',
        label: '客服人数',
        kind: 'int',
        detailField: 'customer_count',
      },
      {
        fieldName: 'customerConvertRate',
        label: '客服转化率',
        kind: 'percent',
        detailField: 'customer_convert_rate',
      },
      {
        fieldName: 'shopCustomer',
        label: '店铺粉丝',
        kind: 'int',
        detailField: 'shop_customer',
      },
      {
        fieldName: 'collectProductCount',
        label: '收藏商品数',
        kind: 'int',
        detailField: 'collect_product_count',
      },
      {
        fieldName: 'releaseItemCount',
        label: '商品数',
        kind: 'int',
        detailField: 'release_item_count',
      },
      {
        fieldName: 'postVideoCheckCnt',
        label: '审核视频数',
        kind: 'int',
        detailField: 'post_video_check_cnt',
      },
      {
        fieldName: 'successRefundRate',
        label: '退款率',
        kind: 'percent',
        detailField: 'success_refund_rate',
      },
      {
        fieldName: 'orderRefundRate',
        label: '订单退款率',
        kind: 'percent',
        detailField: 'order_refund_rate',
      },
      {
        fieldName: 'realPayRefundRate',
        label: '真实支付退款率',
        kind: 'percent',
        detailField: 'real_pay_refund_rate',
      },
      {
        fieldName: 'gotInTime48hRate',
        label: '48小时发货率',
        kind: 'percent',
        detailField: 'got_in_time_48h_rate',
      },
      {
        fieldName: 'gotInTime24hRate',
        label: '24小时发货率',
        kind: 'percent',
        detailField: 'got_in_time_24h_rate',
      },
      {
        fieldName: 'replyAvgTime',
        label: '平均响应时间',
        kind: 'text',
        detailField: 'reply_avg_time',
      },
      {
        fieldName: 'avgSignTimeHh',
        label: '平均签收时间',
        kind: 'text',
        detailField: 'avg_sign_time_hh',
      },
      {
        fieldName: 'refundFinishDuration',
        label: '平均退款完成时长',
        kind: 'text',
        detailField: 'refund_finish_duration',
      },
    ],
  },
  XHS: {
    label: '小红书',
    importTemplate: '小红书经营数据 Excel',
    fields: [
      {
        fieldName: 'gmvAmount',
        label: '实际成交金额',
        kind: 'amount',
        required: true,
        detailField: 'transaction_amount',
      },
      {
        fieldName: 'paidAmount',
        label: '支付金额',
        kind: 'amount',
        required: true,
        detailField: 'paid_amount',
      },
      {
        fieldName: 'paidOrderCount',
        label: '支付订单数',
        kind: 'int',
        required: true,
        detailField: 'paid_order_count_2',
      },
      {
        fieldName: 'paidItemCount',
        label: '支付件数',
        kind: 'int',
        detailField: 'paid_item_count',
      },
      {
        fieldName: 'buyerCount',
        label: '支付买家数',
        kind: 'int',
        detailField: 'buyer_count',
      },
      {
        fieldName: 'visitorCount',
        label: '总访客数',
        kind: 'int',
        detailField: 'visitor_count',
      },
      {
        fieldName: 'pageViewCount',
        label: '总浏览量',
        kind: 'int',
        detailField: 'page_view_count',
      },
      {
        fieldName: 'productVisitorCount',
        label: '商品访客数',
        kind: 'int',
        detailField: 'product_visitor_count',
      },
      {
        fieldName: 'productPageViewCount',
        label: '商品浏览量',
        kind: 'int',
        detailField: 'product_page_view_count',
      },
      {
        fieldName: 'cartAddUserCount',
        label: '新增加购人数',
        kind: 'int',
        detailField: 'metric_e3ccf5de',
      },
      {
        fieldName: 'cartAddItemCount',
        label: '新增加购件数',
        kind: 'int',
        detailField: 'metric_0a4c5554',
      },
      {
        fieldName: 'wishlistCount',
        label: '新加入心愿单人数',
        kind: 'int',
        detailField: 'wishlist_count',
      },
      {
        fieldName: 'refundAmount',
        label: '退款金额',
        kind: 'amount',
        required: true,
        detailField: 'refund_amount',
      },
      {
        fieldName: 'marketingCost',
        label: '推广花费',
        kind: 'amount',
        required: true,
        detailField: 'promotion_cost',
      },
      {
        fieldName: 'brushPrincipal',
        label: '补单本金',
        kind: 'amount',
        detailField: 'brush_principal',
      },
      {
        fieldName: 'brushOrderCount',
        label: '补单订单量',
        kind: 'int',
        detailField: 'brush_order_count',
      },
      {
        fieldName: 'brushCommission',
        label: '补单佣金',
        kind: 'amount',
        detailField: 'brush_commission',
      },
    ],
  },
};

export function getEcShopDailyPlatformFormProfile(platformCode?: string) {
  const code = normalizeEcPlatformCode(platformCode);
  if (code === 'TMALL') return EC_SHOP_DAILY_PLATFORM_FORM_PROFILES.TAOBAO;
  return code ? EC_SHOP_DAILY_PLATFORM_FORM_PROFILES[code] : undefined;
}

export function getEcShopDailyImportPlaceholder(platformCode?: string): string {
  const profile = getEcShopDailyPlatformFormProfile(platformCode);
  if (!profile) return '请选择具体平台后再导入 Excel。';
  return `${profile.label} Excel 导入入口已预留，后续会按「${profile.importTemplate}」字段模板接入导入实现。`;
}

export function getEcShopDailyCreateDefaults(
  platformCode?: string,
): Partial<FdmdataEcShopDailyApi.EcShopDaily> {
  const code = normalizeEcPlatformCode(platformCode);
  const profile = getEcShopDailyPlatformFormProfile(code);
  if (!profile) {
    return {
      ...EC_SHOP_DAILY_CREATE_DEFAULTS,
      platformCode: code,
    };
  }
  return {
    currency: 'CNY',
    platformCode: code,
    refundOrderCount: 0,
    shopId: '',
    shopName: '',
    ...(code === 'SPH' ? { marketingCost: 0 } : {}),
  };
}

function requiredInt(raw: unknown, fallback = 0): number {
  if (raw === '' || raw === null || raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function requiredAmount(raw: unknown, fallback = 0): number {
  if (raw === '' || raw === null || raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function hasValue(raw: unknown): boolean {
  return raw !== '' && raw !== null && raw !== undefined;
}

function firstValue(raw: Record<string, any>, ...keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (hasValue(value)) return value;
  }
  return undefined;
}

function setIfBlank(raw: Record<string, any>, key: string, value: unknown) {
  if (!hasValue(raw[key]) && hasValue(value)) {
    raw[key] = value;
  }
}

function optionalInt(raw: unknown): number | undefined {
  if (!hasValue(raw)) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function optionalAmount(raw: unknown): number | undefined {
  if (!hasValue(raw)) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function sumAmountFields(raw: Record<string, any>, keys: string[]) {
  let hasAny = false;
  let total = 0;
  for (const key of keys) {
    const value = optionalAmount(raw[key]);
    if (value === undefined) continue;
    hasAny = true;
    total += value;
  }
  return hasAny ? Number(total.toFixed(2)) : undefined;
}

function normalizeSubmitRaw(
  raw: Record<string, any>,
  fixedPlatformCode?: string,
) {
  const normalized: Record<string, any> = { ...raw };
  const platformCode = normalizeEcPlatformCode(
    normalized.platformCode ?? fixedPlatformCode,
  );
  normalized.platformCode = platformCode ?? '';

  setIfBlank(normalized, 'gmvAmount', firstValue(normalized, 'paidAmount'));
  setIfBlank(normalized, 'paidAmount', firstValue(normalized, 'gmvAmount'));
  setIfBlank(
    normalized,
    'orderCount',
    firstValue(normalized, 'paidOrderCount'),
  );
  setIfBlank(
    normalized,
    'paidOrderCount',
    firstValue(normalized, 'orderCount'),
  );
  setIfBlank(normalized, 'refundOrderCount', 0);

  switch (platformCode) {
    case 'DOUYIN': {
      setIfBlank(normalized, 'marketingCost', normalized.expenseAmount);
      setIfBlank(
        normalized,
        'marketingCost',
        sumAmountFields(normalized, [
          'adCost',
          'platformCommission',
          'talentCommission',
        ]),
      );
      setIfBlank(normalized, 'refundAmount', normalized.refundSuccessAmount);
      break;
    }
    case 'SPH': {
      setIfBlank(normalized, 'paidAmount', normalized.gmvAmount);
      setIfBlank(normalized, 'buyerCount', normalized.orderUserCount);
      break;
    }
    case 'TAOBAO':
    case 'TMALL': {
      setIfBlank(
        normalized,
        'marketingCost',
        sumAmountFields(normalized, [
          'taobaokeCommission',
          'diamondDisplayCost',
          'keywordAdCost',
          'audienceAdCost',
          'shortVideoAdCost',
          'sitewideAdCost',
        ]),
      );
      break;
    }
    // No default
  }
  setIfBlank(normalized, 'refundAmount', 0);
  setIfBlank(normalized, 'marketingCost', 0);

  return normalized;
}

function buildPlatformDetailPayload(
  raw: Record<string, any>,
  platformCode?: string,
) {
  const profile = getEcShopDailyPlatformFormProfile(platformCode);
  const detailPayload: Record<string, unknown> = {};
  for (const field of profile?.fields ?? []) {
    if (!field.detailField) continue;
    const value = raw[field.fieldName];
    if (hasValue(value)) {
      detailPayload[field.detailField] = value;
    }
  }
  return detailPayload;
}

export function mapEcShopDailyPlatformDetailToFormValues(
  platformCode: string | undefined,
  detail: Record<string, any> | undefined,
) {
  const profile = getEcShopDailyPlatformFormProfile(platformCode);
  const values: Record<string, unknown> = {};
  if (!profile || !detail) return values;
  for (const field of profile.fields) {
    if (!field.detailField) continue;
    const value = detail[field.detailField];
    if (hasValue(value)) {
      values[field.fieldName] = value;
    }
  }
  return values;
}

export function buildEcShopDailySubmitPayload(
  raw: Record<string, any>,
  fixedPlatformCode?: string,
): FdmdataEcShopDailyApi.EcShopDaily {
  const normalized = normalizeSubmitRaw(raw, fixedPlatformCode);
  const payload: Record<string, any> = {
    id: normalized.id,
    statDate: normalizeStatDateForForm(normalized.statDate),
    platformCode: String(normalized.platformCode ?? '').trim(),
    shopId: String(normalized.shopId ?? '').trim(),
    shopName: String(normalized.shopName ?? '').trim(),
    currency: String(normalized.currency ?? 'CNY'),
    orderCount: requiredInt(normalized.orderCount),
    paidOrderCount: requiredInt(normalized.paidOrderCount),
    refundOrderCount: requiredInt(normalized.refundOrderCount),
    gmvAmount: requiredAmount(normalized.gmvAmount),
    paidAmount: requiredAmount(normalized.paidAmount),
    refundAmount: requiredAmount(normalized.refundAmount),
    marketingCost: requiredAmount(normalized.marketingCost),
    remark: String(normalized.remark ?? '').trim() || undefined,
  };
  const buyerCount = optionalInt(normalized.buyerCount);
  const visitorCount = optionalInt(normalized.visitorCount);
  const pageViewCount = optionalInt(normalized.pageViewCount);
  const brushOrderCount = optionalInt(normalized.brushOrderCount);
  const brushPrincipal = optionalAmount(normalized.brushPrincipal);
  if (buyerCount !== undefined) payload.buyerCount = buyerCount;
  if (visitorCount !== undefined) payload.visitorCount = visitorCount;
  if (pageViewCount !== undefined) payload.pageViewCount = pageViewCount;
  if (brushOrderCount !== undefined) payload.brushOrderCount = brushOrderCount;
  if (brushPrincipal !== undefined) payload.brushPrincipal = brushPrincipal;

  const detailPayload = buildPlatformDetailPayload(
    normalized,
    payload.platformCode,
  );
  if (Object.keys(detailPayload).length > 0) {
    payload.detailPayload = detailPayload;
  }
  return payload as FdmdataEcShopDailyApi.EcShopDaily;
}

// ─── 表单 schema helpers ─────────────────────────────────────────────────────

function formInt(
  fieldName: string,
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
  fieldName: string,
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

function formText(
  fieldName: string,
  label: string,
  required = false,
): VbenFormSchema {
  return {
    fieldName,
    label,
    rules: required ? 'required' : undefined,
    component: 'Input',
    componentProps: {
      allowClear: true,
      class: 'w-full',
      maxlength: 128,
      placeholder: required ? `请输入${label}` : '可选',
    },
  };
}

function platformFormFieldSchema(
  field: EcShopDailyPlatformFormField,
): VbenFormSchema {
  if (field.kind === 'int') {
    return formInt(field.fieldName, field.label, field.required);
  }
  if (field.kind === 'text') {
    return formText(field.fieldName, field.label, field.required);
  }
  return formAmount(
    field.fieldName,
    field.label,
    field.required,
    field.precision ?? (field.kind === 'percent' ? 4 : 2),
  );
}

function netSalesPreviewSchema(): VbenFormSchema {
  return {
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
      triggerFields: [
        'platformCode',
        'gmvAmount',
        'paidAmount',
        'refundAmount',
        'brushPrincipal',
      ],
      componentProps: (values) => {
        const platformCode = String(values.platformCode ?? '')
          .trim()
          .toUpperCase();
        const useGmvBase = ['DOUYIN', 'TAOBAO', 'TMALL', 'XHS'].includes(
          platformCode,
        );
        const amountBase = Number(
          (useGmvBase
            ? (values.gmvAmount ?? values.paidAmount)
            : (values.paidAmount ?? values.gmvAmount)) ?? 0,
        );
        const refund = Number(values.refundAmount ?? 0);
        const brushPrincipal = Number(values.brushPrincipal ?? 0);
        const net = Number((amountBase - refund - brushPrincipal).toFixed(2));
        return {
          class: 'w-full',
          disabled: true,
          precision: 2,
          value: Number.isFinite(net) ? net : undefined,
        };
      },
    },
  };
}

/** 新增/修改表单 */
export function useFormSchema(
  options: EcShopDailyFormOptions = {},
): VbenFormSchema[] {
  const platformCode = normalizeEcPlatformCode(options.platformCode);
  const platformProfile = getEcShopDailyPlatformFormProfile(platformCode);
  const isFixedPlatform = !!platformCode && !!options.fixedPlatform;
  const isPddPlatform = platformCode === 'PDD';
  const fullWidth = 'col-span-2 min-w-0';
  const section = (key: string, title: string): VbenFormSchema => ({
    fieldName: `_divider_${key}`,
    label: '',
    hideLabel: true,
    component: 'Divider',
    formItemClass: fullWidth,
    renderComponentContent: () => ({ default: () => title }),
    componentProps: { orientation: 'left', plain: true },
  });
  const getPddShopIdSelectProps = (
    _values: Record<string, unknown>,
    formApi: {
      setValues?: (
        values: Record<string, unknown>,
        shouldValidate?: boolean,
      ) => Promise<void> | void;
    },
  ) => ({
    allowClear: true,
    class: 'w-full',
    filterOption: false,
    loading: options.shopOptionsLoading?.value ?? false,
    onClear: () => {
      void formApi.setValues?.({ shopId: '', shopName: '' }, false);
      options.onShopSearch?.('');
    },
    onFocus: () => options.onShopSearch?.(''),
    onSearch: options.onShopSearch,
    onSelect: (value: unknown, option: any) => {
      const shopId = String(value ?? '').trim();
      const selected = options.shopOptions?.value.find(
        (item) => item.value === shopId,
      );
      void formApi.setValues?.(
        {
          shopId,
          shopName: option?.shopName ?? selected?.shopName ?? '',
        },
        false,
      );
    },
    options: options.shopOptions?.value ?? [],
    placeholder: '请选择店铺',
    showSearch: true,
  });

  const schema: VbenFormSchema[] = [
    { fieldName: 'id', component: 'Input', formItemClass: 'hidden' },

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
      label: '平台',
      rules: 'required',
      component: 'Select',
      componentProps: {
        allowClear: !isFixedPlatform,
        disabled: isFixedPlatform,
        showSearch: true,
        optionFilterProp: 'label',
        placeholder: '请选择平台',
        options: EC_PLATFORM_SUGGESTIONS,
      },
    },
    {
      fieldName: 'shopId',
      label: '店铺 ID',
      rules: isPddPlatform ? 'selectRequired' : undefined,
      component: isPddPlatform ? 'Select' : 'Input',
      componentProps: isPddPlatform
        ? getPddShopIdSelectProps
        : {
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
        disabled: isPddPlatform,
        placeholder: isPddPlatform
          ? '选择店铺后自动带出'
          : 'shop_id 为空时用于区分多店',
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
  ];

  if (platformProfile) {
    schema.push(
      section('platform', `${platformProfile.label}新增字段`),
      ...platformProfile.fields.map((field) => platformFormFieldSchema(field)),
      section('calculated', '系统计算'),
      netSalesPreviewSchema(),
    );
  } else {
    schema.push(
      section('sales', '订单与金额'),
      formInt('orderCount', '订单笔数', true),
      formInt('paidOrderCount', '已支付订单笔数', true),
      formInt('refundOrderCount', '退款完成订单笔数', true),
      formAmount('gmvAmount', '成交额', true),
      formAmount('paidAmount', '已支付金额', true),
      formAmount('refundAmount', '退款金额', true),
      netSalesPreviewSchema(),
      formAmount('marketingCost', '营销花费', true),
      formInt('buyerCount', '成交买家数'),
    );
  }

  schema.push(section('remark', '备注'), {
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
  });

  return schema;
}

/** 列表检索表单 */
export function useGridFormSchema(
  shopNameOptions?: Ref<EcShopDailyOption[]>,
  onShopNameSearch?: (keyword: string) => void,
  options: EcShopDailyGridOptions = {},
): VbenFormSchema[] {
  const getShopNameAutoCompleteProps = () => ({
    allowClear: true,
    filterOption: false,
    onClear: () => onShopNameSearch?.(''),
    onFocus: () => onShopNameSearch?.(''),
    onSearch: onShopNameSearch,
    options: shopNameOptions?.value ?? [],
    placeholder: '输入关键词或选择店铺',
  });

  const schema: VbenFormSchema[] = [
    {
      fieldName: 'statDate',
      label: '统计日期',
      component: markRaw(FdmDateRangePicker),
      componentProps: { allowClear: false },
      defaultValue: getYesterdayDateRange(),
    },
  ];

  if (!options.hidePlatform) {
    schema.push({
      fieldName: 'platformCode',
      label: '平台',
      component: 'Select',
      componentProps: {
        allowClear: true,
        showSearch: true,
        optionFilterProp: 'label',
        placeholder: '全部平台',
        options: EC_PLATFORM_SUGGESTIONS,
      },
    });
  }

  schema.push({
    fieldName: 'shopName',
    label: '店铺名称',
    component: 'AutoComplete',
    componentProps: getShopNameAutoCompleteProps,
  });

  return schema;
}

function formatAmount({ cellValue }: { cellValue: unknown }) {
  if (cellValue === null || cellValue === undefined || cellValue === '')
    return '';
  const n = Number(cellValue);
  return Number.isFinite(n) ? n.toFixed(2) : String(cellValue);
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function usesGmvCalculationBase(row: Record<string, any> | undefined): boolean {
  const platformCode = String(row?.platformCode ?? row?.platform_code ?? '')
    .trim()
    .toUpperCase();
  return ['DOUYIN', 'TAOBAO', 'TMALL', 'XHS'].includes(platformCode);
}

function amountCalculationBase(row: Record<string, any> | undefined): number {
  return usesGmvCalculationBase(row)
    ? asNumber(row?.gmvAmount ?? row?.gmv_amount)
    : asNumber(row?.paidAmount ?? row?.paid_amount);
}

function formatRatioPercent(numerator: number, denominator: number): string {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return '';
  if (denominator === 0) return '';
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

function formatRoi(numerator: number, denominator: number): string {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return '';
  if (denominator === 0) return '';
  return (numerator / denominator).toFixed(2);
}

function formatDetailValue({ cellValue }: { cellValue: unknown }) {
  if (cellValue === null || cellValue === undefined || cellValue === '')
    return '';
  if (typeof cellValue === 'number') {
    return Number.isInteger(cellValue)
      ? String(cellValue)
      : cellValue.toFixed(2);
  }
  return String(cellValue);
}

const GRID_COLUMN_HELP: Record<string, string> = {
  brushOrderCount:
    '刷单单量：当前统计日录入的刷单订单数量；用于从支付订单中剔除刷单影响。',
  brushPrincipal:
    '刷单本金：当前统计日录入的刷单本金/金额；真实销售口径会从销售金额中剔除该金额。',
  marketingCost:
    '营销花费：平台推广、投放、佣金等营销费用汇总；不同平台来源字段不同，统一进入主表 marketing_cost。',
  platformCode: '平台：平台编码转中文展示。天猫数据已并入淘宝平台。',
  realNetSalesAmount:
    '真实净销 = 净销售额 = 金额计算基数 - 退款金额 - 刷单本金；淘宝/抖音/小红书金额计算基数为成交额(GMV)，其他平台为已支付金额。',
  realPaidAmount:
    '真实支付 = 金额计算基数 - 退款金额 - 刷单本金；淘宝/抖音/小红书金额计算基数为成交额(GMV)，其他平台为已支付金额。',
  realPaidOrderCount:
    '真实支付单 = 已支付订单笔数 - 刷单单量，最小值按 0 处理。',
  refundAmount:
    '退款额：平台退款金额。抖音优先使用退款时间口径；其他平台按成功退款金额或退款金额归集。',
  refundRate:
    '退款率：淘宝/抖音/小红书 = 退款金额 / 成交额(GMV) × 100%；其他平台 = 退款金额 / 已支付金额 × 100%。',
  roi: 'ROI = 真实净销 / 营销花费。营销花费为 0 时不展示。',
  shopName:
    '店铺名称：shopId 可匹配 fdm_just_shop 时由后端回填；未匹配时使用传入店铺名称。',
  statDate: '统计日：平台数据归属日期，按自然日汇总。',
};

function columnHelp(field: string) {
  const content = GRID_COLUMN_HELP[field];
  return content
    ? { content, icon: 'vxe-icon-question-circle-fill' }
    : undefined;
}

export const DETAIL_FIELD_PREFIX = '__detail__';

function detailField(column: string) {
  return `${DETAIL_FIELD_PREFIX}${column}`;
}

const PLATFORM_DETAIL_COLUMNS: Record<string, Array<[string, string]>> = {
  DOUYIN: [
    ['actual_sales_amount', '实际销售额'],
    ['brush_amount', '刷单金额'],
    ['brush_order_count', '刷单量'],
    ['ad_cost', '投放消耗'],
    ['platform_commission', '平台佣金'],
    ['talent_commission', '达人佣金'],
    ['ad_cost_ratio', '投放费比'],
    ['expense_amount', '支出金额'],
    ['transaction_amount', '成交金额'],
    ['paid_amount', '用户支付金额'],
    ['smart_coupon_amount', '智能优惠券金额'],
    ['platform_subsidy_amount', '电商平台补贴金额'],
    ['paid_order_count', '成交订单数'],
    ['buyer_count', '成交人数'],
    ['avg_order_value', '客单价'],
    ['refund_amount_payment_time', '退款金额(支付时间)'],
    ['refund_amount_refund_time', '退款金额(退款时间)'],
  ],
  JD: [
    ['visitor_count', '访客数'],
    ['page_view_count', '浏览量'],
    ['paid_amount', '支付金额'],
    ['buyer_count', '支付买家数'],
    ['payment_conversion_rate', '支付转化率'],
    ['avg_order_value', '客单价'],
    ['success_refund_amount', '成功退款金额'],
    ['marketing_cost', '营销花费'],
    ['promotion_red_packet_amount', '推广红包'],
    ['brush_principal', '刷单本金'],
    ['brush_order_count', '刷单单量'],
    ['brush_commission', '刷单佣金'],
    ['brush_total_cost_with_platform_fee', '刷单总成本（加平台扣点）'],
    ['actual_cost', '实际花费'],
    ['actual_sales_amount', '实际销售额'],
    ['cost_ratio', '花费占比'],
  ],
  PDD: [
    ['visitor_count', '访客数'],
    ['page_view_count', '浏览量'],
    ['paid_amount', '支付金额'],
    ['buyer_count', '支付买家数'],
    ['payment_conversion_rate', '支付转化率'],
    ['avg_order_value', '客单价'],
    ['success_refund_amount', '成功退款金额'],
    ['marketing_cost', '营销花费'],
    ['promotion_red_packet_amount', '推广红包金额'],
    ['brush_principal', '刷单本金'],
    ['brush_order_count', '刷单单量'],
    ['brush_commission', '刷单佣金'],
    [
      'brush_total_cost_with_platform_fee_shipping',
      '刷单总成本（平台扣点+运费）',
    ],
    ['actual_sales_amount', '实际销售额'],
    ['marketing_cost_2', '营销费用总额'],
    ['cost_ratio', '花费占比'],
    ['marketing_cost_3', '营销费用'],
  ],
  SPH: [
    ['source_time', '时间'],
    ['transaction_amount', '成交金额'],
    ['paid_order_count', '成交订单数'],
    ['buyer_count', '成交人数'],
    ['order_amount', '下单金额'],
    ['order_count', '下单订单数'],
    ['refund_amount', '退款金额'],
    ['refund_amount_2', '成交退款金额'],
    ['order_user_count', '下单人数'],
    ['avg_order_value', '客单价'],
    ['transaction_amount_2', '实际成交金额'],
  ],
  TAOBAO: [
    ['source_date', '日期'],
    ['visitor_count', '访客数'],
    ['page_view_count', '浏览量'],
    ['paid_amount', '支付金额'],
    ['order_amount', '下单金额'],
    ['buyer_count', '支付买家数'],
    ['order_user_count', '下单人数'],
    ['payment_conversion_rate', '支付转化率'],
    ['avg_order_value', '客单价'],
    ['bounce_rate', '跳失率'],
    ['avg_stay_duration', '平均停留时长'],
    ['page_view_count_2', '人均浏览量'],
    ['uv_value', 'UV价值'],
    ['product_visitor_count', '商品访客数'],
    ['product_page_view_count', '商品浏览量'],
    ['paid_product_count', '支付商品数'],
    ['paid_item_count', '支付件数'],
    ['returning_buyer_count', '支付老买家数'],
    ['returning_buyer_paid_amount', '老买家支付金额'],
    ['product_favorite_buyer_count', '商品收藏买家数'],
    ['metric_bda235c9', '加购人数'],
    ['success_refund_amount', '成功退款金额'],
    ['review_count', '评价数'],
    ['review_count_2', '正面评价数'],
    ['review_count_3', '负面评价数'],
    ['review_count_4', '有图评价数'],
    ['desc_match_score', '描述相符评分'],
    ['logistics_service_score', '物流服务评分'],
    ['service_attitude_score', '服务态度评分'],
    ['pickup_package_count', '揽收包裹数'],
    ['shipped_package_count', '发货包裹数'],
    ['delivery_package_count', '派送包裹数'],
    ['signed_package_count', '签收成功包裹数'],
    ['taobaoke_commission', '淘宝客佣金'],
    ['diamond_display_cost', '钻石展位消耗'],
    ['keyword_ad_cost', '关键词推广消耗'],
    ['audience_ad_cost', '人群推广消耗'],
    ['short_video_ad_cost', '超级短视频'],
    ['sitewide_ad_cost', '全站推广'],
    ['brush_principal', '刷单本金'],
    ['brush_order_count', '刷单单量'],
    ['brush_commission', '刷单佣金'],
    [
      'brush_total_cost_with_platform_fee_shipping',
      '刷单总成本（平台扣点+运费）',
    ],
    ['metric_46482545', '真实订单数'],
    ['metric_10e8e840', '加购率'],
    ['metric_f45d7950', '退款占比'],
    ['metric_8f7e3a1a', '好评率'],
    ['metric_302543c3', '差评率'],
    ['metric_ce0485cc', '揽收率'],
    ['marketing_cost', '营销费用总额'],
    ['cost_ratio', '花费占比'],
    ['actual_sales_amount', '实际销售额'],
    ['content_visitor_count', '内容引导访客数'],
    ['content_seed_transaction_amount', '内容引导种草成交金额'],
  ],
  XHS: [
    ['transaction_amount', '实际成交金额'],
    ['paid_order_count', '实际支付订单数'],
    ['paid_amount', '支付金额'],
    ['paid_order_count_2', '支付订单数'],
    ['paid_item_count', '支付件数'],
    ['buyer_count', '支付买家数'],
    ['visitor_count', '总访客数'],
    ['page_view_count', '总浏览量'],
    ['avg_order_value', '客单价'],
    ['product_page_view_count', '商品浏览量'],
    ['product_visitor_count', '商品访客数'],
    ['metric_e3ccf5de', '新增加购人数'],
    ['metric_0a4c5554', '新增加购件数'],
    ['wishlist_count', '新增加入心愿单人数'],
    ['pv', '商品点击率（PV）'],
    ['payment_conversion_rate_uv', '支付转化率（UV）'],
    ['payment_conversion_rate_pv', '支付转化率（PV）'],
    ['refund_amount', '退款金额'],
    ['paid_amount_2', '笔记支付金额'],
    ['paid_order_count_3', '笔记支付订单数'],
    ['payment_conversion_rate', '笔记支付转化率'],
    ['promotion_cost', '推广花费'],
    ['brush_principal', '补单本金'],
    ['brush_order_count', '补单订单量'],
    ['brush_commission', '补单佣金'],
  ],
};

function usePlatformDetailColumns(platformCode?: string) {
  const columns =
    PLATFORM_DETAIL_COLUMNS[
      String(platformCode ?? '')
        .trim()
        .toUpperCase()
    ] ?? [];
  return columns.map(([column, title]) => ({
    field: detailField(column),
    title: `明细·${title}`,
    minWidth: 120,
    align: 'right' as const,
    visible: false,
    formatter: formatDetailValue,
  }));
}

/** 列表列（核心汇总字段；详细数据默认隐藏，可在列设置中显示） */
export function useGridColumns(
  options: EcShopDailyGridOptions = {},
): VxeTableGridOptions<FdmdataEcShopDailyApi.EcShopDaily>['columns'] {
  return [
    { type: 'checkbox', width: 40, fixed: 'left' },
    {
      field: 'statDate',
      title: '统计日',
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
      visible: !options.hidePlatform,
      formatter: ({ cellValue }: { cellValue: unknown }) =>
        formatEcPlatformLabel(cellValue),
    },
    {
      field: 'shopName',
      title: '店铺名称',
      titleSuffix: columnHelp('shopName'),
      minWidth: 180,
      showOverflow: 'tooltip',
    },

    // ─── 真实口径（剔除刷单） ───────────────────────────────────────────────
    {
      field: 'realNetSalesAmount',
      title: '真实净销',
      titleSuffix: columnHelp('realNetSalesAmount'),
      minWidth: 110,
      align: 'right',
      formatter: ({ row }: any) => {
        const amountBase = amountCalculationBase(row);
        const refund = asNumber(row?.refundAmount);
        const brushPrincipal = asNumber(row?.brushPrincipal);
        return formatAmount({
          cellValue: amountBase - refund - brushPrincipal,
        });
      },
    },
    {
      field: 'realPaidAmount',
      title: '真实支付',
      titleSuffix: columnHelp('realPaidAmount'),
      minWidth: 110,
      align: 'right',
      formatter: ({ row }: any) => {
        const amountBase = amountCalculationBase(row);
        const refund = asNumber(row?.refundAmount);
        const brushPrincipal = asNumber(row?.brushPrincipal);
        return formatAmount({
          cellValue: amountBase - refund - brushPrincipal,
        });
      },
    },
    {
      field: 'refundAmount',
      title: '退款额',
      titleSuffix: columnHelp('refundAmount'),
      minWidth: 104,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'refundRate',
      title: '退款率',
      titleSuffix: columnHelp('refundRate'),
      minWidth: 96,
      align: 'right',
      formatter: ({ row }: any) =>
        formatRatioPercent(
          asNumber(row?.refundAmount),
          amountCalculationBase(row),
        ),
    },
    {
      field: 'realPaidOrderCount',
      title: '真实支付单',
      titleSuffix: columnHelp('realPaidOrderCount'),
      minWidth: 104,
      align: 'right',
      formatter: ({ row }: any) => {
        const real = row?.realPaidOrderCount;
        if (real !== undefined && real !== null && real !== '')
          return String(real);
        const paidOrder = asNumber(row?.paidOrderCount);
        const brushOrder = asNumber(row?.brushOrderCount);
        const v = Math.max(paidOrder - brushOrder, 0);
        return String(v);
      },
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
      field: 'brushOrderCount',
      title: '刷单单量',
      titleSuffix: columnHelp('brushOrderCount'),
      minWidth: 96,
      align: 'right',
    },

    // ─── 投放效率 ─────────────────────────────────────────────────────────────
    {
      field: 'marketingCost',
      title: '营销花费',
      titleSuffix: columnHelp('marketingCost'),
      minWidth: 100,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'roi',
      title: 'ROI',
      titleSuffix: columnHelp('roi'),
      minWidth: 88,
      align: 'right',
      formatter: ({ row }: any) => {
        const realNet =
          amountCalculationBase(row) -
          asNumber(row?.refundAmount) -
          asNumber(row?.brushPrincipal);
        return formatRoi(asNumber(realNet), asNumber(row?.marketingCost));
      },
    },

    ...usePlatformDetailColumns(options.platformCode),

    {
      title: '操作',
      width: 160,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ];
}
