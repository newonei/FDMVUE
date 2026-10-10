<script lang="ts" setup>
import type { FdmgongchangDashboardApi as Api } from '#/api/fdmgongchang/dashboard';

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { useFullscreen } from '@vueuse/core';
import { Button, Empty, Progress, Result, Segmented, Spin, Tag } from 'ant-design-vue';
import dayjs from 'dayjs';

import { getFactoryDashboard } from '#/api/fdmgongchang/dashboard';

import FactorySwitch from '../shared/factory-switch.vue';
import { useFactory } from '../shared/use-factory';
import KpiCard from './modules/kpi-card.vue';
import TrendChart from './modules/trend-chart.vue';
import { big, change, dateText, daysLeft, money, n, pct, PROCESS_COLORS, yieldRate } from './shared';

/**
 * 工厂部门 · 工厂看板：工厂管理员一屏看清这段时间的产出、良品率、排单达成、订单交付、库存与人员。
 * 每个指标都和前一段同样长的时间对比；「大屏」全屏显示并每 5 分钟自动刷新，适合挂在车间办公室。
 */
defineOptions({ name: 'FdmGongchangDashboard' });

const AUTO_REFRESH_MS = 5 * 60 * 1000;
const RANGES: Array<{ label: string; value: Api.Range }> = [
  { label: '今天', value: 'today' },
  { label: '近 7 天', value: '7d' },
  { label: '近 30 天', value: '30d' },
  { label: '本月', value: 'month' },
];

const router = useRouter();
const factory = useFactory();
const range = ref<Api.Range>('7d');
const data = ref<Api.Dashboard>();
const loading = ref(false);
const loadError = ref(false);
const noFactory = ref(false);
const root = ref<HTMLElement>();
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(root);

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    if (!factory.loaded.value) await factory.load();
    if (factory.factoryId.value === null) {
      noFactory.value = true;
      return;
    }
    data.value = await getFactoryDashboard(range.value);
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  load();
  timer = setInterval(() => {
    if (!loading.value) load();
  }, AUTO_REFRESH_MS);
});
onBeforeUnmount(() => clearInterval(timer));

async function switchFactory(id: number) {
  if (id === factory.factoryId.value) return;
  factory.select(id);
  data.value = undefined;
  await load();
}

function changeRange(value: number | string) {
  range.value = value as Api.Range;
  load();
}

const go = (path: string) => router.push(path);

const kpi = computed(() => data.value?.kpi);
const yieldNow = computed(() => (kpi.value ? yieldRate(kpi.value.good, kpi.value.defect) : null));
const yieldPrev = computed(() => (kpi.value ? yieldRate(kpi.value.goodPrev, kpi.value.defectPrev) : null));
const planRate = computed(() => (kpi.value?.planRate === null || kpi.value?.planRate === undefined ? null : n(kpi.value.planRate)));
const planRatePrev = computed(() =>
  kpi.value?.planRatePrev === null || kpi.value?.planRatePrev === undefined ? null : n(kpi.value.planRatePrev),
);
const rangeText = computed(() => {
  if (!data.value) return '';
  const from = dateText(data.value.from);
  const to = dateText(data.value.to);
  return from === to ? from : `${from} ~ ${to}`;
});
const updatedText = computed(() => (data.value ? dayjs(data.value.generatedAt).format('HH:mm') : ''));

/** 工序表现：按产出顺序；良品率条越短越需要关注。 */
const processRows = computed(() =>
  (data.value?.processes ?? []).map((p) => ({
    ...p,
    change: change(n(p.good), n(p.goodPrev)),
    rate: yieldRate(p.good, p.defect),
  })),
);

const orders = computed(() =>
  (data.value?.orders ?? []).map((o) => {
    const qty = n(o.quantity);
    const done = n(o.completed);
    const left = daysLeft(o.dueDate);
    let tone: 'danger' | 'default' | 'warning' = 'default';
    if (left !== null && left < 0) tone = 'danger';
    else if (left !== null && left <= 2) tone = 'warning';
    return {
      ...o,
      left,
      percent: qty > 0 ? Math.min(100, Math.round((done / qty) * 100)) : 0,
      tone,
    };
  }),
);

const topMax = computed(() => Math.max(1, ...(data.value?.people.top ?? []).map((t) => n(t.amount))));
const stockMax = computed(() => Math.max(1, ...(data.value?.stocks ?? []).map((s) => n(s.quantity))));

