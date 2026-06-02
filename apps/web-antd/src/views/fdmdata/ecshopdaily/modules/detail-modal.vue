<script setup lang="ts">
import type { VNode } from 'vue';

import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';

import { computed, h, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Descriptions, Divider, message, Tag, Tooltip } from 'ant-design-vue';

import {
  getEcShopDaily,
  getEcShopDailyPlatformDetail,
} from '#/api/fdmdata/ecshopdaily';

import { formatEcPlatformLabel } from '../data';

defineOptions({ name: 'EcShopDailyDetailModal' });

// openSeq 用于防止多次快速切换时旧请求覆盖新请求
let openSeq = 0;

const detail = ref<FdmdataEcShopDailyApi.EcShopDaily | null>(null);
const platformDetail =
  ref<FdmdataEcShopDailyApi.EcShopDailyPlatformDetail | null>(null);

function fmtDate(value: any) {
  if (value === null || value === undefined || value === '') return '-';
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function fmtDateTime(value: any) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function fmtNumber(value: any) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : String(value);
}

function fmtAmount(value: any, precision = 2) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(precision) : String(value);
}

function num(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function amountCalculationBase(row: any): number {
  const platformCode = String(row?.platformCode ?? row?.platform_code ?? '')
    .trim()
    .toUpperCase();
  return ['DOUYIN', 'TAOBAO', 'TMALL', 'XHS'].includes(platformCode)
    ? num(row?.gmvAmount ?? row?.gmv_amount)
    : num(row?.paidAmount ?? row?.paid_amount);
}

function netSalesAmountOf(row: any): number {
  return (
    amountCalculationBase(row) -
    num(row?.refundAmount ?? row?.refund_amount) -
    num(row?.brushPrincipal ?? row?.brush_principal)
  );
}

function realSalesAmountOf(row: any): number {
  return netSalesAmountOf(row);
}

type KvItem = {
  key: string;
  label: string | VNode;
  span?: number;
  value: string | VNode;
};

const CALC_HELP_BY_LABEL: Record<string, string> = {
  '3分钟回复率': '3分钟回复率 = 3 分钟内回复会话量 / 总会话量 × 100%。',
  '45s首响率': '45s 首响率 = 45 秒内首次响应会话量 / 总会话量 × 100%。',
  ROI: 'ROI = 真实净销售额 / 营销花费；营销花费为 0 时不展示。',
  UV价值: 'UV 价值 = 支付金额 / 访客数，或按平台原始 UV 价值口径写入。',
  人均浏览量: '人均浏览量 = 浏览量 / 访客数。',
  加购率: '加购率 = 加购人数 / 商品访客数 × 100%。',
  '商品点击-成交转化率(次数)':
    '商品点击-成交转化率 = 成交次数 / 商品点击次数 × 100%。',
  '商品点击率（PV）':
    '商品点击率（PV）= 商品浏览量 / 总浏览量 × 100%，平台原始口径优先。',
  '回复率（考核）':
    '回复率 = 已回复会话量 / 总会话量 × 100%，以平台考核口径为准。',
  好评率: '好评率 = 好评数 / 评价数 × 100%。',
  客服好评率: '客服好评率 = 客服好评数 / 客服评价数 × 100%。',
  客服差评率: '客服差评率 = 客服差评数 / 客服评价数 × 100%。',
  客单价: '客单价 = 支付金额 / 支付买家数；平台明细有原始客单价时按平台口径写入。',
  实际成交金额:
    '实际成交金额 = 成交金额 - 退款金额 - 刷单本金；如果平台已提供实际成交金额，则优先使用平台原始值。',
  实际销售额:
    '实际销售额 = 金额计算基数 - 退款金额 - 刷单本金；淘宝/抖音/小红书金额计算基数为成交额(GMV)，其他平台为已支付金额。',
  真实净销售额:
    '真实净销售额 = 净销售额 = 金额计算基数 - 退款金额 - 刷单本金；淘宝/抖音/小红书金额计算基数为成交额(GMV)，其他平台为已支付金额。',
  真实支付订单数:
    '真实支付订单数 = 已支付订单笔数 - 刷单单量，结果小于 0 时按 0 处理。',
  真实支付金额:
    '真实支付金额 = 金额计算基数 - 退款金额 - 刷单本金；淘宝/抖音/小红书金额计算基数为成交额(GMV)，其他平台为已支付金额。',
  真实订单数:
    '真实订单数 = 已支付订单笔数 - 刷单单量，结果小于 0 时按 0 处理。',
  真实成交买家数:
    '真实成交买家数当前取成交买家数；因暂无刷单买家维度，暂不单独扣减刷单买家。',
  笔记支付转化率: '笔记支付转化率 = 笔记支付订单数 / 笔记商品点击次数 × 100%。',
  老顾客销售占比: '老顾客销售占比 = 老买家支付金额 / 支付金额 × 100%。',
  花费占比: '花费占比 = 营销花费 / 实际销售额 × 100%。',
  营销费用总额:
    '营销费用总额 = 平台推广、投放、佣金等营销费用合计；不同平台来源字段不同。',
  退款占比: '退款占比：淘宝/抖音/小红书 = 退款金额 / 成交额(GMV) × 100%；其他平台 = 退款金额 / 支付金额 × 100%。',
  退款率: '退款率：淘宝/抖音/小红书 = 退款金额 / 成交额(GMV) × 100%；其他平台 = 退款金额 / 支付金额 × 100%。',
  '退款率(支付时间)':
    '退款率(支付时间) = 退款金额(支付时间) / 用户支付金额 × 100%。',
  退款订单占比: '退款订单占比 = 退款订单数 / 支付订单数 × 100%。',
  评价率: '评价率 = 评价数 / 支付订单数 × 100%，以平台原始口径为准。',
  询购转化率: '询购转化率 = 询购转化订单数 / 会话量 × 100%。',
  询购转化金额占比: '询购转化金额占比 = 询购转化金额 / 支付金额 × 100%。',
  差评率: '差评率 = 差评数 / 评价数 × 100%。',
  投放费比: '投放费比 = 投放消耗 / 实际销售额 × 100%。',
  收藏率: '收藏率 = 商品收藏买家数 / 商品访客数 × 100%。',
  揽收率: '揽收率 = 揽收包裹数 / 发货包裹数 × 100%。',
  支出金额: '支出金额 = 投放消耗 + 平台佣金 + 达人佣金等费用合计；以平台明细字段口径为准。',
  支出占比: '支出占比 = 支出金额 / 实际销售额 × 100%。',
  净销售额: '净销售额：淘宝/抖音/小红书 = 成交额(GMV) - 退款金额 - 刷单本金；其他平台 = 已支付金额 - 退款金额 - 刷单本金。',
  '刷单总成本（加平台扣点）':
    '刷单总成本 = 刷单本金 + 刷单佣金 + 平台扣点等成本。',
  '刷单总成本（平台扣点+运费）':
    '刷单总成本 = 刷单本金 + 刷单佣金 + 平台扣点 + 运费等成本。',
  '刷单总成本（+平台扣点+运费）':
    '刷单总成本 = 刷单本金 + 刷单佣金 + 平台扣点 + 运费等成本。',
};

const CALC_HELP_BY_KEY: Record<string, string> = {
  actual_sales_amount: CALC_HELP_BY_LABEL['实际销售额'],
  ad_cost_ratio: CALC_HELP_BY_LABEL['投放费比'],
  avg_order_value: CALC_HELP_BY_LABEL['客单价'],
  cost_ratio: CALC_HELP_BY_LABEL['花费占比'],
  metric_10e8e840: CALC_HELP_BY_LABEL['加购率'],
  metric_240d5d4b: CALC_HELP_BY_LABEL['收藏率'],
  metric_302543c3: CALC_HELP_BY_LABEL['差评率'],
  metric_317b0133: CALC_HELP_BY_LABEL['询购转化率'],
  metric_357f496b: CALC_HELP_BY_LABEL['评价率'],
  metric_46482545: CALC_HELP_BY_LABEL['真实订单数'],
  metric_8f7e3a1a: CALC_HELP_BY_LABEL['好评率'],
  metric_92eeacec: CALC_HELP_BY_LABEL['退款订单占比'],
  metric_a328447d: CALC_HELP_BY_LABEL['老顾客销售占比'],
  metric_a7b3e5e0: CALC_HELP_BY_LABEL['退款率(支付时间)'],
  metric_cfa2bc7f: CALC_HELP_BY_LABEL['询购转化金额占比'],
  metric_ce0485cc: CALC_HELP_BY_LABEL['揽收率'],
  metric_e5fd943a: CALC_HELP_BY_LABEL['回复率（考核）'],
  metric_f45d7950: CALC_HELP_BY_LABEL['退款占比'],
  payment_conversion_rate:
    '支付转化率 = 支付买家数 / 访客数 × 100%；平台明细有原始转化率时按平台口径写入。',
  payment_conversion_rate_pv:
    '支付转化率（PV）= 支付订单数 / 商品浏览量 × 100%。',
  payment_conversion_rate_uv:
    '支付转化率（UV）= 支付买家数 / 商品访客数 × 100%。',
  pv: CALC_HELP_BY_LABEL['商品点击率（PV）'],
  real_net_sales_amount: CALC_HELP_BY_LABEL['真实净销售额'],
  real_paid_amount: CALC_HELP_BY_LABEL['真实支付金额'],
  real_paid_order_count: CALC_HELP_BY_LABEL['真实支付订单数'],
  refund_rate: CALC_HELP_BY_LABEL['退款率'],
  self: CALC_HELP_BY_LABEL['退款率(支付时间)'],
  self_2: CALC_HELP_BY_LABEL['商品点击-成交转化率(次数)'],
  self_3: CALC_HELP_BY_LABEL['商品点击-成交转化率(次数)'],
  talent_2: CALC_HELP_BY_LABEL['退款率(支付时间)'],
  talent_3: CALC_HELP_BY_LABEL['商品点击-成交转化率(次数)'],
  talent_4: CALC_HELP_BY_LABEL['商品点击-成交转化率(次数)'],
  transaction_amount_2: CALC_HELP_BY_LABEL['实际成交金额'],
  uv_value: CALC_HELP_BY_LABEL['UV价值'],
};

function calcHelp(labelOrKey: string) {
  const key = labelOrKey.trim();
  if (CALC_HELP_BY_LABEL[key]) return CALC_HELP_BY_LABEL[key];
  const snakeKey = key.replaceAll('-', '_').toLowerCase();
  if (CALC_HELP_BY_KEY[snakeKey]) return CALC_HELP_BY_KEY[snakeKey];
  if (key.includes('支付转化率')) {
    return '支付转化率 = 支付买家数 / 访客数 × 100%；平台明细有原始转化率时按平台口径写入。';
  }
  if (key.includes('退款率')) {
    return CALC_HELP_BY_LABEL['退款率'];
  }
  if (key.includes('费比')) {
    return '费比 = 对应费用 / 实际销售额 × 100%。';
  }
  if (key.includes('占比')) {
    return '占比 = 对应分子指标 / 对应分母指标 × 100%；平台明细字段以平台原始口径为准。';
  }
  if (key.includes('转化率')) {
    return '转化率 = 转化完成数 / 转化前置指标 × 100%；平台明细字段以平台原始口径为准。';
  }
  return undefined;
}

function labelWithHelp(label: string, help?: string) {
  if (!help) return label;
  return h('span', { class: 'detail-label-with-help' }, [
    h('span', label),
    h(
      Tooltip,
      { title: help },
      {
        default: () =>
          h(
            'span',
            {
              class: 'detail-calc-help',
              onClick: (event: MouseEvent) => event.stopPropagation(),
            },
            '?',
          ),
      },
    ),
  ]);
}

function item(label: string, value: any, span?: number, help?: string): KvItem {
  return {
    key: label,
    label: labelWithHelp(label, help ?? calcHelp(label)),
    value,
    span,
  };
}

function isVNodeLike(v: unknown): v is VNode {
  return !!v && typeof v === 'object' && 'type' in (v as any);
}

const basicItems = computed(() => {
  const d = detail.value;
  if (!d) return [];
  return [
    item('统计日期', fmtDate((d as any).statDate)),
    item('平台', formatEcPlatformLabel(d.platformCode) || '-'),
    item('店铺ID', d.shopId ?? '-'),
    item('店铺名称', d.shopName ?? '-'),
    item('币种', d.currency ?? '-'),
  ];
});

const orderAndMoneyItems = computed(() => {
  const d = detail.value as any;
  if (!d) return [];
  return [
    item('订单笔数', fmtNumber(d.orderCount)),
    item('已支付订单笔数', fmtNumber(d.paidOrderCount)),
    item('退款完成订单笔数', fmtNumber(d.refundOrderCount)),
    item('成交额(GMV)', fmtAmount(d.gmvAmount)),
    item('已支付金额', fmtAmount(d.paidAmount)),
    item('退款金额', fmtAmount(d.refundAmount)),
    item('净销售额', fmtAmount(netSalesAmountOf(d))),
  ];
});

const brushAndRealItems = computed(() => {
  const d = detail.value as any;
  if (!d) return [];
  return [
    item('刷单单量', fmtNumber(d.brushOrderCount)),
    item('刷单本金', fmtAmount(d.brushPrincipal)),
    item('真实支付订单数', fmtNumber(d.realPaidOrderCount)),
    item('真实支付金额', fmtAmount(realSalesAmountOf(d))),
    item('真实成交买家数', fmtNumber(d.realBuyerCount)),
    item('真实净销售额', fmtAmount(realSalesAmountOf(d))),
  ];
});

const marketingItems = computed(() => {
  const d = detail.value as any;
  if (!d) return [];
  return [item('营销花费', fmtAmount(d.marketingCost))];
});

const COMMON_DETAIL_KEYS = new Set([
  'create_time',
  'creator',
  'daily_id',
  'deleted',
  'id',
  'platform_code',
  'raw_payload',
  'shop_id',
  'shop_name',
  'source_row_no',
  'source_sheet',
  'stat_date',
  'tenant_id',
  'update_time',
  'updater',
]);

function normalizePlatformValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseRawPayload(raw: unknown): null | Record<string, unknown> {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const platformDetailItems = computed<KvItem[]>(() => {
  const row = platformDetail.value?.detail ?? {};
  const raw = parseRawPayload(row.raw_payload);
  if (raw) {
    return Object.entries(raw)
      .filter(
        ([, value]) => value !== null && value !== undefined && value !== '',
      )
      .map(([label, value]) => item(label, normalizePlatformValue(value)));
  }
  return Object.entries(row)
    .filter(
      ([key, value]) =>
        !COMMON_DETAIL_KEYS.has(key) &&
        value !== null &&
        value !== undefined &&
        value !== '',
    )
    .map(([key, value]) => item(key, normalizePlatformValue(value)));
});

const remarkItems = computed(() => {
  const d = detail.value as any;
  if (!d) return [];
  return [item('备注', d.remark || '-', 3)];
});

const auditItems = computed(() => {
  const d = detail.value as any;
  if (!d) return [];
  return [
    item('创建时间', fmtDateTime(d.createTime)),
    item('更新时间', fmtDateTime(d.updateTime)),
    item('创建者', d.creator || '-'),
    item('更新者', d.updater || '-'),
    item(
      '状态',
      d.deleted === 1
        ? h(Tag, { color: 'red' }, () => '已删除')
        : h(Tag, { color: 'green' }, () => '正常'),
    ),
  ];
});

const [Modal, modalApi] = useVbenModal({
  footer: false,
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      modalApi.unlock();
      detail.value = null;
      platformDetail.value = null;
      return;
    }
    const mySeq = ++openSeq;
    const row = modalApi.getData<FdmdataEcShopDailyApi.EcShopDaily>();
    if (!row?.id) {
      message.error('缺少记录ID，无法查看详情');
      await modalApi.close();
      return;
    }
    modalApi.lock();
    try {
      const [d, pd] = await Promise.all([
        getEcShopDaily(row.id),
        getEcShopDailyPlatformDetail(row.id),
      ]);
      if (mySeq !== openSeq) return;
      if (!d) {
        message.error('记录不存在或已被删除');
        await modalApi.close();
        return;
      }
      detail.value = d;
      platformDetail.value = pd;
    } catch (error) {
      if (mySeq === openSeq) {
        console.error('Load ecShopDaily detail failed', error);
        message.error('加载详情失败，请稍后再试');
        await modalApi.close();
      }
    } finally {
      if (mySeq === openSeq) modalApi.unlock();
    }
  },
});

