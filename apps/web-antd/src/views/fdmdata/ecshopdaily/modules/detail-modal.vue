<script setup lang="ts">
import type { VNode } from 'vue';

import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';

import { computed, h, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Descriptions, Divider, message, Tag } from 'ant-design-vue';

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

type KvItem = {
  key: string;
  label: string;
  span?: number;
  value: string | VNode;
};

function item(label: string, value: any, span?: number): KvItem {
  return { key: label, label, value, span };
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
    item('净销售额', fmtAmount(d.netSalesAmount)),
  ];
});

const brushAndRealItems = computed(() => {
  const d = detail.value as any;
  if (!d) return [];
  return [
    item('刷单单量', fmtNumber(d.brushOrderCount)),
    item('刷单本金', fmtAmount(d.brushPrincipal)),
    item('真实支付订单数', fmtNumber(d.realPaidOrderCount)),
    item('真实支付金额', fmtAmount(d.realPaidAmount)),
    item('真实成交买家数', fmtNumber(d.realBuyerCount)),
    item('真实净销售额', fmtAmount(d.realNetSalesAmount)),
  ];
});

const marketingItems = computed(() => {
  const d = detail.value as any;
  if (!d) return [];
  return [item('营销花费', fmtAmount(d.marketingCost))];
});

const COMMON_DETAIL_KEYS = new Set([
  'id',
  'tenant_id',
  'daily_id',
  'stat_date',
  'platform_code',
  'shop_id',
  'shop_name',
  'source_sheet',
  'source_row_no',
  'raw_payload',
  'create_time',
  'update_time',
  'creator',
  'updater',
  'deleted',
]);

function normalizePlatformValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseRawPayload(raw: unknown): Record<string, unknown> | null {
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
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
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
</style>