const alerts = computed(() => {
  const d = data.value;
  if (!d) return [];
  const list: Array<{ action: string; detail: string; path: string; title: string; tone: 'danger' | 'warning' }> = [];
  if (d.kpi.overdueOrders > 0) {
    list.push({ action: '去工厂下单', detail: '交期已过、还没做完', path: '/gongchang/production-order', title: `${d.kpi.overdueOrders} 张订单已逾期`, tone: 'danger' });
  }
  if (d.kpi.pendingOrders > 0) {
    list.push({ action: '去接单', detail: '内部部门下给本厂、还没接单', path: '/gongchang/production-order', title: `${d.kpi.pendingOrders} 张工厂订单待接单`, tone: 'warning' });
  }
  for (const s of d.today.shortages) {
    list.push({ action: '去 AI 排单', detail: `明天排了 ${big(s.planned)}${s.unit}，${s.sourceLabel}只有 ${big(s.available)}${s.unit}`, path: '/gongchang/schedule', title: `${s.label}明天可能缺料`, tone: 'danger' });
  }
  for (const o of d.today.staleOrders.slice(0, 3)) {
    list.push({ action: '去工序库存', detail: `${o.orderNo} · 已领 ${big(o.inputQuantity)}${o.unit}`, path: '/gongchang/stage-stock', title: `${o.operatorName ?? ''} 领料超过 8 小时没报数量`, tone: 'warning' });
  }
  if (d.kpi.pendingRecords > 0) {
    list.push({ action: '去确认', detail: '确认后才能月底结算', path: '/gongchang/wage', title: `${d.kpi.pendingRecords} 条报工待确认`, tone: 'warning' });
  }
  if (d.people.unassigned > 0) {
    list.push({ action: '去人员岗位', detail: '没分岗位的人在手机上看不到要做的活', path: '/gongchang/worker', title: `${d.people.unassigned} 人还没分配岗位`, tone: 'warning' });
  }
  return list;
});
</script>