const title = computed(() => {
  const d = detail.value as any;
  if (!d) return '店铺日汇总详情';
  return `店铺日汇总详情｜${fmtDate(d.statDate)}｜${formatEcPlatformLabel(d.platformCode)}｜${d.shopName ?? ''}`;
});
</script>

<template>
  <Modal :title="title" class="w-[980px]">
    <div
      class="ec-shop-daily-detail-body overflow-y-auto pr-1"
      style="max-height: 72vh"
    >
      <Descriptions :column="2" bordered size="small">
        <Descriptions.Item
          v-for="it in basicItems"
          :key="it.key"
          :label="it.label"
          :span="it.span"
        >
          {{ it.value }}
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left" plain>订单与金额</Divider>
      <Descriptions :column="3" bordered size="small">
        <Descriptions.Item
          v-for="it in orderAndMoneyItems"
          :key="it.key"
          :label="it.label"
          :span="it.span"
        >
          {{ it.value }}
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left" plain>刷单与真实口径（剔除刷单）</Divider>
      <Descriptions :column="3" bordered size="small">
        <Descriptions.Item
          v-for="it in brushAndRealItems"
          :key="it.key"
          :label="it.label"
          :span="it.span"
        >
          {{ it.value }}
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left" plain>营销</Divider>
      <Descriptions :column="3" bordered size="small">
        <Descriptions.Item
          v-for="it in marketingItems"
          :key="it.key"
          :label="it.label"
          :span="it.span"
        >
          {{ it.value }}
        </Descriptions.Item>
      </Descriptions>

      <template v-if="platformDetailItems.length > 0">
        <Divider orientation="left" plain>平台原始指标</Divider>
        <Descriptions :column="3" bordered size="small">
          <Descriptions.Item
            v-for="it in platformDetailItems"
            :key="it.key"
            :label="it.label"
            :span="it.span"
          >
            {{ it.value }}
          </Descriptions.Item>
        </Descriptions>
      </template>

      <Divider orientation="left" plain>备注</Divider>
      <Descriptions :column="1" bordered size="small">
        <Descriptions.Item
          v-for="it in remarkItems"
          :key="it.key"
          :label="it.label"
          :span="it.span"
        >
          {{ it.value }}
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left" plain>审计信息</Divider>
      <Descriptions :column="3" bordered size="small">
        <Descriptions.Item
          v-for="it in auditItems"
          :key="it.key"
          :label="it.label"
          :span="it.span"
        >
          <component :is="it.value" v-if="isVNodeLike(it.value)" />
          <template v-else>{{ it.value }}</template>
        </Descriptions.Item>
      </Descriptions>
    </div>
  </Modal>
</template>

<style scoped>
.ec-shop-daily-detail-body :deep(.ant-descriptions-item-label) {
  white-space: nowrap;
}

.detail-label-with-help {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.detail-calc-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  font-size: 11px;
  line-height: 1;
  color: var(--ant-color-text-tertiary, #8c8c8c);
  cursor: help;
  border: 1px solid var(--ant-color-border, #d9d9d9);
  border-radius: 50%;
}
</style>
