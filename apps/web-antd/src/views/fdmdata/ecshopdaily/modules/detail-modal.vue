<script setup lang="ts">
import type { VNode } from 'vue';

import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';

import { computed, h, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Descriptions, Divider, message, Tag } from 'ant-design-vue';

import { getEcShopDaily } from '#/api/fdmdata/ecshopdaily';

defineOptions({ name: 'EcShopDailyDetailModal' });

// openSeq 用于防止多次快速切换时旧请求覆盖新请求
let openSeq = 0;

const detail = ref<FdmdataEcShopDailyApi.EcShopDaily | null>(null);

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

function fmtPercent(value: any) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : String(value);
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
    item('平台', d.platformCode ?? '-'),
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
    item('真实客单价', fmtAmount(d.realAvgOrderValue)),
    item('真实支付转化率', fmtPercent(d.realPaymentConversionRate)),
    item('真实UV价值', fmtAmount(d.realUvValue, 4)),
  ];
});

const trafficItems = computed(() => {
  const d = detail.value as any;
  if (!d) return [];
  return [
    item('访客数(UV)', fmtNumber(d.visitorCount)),
    item('浏览量(PV)', fmtNumber(d.pageViewCount)),
    item('成交买家数', fmtNumber(d.buyerCount)),
    item('支付转化率', fmtPercent(d.paymentConversionRate)),
    item('客单价', fmtAmount(d.avgOrderValue)),
    item('跳失率', fmtPercent(d.bounceRate)),
    item('平均停留时长(秒)', fmtNumber(d.avgStayDurationSec)),
    item('人均浏览量', fmtAmount(d.avgPageViewPerVisitor)),
    item('UV价值', fmtAmount(d.uvValue, 4)),
  ];
});

const productAndBuyerItems = computed(() => {
  const d = detail.value as any;
  if (!d) return [];
  return [
    item('商品访客数', fmtNumber(d.productVisitorCount)),
    item('商品浏览量', fmtNumber(d.productPageViewCount)),
    item('支付商品数', fmtNumber(d.paidProductCount)),
    item('支付老买家数', fmtNumber(d.returningBuyerCount)),
    item('老买家支付金额', fmtAmount(d.returningBuyerPaidAmount)),
    item('商品收藏买家数', fmtNumber(d.productFavoriteBuyerCount)),
    item('加购人数', fmtNumber(d.cartAddUserCount)),
  ];
});

const reviewAndServiceItems = computed(() => {
  const d = detail.value as any;
  if (!d) return [];
  return [
    item('评价数', fmtNumber(d.reviewCount)),
    item('正面评价数', fmtNumber(d.positiveReviewCount)),
    item('负面评价数', fmtNumber(d.negativeReviewCount)),
    item('有图评价数', fmtNumber(d.reviewWithImageCount)),
    item('描述相符评分', fmtAmount(d.descMatchScore, 2)),
    item('物流服务评分', fmtAmount(d.logisticsServiceScore, 2)),
    item('服务态度评分', fmtAmount(d.serviceAttitudeScore, 2)),
  ];
});

const logisticsItems = computed(() => {
  const d = detail.value as any;
  if (!d) return [];
  return [
    item('揽收包裹数', fmtNumber(d.pickupPackageCount)),
    item('发货包裹数', fmtNumber(d.shippedPackageCount)),
    item('派送包裹数', fmtNumber(d.deliveryPackageCount)),
    item('签收成功包裹数', fmtNumber(d.signedPackageCount)),
  ];
});

const marketingItems = computed(() => {
  const d = detail.value as any;
  if (!d) return [];
  return [
    item('营销花费', fmtAmount(d.marketingCost)),
    item('淘宝客佣金', fmtAmount(d.taobaokeCommission)),
    item('钻石展位消耗', fmtAmount(d.diamondDisplayCost)),
    item('直通车消耗', fmtAmount(d.trainAdCost)),
  ];
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
      const d = await getEcShopDaily(row.id);
      if (mySeq !== openSeq) return;
      if (!d) {
        message.error('记录不存在或已被删除');
        await modalApi.close();
        return;
      }
      detail.value = d;
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
  return `店铺日汇总详情｜${fmtDate(d.statDate)}｜${d.platformCode ?? ''}｜${d.shopName ?? ''}`;
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

      <Divider orientation="left" plain>流量与转化</Divider>
      <Descriptions :column="3" bordered size="small">
        <Descriptions.Item
          v-for="it in trafficItems"
          :key="it.key"
          :label="it.label"
          :span="it.span"
        >
          {{ it.value }}
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left" plain>商品与买家行为</Divider>
      <Descriptions :column="3" bordered size="small">
        <Descriptions.Item
          v-for="it in productAndBuyerItems"
          :key="it.key"
          :label="it.label"
          :span="it.span"
        >
          {{ it.value }}
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left" plain>评价与服务质量</Divider>
      <Descriptions :column="3" bordered size="small">
        <Descriptions.Item
          v-for="it in reviewAndServiceItems"
          :key="it.key"
          :label="it.label"
          :span="it.span"
        >
          {{ it.value }}
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left" plain>物流包裹</Divider>
      <Descriptions :column="3" bordered size="small">
        <Descriptions.Item
          v-for="it in logisticsItems"
          :key="it.key"
          :label="it.label"
          :span="it.span"
        >
          {{ it.value }}
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left" plain>营销投放</Divider>
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