<template>
  <Page>
    <div ref="root" class="flex flex-col gap-4" :class="[isFullscreen ? 'h-screen overflow-auto bg-background p-6' : '']">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h1 class="m-0 text-xl font-semibold tracking-tight">工厂看板</h1>
            <FactorySwitch
              v-if="factory.factories.value.length > 0"
              :factories="factory.factories.value"
              :value="factory.factoryId.value"
              @change="switchFactory"
            />
          </div>
          <p class="m-0 mt-1 text-sm text-muted-foreground">
            {{ rangeText }}<template v-if="updatedText"> · {{ updatedText }} 更新，每 5 分钟自动刷新</template>
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Segmented :options="RANGES" :value="range" @change="changeRange" />
          <Button :loading="loading" @click="load">刷新</Button>
          <Button @click="toggleFullscreen">{{ isFullscreen ? '退出大屏' : '大屏' }}</Button>
        </div>
      </header>

      <Result v-if="noFactory" status="info" title="你的账号还不属于任何工厂">
        <template #subTitle>请在钉钉里把你调到所在工厂的部门，或联系管理员分配「查看全部工厂」权限。</template>
      </Result>
      <Result v-else-if="loadError && !data" status="warning" title="看板没有加载出来">
        <template #subTitle>可能是网络问题，或者还没有分配「工厂看板」的查看权限。</template>
        <template #extra><Button type="primary" @click="load">重新加载</Button></template>
      </Result>

      <Spin v-else :spinning="loading && !data">
        <div v-if="data && kpi" class="flex flex-col gap-4">
          <!-- 关键指标 -->
          <section class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard :change="change(n(kpi.packedGood), n(kpi.packedGoodPrev))" :unit="kpi.packedUnit" :value="big(kpi.packedGood)" label="成品产出" hint="包装良品" @open="go('/gongchang/stage-stock')" />
            <KpiCard :change="change(yieldNow, yieldPrev)" :value="pct(yieldNow)" label="良品率" :hint="`残次 ${big(kpi.defect)}`" @open="go('/gongchang/stage-stock')" />
            <KpiCard :change="change(planRate, planRatePrev)" :hint="kpi.planTaskCount > 0 ? `${kpi.planTaskCount} 个排单任务` : '这段时间没有下发排单'" :value="pct(planRate)" label="排单达成率" @open="go('/gongchang/schedule')" />
            <KpiCard :hint="kpi.staleCount > 0 ? `${kpi.staleCount} 张超 8 小时没报` : '都在正常推进'" :tone="kpi.staleCount > 0 ? 'warning' : 'default'" :value="String(kpi.wipCount)" label="在制工序单" unit="张" @open="go('/gongchang/stage-stock')" />
            <KpiCard :hint="kpi.overdueOrders > 0 ? `${kpi.overdueOrders} 张已逾期` : kpi.pendingOrders > 0 ? `${kpi.pendingOrders} 张待接单` : '没有逾期'" :tone="kpi.overdueOrders > 0 ? 'danger' : 'default'" :value="String(kpi.openOrders)" label="待交付订单" unit="张" @open="go('/gongchang/production-order')" />
            <KpiCard :change="change(n(kpi.wageAmount), n(kpi.wageAmountPrev))" :hint="kpi.pendingRecords > 0 ? `${kpi.pendingRecords} 条待确认` : '已全部确认'" :tone="kpi.pendingRecords > 0 ? 'warning' : 'default'" :value="money(kpi.wageAmount)" label="报工工资" @open="go('/gongchang/wage')" />
          </section>

          <!-- 趋势 + 工序表现 -->
          <section class="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div class="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm xl:col-span-2">
              <div class="flex items-baseline justify-between">
                <h2 class="m-0 text-base font-semibold">产出趋势</h2>
                <span class="text-xs text-muted-foreground">柱：各工序良品 · 虚线：残次率</span>
              </div>
              <TrendChart :from="dateText(data.from)" :processes="data.processes" :to="dateText(data.to)" :trend="data.trend" />
            </div>
            <div class="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 class="m-0 text-base font-semibold">工序表现</h2>
              <div v-for="p in processRows" :key="p.process" class="flex flex-col gap-1">
                <div class="flex items-baseline justify-between gap-2 text-sm">
                  <span class="flex items-center gap-2">
                    <span :style="{ background: PROCESS_COLORS[p.process] ?? '#8A9893' }" class="size-2.5 rounded-sm"></span>
                    {{ p.label }}
                  </span>
                  <span class="tabular-nums">
                    <b>{{ big(p.good) }}</b><span class="text-xs text-muted-foreground"> {{ p.unit }}</span>
                    <span v-if="p.change !== null" :class="p.change >= 0 ? 'text-success' : 'text-destructive'" class="ml-1 text-xs">{{ p.change >= 0 ? '↑' : '↓' }}{{ pct(Math.abs(p.change)) }}</span>
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div :class="p.rate !== null && p.rate < 0.97 ? 'bg-warning' : 'bg-primary'" :style="{ width: `${(p.rate ?? 0) * 100}%` }" class="h-full rounded-full"></div>
                  </div>
                  <span class="w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums">良品率 {{ pct(p.rate) }}</span>
                </div>
                <span class="text-xs text-muted-foreground">在制 {{ p.wip }} 张单 · 库存 {{ big(p.stock) }} {{ p.unit }}</span>
              </div>
              <Empty v-if="processRows.length === 0" description="本厂还没有启用工序" />
            </div>
          </section>

          <!-- 订单交付 + 库存 + 人员 -->
          <section class="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div class="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm xl:col-span-2">
              <div class="flex items-baseline justify-between">
                <h2 class="m-0 text-base font-semibold">订单交付</h2>
                <button class="text-xs text-primary hover:underline" type="button" @click="go('/gongchang/production-order')">全部订单</button>
              </div>
              <Empty v-if="orders.length === 0" description="没有待交付的订单" />
              <ul v-else class="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2">
                <li
                  v-for="o in orders.slice(0, 10)"
                  :key="`${o.type}-${o.orderNo}-${o.product}`"
                  class="flex flex-col gap-1.5 rounded-lg border px-3 py-2" :class="[o.tone === 'danger' ? 'border-destructive/40 bg-destructive/5' : 'border-border']"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="flex min-w-0 items-center gap-2">
                      <Tag :color="o.type === 'FACTORY' ? 'blue' : 'purple'" class="m-0 shrink-0">{{ o.type === 'FACTORY' ? '工厂订单' : '合同' }}</Tag>
                      <span class="truncate text-sm font-medium">{{ o.orderNo }}</span>
                    </span>
                    <span :class="o.tone === 'danger' ? 'text-destructive' : o.tone === 'warning' ? 'text-warning' : 'text-muted-foreground'" class="shrink-0 text-xs font-medium">
                      <template v-if="o.left === null">没有交期</template>
                      <template v-else-if="o.left < 0">逾期 {{ -o.left }} 天</template>
                      <template v-else-if="o.left === 0">今天交</template>
                      <template v-else>{{ o.left }} 天后交</template>
                    </span>
                  </div>
                  <span class="truncate text-xs text-muted-foreground">{{ o.party }} · {{ o.product }}</span>
                  <div class="flex items-center gap-2">
                    <Progress :percent="o.percent" :show-info="false" :status="o.tone === 'danger' ? 'exception' : 'normal'" class="m-0 flex-1" size="small" />
                    <span class="shrink-0 text-xs tabular-nums">{{ big(o.completed) }} / {{ big(o.quantity) }}{{ o.unit ?? '' }}</span>
                  </div>
                  <span v-if="o.status === 'SUBMITTED'" class="text-xs text-warning">{{ o.statusLabel }}</span>
                </li>
              </ul>
            </div>

            <div class="flex min-w-0 flex-col gap-4">
              <div class="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
                <h2 class="m-0 text-base font-semibold">人员</h2>
                <div class="grid grid-cols-3 gap-2 text-center">
                  <div class="rounded-lg bg-muted/50 py-2"><div class="text-xl font-bold tabular-nums">{{ data.people.active }}</div><div class="text-xs text-muted-foreground">在岗</div></div>
                  <div class="rounded-lg bg-muted/50 py-2"><div class="text-xl font-bold tabular-nums">{{ data.people.reported }}</div><div class="text-xs text-muted-foreground">有报工</div></div>
                  <button :class="data.people.unassigned > 0 ? 'text-warning' : ''" class="rounded-lg bg-muted/50 py-2" type="button" @click="go('/gongchang/worker')">
                    <div class="text-xl font-bold tabular-nums">{{ data.people.unassigned }}</div><div class="text-xs text-muted-foreground">待分配</div>
                  </button>
                </div>
                <div v-if="data.people.top.length > 0" class="flex flex-col gap-2">
                  <span class="text-xs text-muted-foreground">报工工资前 {{ data.people.top.length }}</span>
                  <div v-for="(t, i) in data.people.top" :key="t.userId" class="flex items-center gap-2 text-sm">
                    <span :class="i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'" class="flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold">{{ i + 1 }}</span>
                    <span class="w-16 shrink-0 truncate">{{ t.name }}</span>
                    <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div :style="{ width: `${(n(t.amount) / topMax) * 100}%` }" class="h-full rounded-full bg-primary/70"></div></div>
                    <span class="w-16 shrink-0 text-right tabular-nums">{{ money(t.amount) }}</span>
                  </div>
                </div>
              </div>

              <div class="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm">
                <h2 class="m-0 text-base font-semibold">各段库存</h2>
                <div v-for="s in data.stocks" :key="s.stage" class="flex items-center gap-2 text-sm">
                  <span class="w-24 shrink-0 truncate text-muted-foreground">{{ s.label }}</span>
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div :style="{ width: `${(n(s.quantity) / stockMax) * 100}%` }" class="h-full rounded-full bg-primary/60"></div></div>
                  <span class="w-20 shrink-0 text-right tabular-nums">{{ big(s.quantity) }} <span class="text-xs text-muted-foreground">{{ s.unit }}</span></span>
                </div>
                <span class="text-xs text-muted-foreground">各段单位不同，条形只在同一段内看多少</span>
              </div>
            </div>
          </section>

          <!-- 需要处理 -->
          <section class="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 class="m-0 text-base font-semibold">需要处理<span v-if="alerts.length > 0" class="ml-2 text-sm font-normal text-muted-foreground">{{ alerts.length }} 件</span></h2>
            <p v-if="alerts.length === 0" class="m-0 text-sm text-success">一切正常，没有要处理的事。</p>
            <div v-else class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              <div v-for="(a, i) in alerts" :key="i" :class="a.tone === 'danger' ? 'border-destructive/50' : 'border-warning/50'" class="flex flex-col gap-1 rounded-lg border-l-4 border-y border-r border-y-border border-r-border px-3 py-2">
                <b class="text-sm">{{ a.title }}</b>
                <span class="text-xs text-muted-foreground">{{ a.detail }}</span>
                <button class="self-start text-xs font-semibold text-primary hover:underline" type="button" @click="go(a.path)">{{ a.action }}</button>
              </div>
            </div>
          </section>
        </div>
      </Spin>
    </div>
  </Page>
</template>
