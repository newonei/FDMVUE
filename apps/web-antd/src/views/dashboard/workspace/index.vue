<script lang="ts" setup>
import type { HeroMode } from './charts';
import type {
  BoardInput,
  BoardLink,
  EcBoard,
  FactoryBoard,
  MetricKey,
} from './model';

import type { CompanyBoard } from '#/api/fdmplatform/company-board';
import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';

import { computed, onActivated, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';
import { usePreferences } from '@vben/preferences';

import {
  Button,
  Empty,
  Segmented,
  Skeleton,
  Tooltip,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { getFactoryDashboardOf } from '#/api/fdmgongchang/dashboard';
import { getMyFactories } from '#/api/fdmgongchang/factory';
import { getCompanyBoard } from '#/api/fdmplatform/company-board';
import { getEcShopDailySummary } from '#/api/fdmdata/ecshopdaily';

import BoardChart from '../shared/board-chart.vue';
import {
  compactMoney,
  delta,
  formatCount,
  formatPercent,
  sum,
  toNumber,
} from '../shared/format';
import MiniBars from '../shared/mini-bars.vue';
import { DARK_PALETTE, heroOption, LIGHT_PALETTE } from './charts';
import {
  agingRows,
  buildAlerts,
  buildKpis,
  buildLines,
  buildMetrics,
  LINKS,
  topCustomers,
  topSuppliers,
  trailingMonths,
} from './model';

defineOptions({ name: 'CompanyDashboard' });

const router = useRouter();
const { hasAccessByCodes } = useAccess();
const { isDark } = usePreferences();

const canViewEc = computed(() =>
  hasAccessByCodes(['fdmdata:ec-shop-daily:query']),
);
const canViewFactory = computed(() =>
  hasAccessByCodes(['fdmgongchang:dashboard:query']),
);

const board = ref<CompanyBoard | null>(null);
const ec = ref<EcBoard | null>(null);
const factories = ref<FactoryBoard[]>([]);
const loading = ref(false);
const loadedOnce = ref(false);
const lastUpdatedAt = ref<null | number>(null);
const activeMetric = ref<MetricKey>('signed');
const heroMode = ref<HeroMode>('cumulative');
const showAllAlerts = ref(false);

const today = ref(dayjs());
const todayText = computed(() => today.value.format('YYYY-MM-DD'));
const weekdayText = computed(
  () =>
    ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][
      today.value.day()
    ],
);
const months = computed(() =>
  trailingMonths(today.value.format('YYYY-MM'), 24),
);

const input = computed<BoardInput>(() => ({
  board: board.value,
  ec: ec.value,
  factories: factories.value,
  today: todayText.value,
}));

const kpis = computed(() => buildKpis(input.value, months.value));
const lines = computed(() => buildLines(input.value));
const alerts = computed(() => buildAlerts(input.value));
const aging = computed(() => agingRows(board.value));
const customers = computed(() => topCustomers(board.value));
const suppliers = computed(() => topSuppliers(board.value));
const metrics = computed(() => buildMetrics(input.value, months.value));
const metric = computed(
  () =>
    metrics.value.find((item) => item.key === activeMetric.value) ??
    metrics.value[0],
);
const palette = computed(() => (isDark.value ? DARK_PALETTE : LIGHT_PALETTE));
const hero = computed(() =>
  heroOption(metric.value, months.value, heroMode.value, palette.value),
);
const heroDelta = computed(() => {
  const current = metric.value;
  return current
    ? delta(current.ytd, current.lastYtd, current.neutral ? null : true)
    : null;
});
/** 今年累计占去年全年的比例 */
const heroProgress = computed(() => {
  const current = metric.value;
  if (!current?.lastYearTotal) return null;
  return (current.ytd / current.lastYearTotal) * 100;
});
const visibleAlerts = computed(() =>
  showAllAlerts.value ? alerts.value : alerts.value.slice(0, 6),
);

/** 业务线卡片的识别色：外贸、内销与主图堆叠柱同色。 */
function lineAccent(key: string) {
  const [blue, orange, aqua] = palette.value.series;
  if (key === 'foreign') return blue;
  if (key === 'domestic') return orange;
  if (key === 'ec') return aqua;
  return isDark.value ? '#9a7ee0' : '#7c5cc4';
}

const hasAnything = computed(
  () => kpis.value.length > 0 || lines.value.length > 0,
);

const unavailableText = computed(() => {
  const names: Record<string, string> = {
    cashflow: '资金收付',
    domestic: '内销',
    foreign: '外贸',
    purchasing: '采购',
  };
  return (board.value?.unavailable ?? [])
    .map((key) => names[key] ?? key)
    .join('、');
});

const summary = computed(() => {
  const parts: string[] = [];
  const signed = kpis.value.find((tile) => tile.key === 'signed');
  if (signed) {
    parts.push(
      `今年签约 ${signed.value}${signed.delta ? `，较去年同期 ${signed.delta.text}` : ''}`,
    );
  }
  const inflow = kpis.value.find((tile) => tile.key === 'inflow');
  if (inflow) parts.push(`回款 ${inflow.value}`);
  const ecTile = kpis.value.find((tile) => tile.key === 'ec');
  if (ecTile) parts.push(`电商销售 ${ecTile.value}`);
  const urgent = alerts.value.filter((alert) =>
    ['critical', 'serious'].includes(alert.level),
  ).length;
  parts.push(urgent > 0 ? `${urgent} 项需要尽快处理` : '暂无紧急风险');
  return `${parts.join('；')}。`;
});


const ALERT_META = {
  critical: { icon: 'lucide:octagon-alert', label: '紧急' },
  info: { icon: 'lucide:info', label: '提示' },
  serious: { icon: 'lucide:triangle-alert', label: '重要' },
  warning: { icon: 'lucide:circle-alert', label: '关注' },
} as const;

/** 账龄是有序的：越久越接近警示色。 */
const AGING_TONES = ['#2a78d6', '#fab219', '#ec835a', '#d03b3b'];

function selectTile(tile: { link: BoardLink; metric?: MetricKey }) {
  if (tile.metric) activeMetric.value = tile.metric;
  else go(tile.link);
}

function go(link?: BoardLink) {
  if (link) void router.push(link);
}

function zeros() {
  return months.value.map(() => 0);
}

function countShops(
  rows: FdmdataEcShopDailyApi.EcShopDailySummaryRow[] | undefined,
  month: string,
) {
  return new Set(
    (rows ?? [])
      .filter((row) => row.periodKey === month)
      .map((row) => row.shopKey),
  ).size;
}

async function loadEc(): Promise<EcBoard | null> {
  if (!canViewEc.value) return null;
  const now = today.value;
  const lastYear = now.subtract(1, 'year');
  const [summaryResult, lastYearResult] = await Promise.allSettled([
    getEcShopDailySummary({
      channelType: 'ALL',
      hideEmptyPeriod: false,
      periodType: 'MONTH',
      statDate: [`${months.value[0]}-01`, now.format('YYYY-MM-DD')],
    }),
    getEcShopDailySummary({
      channelType: 'ALL',
      hideEmptyPeriod: true,
      periodType: 'MONTH',
      statDate: [
        lastYear.startOf('year').format('YYYY-MM-DD'),
        lastYear.format('YYYY-MM-DD'),
      ],
    }),
  ]);
  if (summaryResult.status !== 'fulfilled') return null;
  const data = summaryResult.value;
  const sales = zeros();
  const marketing = zeros();
  const orders = zeros();
  const refund = zeros();
  const position = new Map(months.value.map((month, index) => [month, index]));
  for (const row of data.rows ?? []) {
    const index = position.get(row.periodKey);
    if (index === undefined) continue;
    sales[index] = sales[index]! + toNumber(row.salesAmount);
    marketing[index] = marketing[index]! + toNumber(row.marketingCost);
    orders[index] = orders[index]! + toNumber(row.realOrderCount);
    refund[index] = refund[index]! + toNumber(row.refundAmount);
  }
  // 月初数据还没上来时，卡片和提醒看上一个有数据的月份
  let latest = months.value.length - 1;
  while (latest > 0 && sales[latest] === 0 && marketing[latest] === 0) latest--;
  const latestMonth = months.value[latest]!;
  const activeShops = new Set(
    (data.rows ?? [])
      .filter((row) => row.periodKey === latestMonth && toNumber(row.salesAmount) > 0)
      .map((row) => row.shopKey),
  );
  const year = now.format('YYYY');
  const ytd = sum(
    months.value.map((month, index) =>
      month.startsWith(year) ? sales[index] : 0,
    ),
  );
  const maxDate = data.dataMaxDate ? dayjs(data.dataMaxDate) : null;
  return {
    dataMaxDate: maxDate?.isValid() ? maxDate.format('YYYY-MM-DD') : undefined,
    highRefund: countShops(data.rankings?.highRefundRatio, latestMonth),
    latest,
    lastYtd:
      lastYearResult.status === 'fulfilled'
        ? toNumber(lastYearResult.value.totals?.salesAmount)
        : null,
    marketing,
    months: months.value,
    orders,
    refund,
    sales,
    shops: activeShops.size,
    ytd,
    zeroSalesWithCost: countShops(
      data.rankings?.zeroSalesWithCost,
      latestMonth,
    ),
  };
}

async function loadFactories(): Promise<FactoryBoard[]> {
  if (!canViewFactory.value) return [];
  const mine = await getMyFactories();
  const list = mine.factories ?? [];
  const results = await Promise.allSettled(
    list.map((factory) => getFactoryDashboardOf(factory.id, '30d')),
  );
  return list.map((factory, index) => {
    const result = results[index]!;
    return {
      dashboard: result.status === 'fulfilled' ? result.value : null,
      id: factory.id,
      name: factory.name,
    };
  });
}

async function refresh() {
  if (loading.value) return;
  loading.value = true;
  today.value = dayjs();
  try {
    const [boardResult, ecResult, factoryResult] = await Promise.allSettled([
      getCompanyBoard(),
      loadEc(),
      loadFactories(),
    ]);
    board.value = boardResult.status === 'fulfilled' ? boardResult.value : null;
    ec.value = ecResult.status === 'fulfilled' ? ecResult.value : null;
    factories.value =
      factoryResult.status === 'fulfilled' ? factoryResult.value : [];
    lastUpdatedAt.value = Date.now();
  } finally {
    loading.value = false;
    loadedOnce.value = true;
  }
}

watch(metrics, (available) => {
  if (
    available.length > 0 &&
    !available.some((item) => item.key === activeMetric.value)
  ) {
    activeMetric.value = available[0]!.key;
  }
});

onMounted(() => void refresh());
onActivated(() => {
  if (lastUpdatedAt.value && Date.now() - lastUpdatedAt.value > 5 * 60_000) {
    void refresh();
  }
});
</script>

<template>
  <div class="board">
    <header class="board-head">
      <div>
        <p class="board-eyebrow">
          {{ todayText }} · {{ weekdayText }}
        </p>
        <h1>公司看板</h1>
        <p v-if="loadedOnce && hasAnything" class="board-lead">
          {{ summary }}
        </p>
        <p v-else-if="!loadedOnce" class="board-lead">正在汇总各部门数据…</p>
      </div>
      <div class="board-head__actions">
        <span v-if="lastUpdatedAt" class="board-updated">
          更新于 {{ dayjs(lastUpdatedAt).format('HH:mm') }}
        </span>
        <Button :loading="loading" @click="refresh">
          <template #icon><IconifyIcon icon="lucide:refresh-cw" /></template>
          刷新
        </Button>
      </div>
    </header>

    <p v-if="unavailableText" class="board-warning">
      <IconifyIcon icon="lucide:circle-alert" />
      {{ unavailableText }}数据暂时读不出来，其余数据正常显示。
    </p>

    <template v-if="!loadedOnce">
      <section class="kpi-grid">
        <div v-for="item in 5" :key="item" class="panel kpi">
          <Skeleton active :paragraph="{ rows: 2 }" />
        </div>
      </section>
      <div class="panel"><Skeleton active :paragraph="{ rows: 8 }" /></div>
    </template>

    <section v-else-if="!hasAnything" class="panel board-empty">
      <Empty description="暂时没有读到公司经营数据">
        <p class="board-empty__hint">
          公司看板只对超级管理员开放。如果你是超级管理员仍看到这里，可能是各部门数据暂时读不出来，请稍后点「刷新」。
        </p>
      </Empty>
    </section>

    <template v-else>
      <section aria-label="核心指标" class="kpi-grid">
        <button
          v-for="tile in kpis"
          :key="tile.key"
          :aria-pressed="tile.metric ? tile.metric === metric?.key : undefined"
          class="panel kpi"
          :class="{ 'kpi--active': tile.metric && tile.metric === metric?.key }"
          :title="tile.metric ? '在下方图表中查看' : '查看明细'"
          type="button"
          @click="selectTile(tile)"
        >
          <span class="kpi__label">
            <span class="kpi__icon"><IconifyIcon :icon="tile.icon" /></span>
            {{ tile.label }}
            <IconifyIcon
              v-if="!tile.metric"
              class="kpi__go"
              icon="lucide:arrow-up-right"
            />
          </span>
          <span class="kpi__value">{{ tile.value }}</span>
          <span class="kpi__foot">
            <span
              v-if="tile.delta"
              class="pill"
              :class="`pill--${tile.delta.tone}`"
            >
              <IconifyIcon
                :icon="
                  tile.delta.direction === 'up'
                    ? 'lucide:arrow-up-right'
                    : tile.delta.direction === 'down'
                      ? 'lucide:arrow-down-right'
                      : 'lucide:minus'
                "
              />
              {{ tile.delta.text }}
            </span>
            <span class="kpi__compare">{{ tile.compare }}</span>
          </span>
        </button>
      </section>

      <section class="board-row board-row--hero">
        <article v-if="metric" class="panel hero">
          <header class="panel-head">
            <div>
              <h2>{{ metric.label }} · 今年与去年对比</h2>
              <p>{{ metric.caption }}；点上方指标卡切换</p>
            </div>
            <div class="hero-tools">
              <Segmented
                v-if="metric.lastYearTotal !== null"
                v-model:value="heroMode"
                :options="[
                  { label: '累计', value: 'cumulative' },
                  { label: '每月', value: 'monthly' },
                ]"
                size="small"
              />
              <Button size="small" type="link" @click="go(metric.link)">
                明细
                <IconifyIcon icon="lucide:chevron-right" />
              </Button>
            </div>
          </header>

          <div class="hero-figures">
            <div class="figure figure--main">
              <small>今年累计</small>
              <strong>{{ compactMoney(metric.ytd) }}</strong>
            </div>
            <div v-if="metric.lastYtd" class="figure">
              <small>去年同期</small>
              <strong>{{ compactMoney(metric.lastYtd) }}</strong>
              <span
                v-if="heroDelta"
                class="pill"
                :class="`pill--${heroDelta.tone}`"
              >
                {{ heroDelta.text }}
              </span>
            </div>
            <div v-if="heroProgress !== null" class="figure figure--progress">
              <small>
                已达去年全年 {{ compactMoney(metric.lastYearTotal) }} 的
              </small>
              <strong>{{ formatPercent(heroProgress, 0) }}</strong>
              <span class="progress" role="presentation">
                <span :style="{ width: `${Math.min(100, heroProgress)}%` }"></span>
              </span>
            </div>
          </div>

          <BoardChart v-if="hero" :height="300" :option="hero" />
          <p v-if="metric.gapNote" class="hero-gap">
            <IconifyIcon icon="lucide:info" />
            {{ metric.gapNote }}
          </p>
        </article>

        <article class="panel alerts">
          <header class="panel-head">
            <div>
              <h2>需要关注</h2>
              <p>按紧急程度排列，点击进入处理</p>
            </div>
            <span v-if="alerts.length" class="count-chip">
              {{ alerts.length }}
            </span>
          </header>
          <ul v-if="alerts.length" class="alert-list">
            <li v-for="alert in visibleAlerts" :key="alert.key">
              <button
                class="alert-item"
                :class="`alert-item--${alert.level}`"
                type="button"
                @click="go(alert.link)"
              >
                <span class="alert-item__icon">
                  <IconifyIcon :icon="ALERT_META[alert.level].icon" />
                </span>
                <span class="alert-item__body">
                  <span class="alert-item__title">
                    <strong>{{ alert.title }}</strong>
                  </span>
                  <small>
                    <span class="alert-item__level">
                      {{ ALERT_META[alert.level].label }}
                    </span>
                    {{ alert.detail }}
                  </small>
                </span>
                <IconifyIcon
                  class="alert-item__go"
                  icon="lucide:chevron-right"
                />
              </button>
            </li>
          </ul>
          <div v-else class="alert-clear">
            <span class="alert-clear__icon">
              <IconifyIcon icon="lucide:shield-check" />
            </span>
            <strong>暂无需要关注的事项</strong>
            <small>交期、应收、汇率、电商与工厂都在正常范围</small>
          </div>
          <Button
            v-if="alerts.length > 6"
            block
            class="alerts__more"
            size="small"
            type="text"
            @click="showAllAlerts = !showAllAlerts"
          >
            {{ showAllAlerts ? '收起' : `展开其余 ${alerts.length - 6} 项` }}
          </Button>
        </article>
      </section>

      <section v-if="lines.length" class="board-section">
        <header class="section-head">
          <h2>业务线</h2>
          <p>各部门的关键数字，点击卡片进入部门</p>
        </header>
        <div class="line-grid">
          <button
            v-for="line in lines"
            :key="line.key"
            class="panel line-card"
            :style="{ '--line-accent': lineAccent(line.key) }"
            type="button"
            @click="go(line.link)"
          >
            <span class="line-card__top">
              <span class="line-card__name">
                <span class="line-card__icon">
                  <IconifyIcon :icon="line.icon" />
                </span>
                {{ line.name }}
              </span>
              <IconifyIcon class="line-card__go" icon="lucide:arrow-up-right" />
            </span>
            <span class="line-card__headline">
              <small>{{ line.headlineLabel }}</small>
              <span class="line-card__value">
                <strong>{{ line.headline }}</strong>
                <span
                  v-if="line.delta"
                  class="pill"
                  :class="`pill--${line.delta.tone}`"
                  :title="line.deltaLabel"
                >
                  {{ line.delta.text }}
                </span>
              </span>
            </span>
            <MiniBars
              v-if="line.spark.length > 1"
              :height="36"
              :label="`${line.name}趋势`"
              :values="line.spark"
            />
            <dl class="line-card__stats">
              <div v-for="stat in line.stats" :key="stat.label">
                <dt>{{ stat.label }}</dt>
                <dd :class="stat.tone ? `tone--${stat.tone}` : ''">
                  <IconifyIcon
                    v-if="stat.tone === 'critical'"
                    icon="lucide:octagon-alert"
                  />
                  <IconifyIcon
                    v-else-if="stat.tone === 'warning'"
                    icon="lucide:triangle-alert"
                  />
                  {{ stat.value }}
                </dd>
              </div>
            </dl>
            <span v-if="line.note" class="line-card__note">{{
              line.note
            }}</span>
          </button>
        </div>
      </section>

      <section
        v-if="aging || customers.length || suppliers.length"
        class="board-row board-row--detail"
      >
        <article v-if="aging" class="panel">
          <header class="panel-head">
            <div>
              <h2>应收账龄</h2>
              <p>已发货未收齐的合同，从最后一次发货算起</p>
            </div>
            <Button size="small" type="link" @click="go(LINKS.receivables)">
              明细
              <IconifyIcon icon="lucide:chevron-right" />
            </Button>
          </header>
          <div class="aging-total">
            <strong>{{ compactMoney(aging.total) }}</strong>
            <small>
              {{ formatCount(sum(aging.rows.map((row) => row.count))) }}
              份合同已发货未收齐
            </small>
          </div>
          <div aria-label="应收账龄分布" class="aging-bar" role="img">
            <template v-for="(row, index) in aging.rows" :key="row.bucket">
              <Tooltip
                v-if="row.share > 0"
                :title="`${row.label}：${compactMoney(row.amount)} · ${row.count} 份 · ${formatPercent(row.share)}`"
              >
                <span
                  class="aging-bar__part"
                  :style="{
                    flexGrow: row.share,
                    background: AGING_TONES[index],
                  }"
                ></span>
              </Tooltip>
            </template>
          </div>
          <table class="rank-table">
            <tbody>
              <tr
                v-for="(row, index) in aging.rows"
                :key="row.bucket"
                :class="{ 'is-zero': row.count === 0 }"
              >
                <td>
                  <span
                    class="swatch"
                    :style="{ background: AGING_TONES[index] }"
                  ></span>
                  {{ row.label }}
                </td>
                <td class="num">{{ formatCount(row.count) }} 份</td>
                <td class="num strong">{{ compactMoney(row.amount) }}</td>
                <td class="num muted">{{ formatPercent(row.share, 0) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="aging.unshipped.count > 0" class="aging-note">
            另有 {{ formatCount(aging.unshipped.count) }} 份未发货合同未收
            {{ compactMoney(aging.unshipped.amount) }}，发货后才开始算账龄。
          </p>
        </article>

        <article v-if="customers.length" class="panel">
          <header class="panel-head">
            <div>
              <h2>客户前 5 名</h2>
              <p>近 12 个月签约额（折人民币）</p>
            </div>
          </header>
          <ol class="rank-list">
            <li v-for="(row, index) in customers" :key="row.key">
              <span class="rank-list__no">{{ index + 1 }}</span>
              <span class="rank-list__name">
                <strong :title="row.name">{{ row.name }}</strong>
                <small>{{ row.tag }} · {{ row.detail }}</small>
                <span class="rank-list__track">
                  <span
                    :style="{
                      width: `${(row.amount / customers[0]!.amount) * 100}%`,
                    }"
                  ></span>
                </span>
              </span>
              <span class="rank-list__value">{{
                compactMoney(row.amount)
              }}</span>
            </li>
          </ol>
        </article>

        <article v-if="suppliers.length" class="panel">
          <header class="panel-head">
            <div>
              <h2>供应商前 5 名</h2>
              <p>近 12 个月采购额（人民币）</p>
            </div>
            <Button size="small" type="link" @click="go(LINKS.suppliers)">
              全部
              <IconifyIcon icon="lucide:chevron-right" />
            </Button>
          </header>
          <ol class="rank-list">
            <li v-for="(row, index) in suppliers" :key="row.key">
              <span class="rank-list__no">{{ index + 1 }}</span>
              <span class="rank-list__name">
                <strong :title="row.name">{{ row.name }}</strong>
                <small>{{ row.detail }}</small>
                <span class="rank-list__track">
                  <span
                    :style="{
                      width: `${suppliers[0]!.amount > 0 ? (row.amount / suppliers[0]!.amount) * 100 : 0}%`,
                    }"
                  ></span>
                </span>
              </span>
              <span class="rank-list__value">{{
                compactMoney(row.amount)
              }}</span>
            </li>
          </ol>
        </article>
      </section>

      <p class="board-footnote">
        签约额按签约日期统计，外币按当天汇率折人民币，金智历史合同金额本身是人民币；回款与付款含金智迁入的历史收付；电商取店铺后台日汇总的实际销售额。
      </p>
    </template>
  </div>
</template>

<style scoped>
.board {
  --board-accent: #2a78d6;
  --tone-good: #006300;
  --tone-bad: #d03b3b;
  --tone-warning: #9a6200;
  --tone-serious: #c4511f;
  --tone-info: #5f6b7a;

  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px 28px;
}

:global(.dark) .board {
  --board-accent: #3987e5;
  --tone-good: #2fbf4a;
  --tone-bad: #e66767;
  --tone-warning: #fab219;
  --tone-serious: #ec835a;
  --tone-info: #9aa4b2;
}

/* 头部 */
.board-head {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  justify-content: space-between;
}

.board-eyebrow {
  margin: 0 0 4px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.board-head h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.board-lead {
  max-width: 820px;
  margin: 6px 0 0;
  font-size: 14px;
  color: hsl(var(--muted-foreground));
}

.board-head__actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.board-updated {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.board-warning {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  margin: 0;
  font-size: 13px;
  color: var(--tone-warning);
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

/* 通用面板 */
.panel {
  min-width: 0;
  padding: 18px 20px;
  font: inherit;
  color: inherit;
  text-align: left;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 16px;
  box-shadow: 0 1px 2px hsl(var(--foreground) / 4%);
}

button.panel {
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

button.panel:hover {
  border-color: hsl(var(--primary) / 40%);
  box-shadow: 0 12px 30px -20px hsl(var(--foreground) / 45%);
}

button.panel:focus-visible,
.alert-item:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}

.panel-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
}

.panel-head h2,
.section-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
}

.panel-head p,
.section-head p {
  margin: 2px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

/* 涨跌胶囊：颜色之外始终带箭头和数字 */
.pill {
  display: inline-flex;
  flex-shrink: 0;
  gap: 2px;
  align-items: center;
  padding: 1px 7px;
  font-size: 12px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  line-height: 18px;
  border-radius: 999px;
}

.pill--good {
  color: var(--tone-good);
  background: color-mix(in srgb, var(--tone-good) 12%, transparent);
}

.pill--bad {
  color: var(--tone-bad);
  background: color-mix(in srgb, var(--tone-bad) 12%, transparent);
}

.pill--neutral {
  color: hsl(var(--foreground) / 80%);
  background: hsl(var(--accent));
}

/* 核心指标 */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.kpi {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 124px;
  overflow: hidden;
}

.kpi--active {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--board-accent) 7%, hsl(var(--card))) 0%,
    hsl(var(--card)) 70%
  );
  border-color: color-mix(in srgb, var(--board-accent) 55%, transparent);
}

.kpi--active::before {
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  content: '';
  background: var(--board-accent);
}

.kpi__label {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.kpi__icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 24px;
  height: 24px;
  font-size: 14px;
  color: var(--board-accent);
  background: color-mix(in srgb, var(--board-accent) 12%, transparent);
  border-radius: 7px;
}

.kpi__go {
  margin-left: auto;
}

.kpi__value {
  font-size: 26px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}

.kpi__foot {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: center;
  margin-top: auto;
}

.kpi__compare {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

/* 行布局 */
.board-row {
  display: grid;
  gap: 16px;
}

.board-row--hero {
  grid-template-columns: minmax(0, 1.9fr) minmax(320px, 1fr);
  align-items: stretch;
}

.board-row--detail {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

/* 主图 */
.hero-tools {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  align-items: center;
}

.hero-figures {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 0;
  margin-bottom: 8px;
}

.figure {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 150px;
  padding: 0 24px;
  border-left: 1px solid hsl(var(--border));
}

.figure:first-child {
  padding-left: 0;
  border-left: none;
}

.figure small {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.figure strong {
  font-size: 20px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
}

.figure .pill {
  align-self: flex-start;
}

.figure--main strong {
  font-size: 30px;
  font-weight: 700;
  color: var(--board-accent);
}

.figure--progress {
  flex: 1;
  max-width: 280px;
}

.progress {
  display: block;
  height: 6px;
  margin-top: 4px;
  overflow: hidden;
  background: hsl(var(--accent));
  border-radius: 999px;
}

.progress > span {
  display: block;
  height: 100%;
  background: var(--board-accent);
  border-radius: 999px;
}

.hero-gap {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 8px 12px;
  margin: 8px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--accent) / 60%);
  border-radius: 8px;
}

/* 需要关注 */
.alerts {
  display: flex;
  flex-direction: column;
}

.count-chip {
  min-width: 24px;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 650;
  line-height: 22px;
  color: var(--tone-bad);
  text-align: center;
  background: color-mix(in srgb, var(--tone-bad) 12%, transparent);
  border-radius: 999px;
}

.alert-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.alert-item {
  --level: var(--tone-info);

  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 10px;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 12px;
}

.alert-item:hover {
  background: hsl(var(--accent) / 70%);
}

.alert-item--critical {
  --level: var(--tone-bad);
}

.alert-item--serious {
  --level: var(--tone-serious);
}

.alert-item--warning {
  --level: var(--tone-warning);
}

.alert-item__icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 34px;
  height: 34px;
  font-size: 17px;
  color: var(--level);
  background: color-mix(in srgb, var(--level) 12%, transparent);
  border-radius: 10px;
}

.alert-item__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.alert-item__title strong {
  font-size: 13px;
  font-weight: 650;
}

.alert-item__body small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.alert-item__level {
  margin-right: 4px;
  font-weight: 650;
  color: var(--level);
}

.alert-item__go {
  flex-shrink: 0;
  color: hsl(var(--muted-foreground));
}

.alerts__more {
  margin-top: auto;
  color: hsl(var(--muted-foreground));
}

.alert-clear {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  text-align: center;
}

.alert-clear__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: 6px;
  font-size: 22px;
  color: var(--tone-good);
  background: color-mix(in srgb, var(--tone-good) 12%, transparent);
  border-radius: 50%;
}

.alert-clear small {
  color: hsl(var(--muted-foreground));
}

/* 业务线 */
.board-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-head {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
}

.line-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}

.line-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.line-card::before {
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  content: '';
  background: var(--line-accent);
}

.line-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.line-card__name {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
  font-weight: 650;
}

.line-card__icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: var(--line-accent);
  background: color-mix(in srgb, var(--line-accent) 13%, transparent);
  border-radius: 8px;
}

.line-card__go {
  color: hsl(var(--muted-foreground));
}

.line-card__headline {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.line-card__headline > small {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.line-card__value {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.line-card__value strong {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.line-card__stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
  width: 100%;
  padding-top: 12px;
  margin: 0;
  border-top: 1px dashed hsl(var(--border));
}

.line-card__stats dt {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.line-card__stats dd {
  display: flex;
  gap: 4px;
  align-items: center;
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.tone--critical {
  color: var(--tone-bad);
}

.tone--warning {
  color: var(--tone-warning);
}

.tone--good {
  color: var(--tone-good);
}

.line-card__note {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

/* 账龄与排行 */
.aging-total {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: baseline;
  margin-bottom: 10px;
}

.aging-total strong {
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.aging-total small {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.aging-bar {
  display: flex;
  gap: 2px;
  height: 10px;
  margin-bottom: 12px;
  overflow: hidden;
  background: hsl(var(--accent));
  border-radius: 999px;
}

.aging-bar__part {
  min-width: 4px;
  height: 100%;
}

.rank-table {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}

.rank-table td {
  padding: 7px 0;
  border-top: 1px solid hsl(var(--border) / 60%);
}

.rank-table tr:first-child td {
  border-top: none;
}

.rank-table tr.is-zero td {
  color: hsl(var(--muted-foreground));
}

.num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.strong {
  font-weight: 650;
}

.muted {
  width: 48px;
  color: hsl(var(--muted-foreground));
}

.swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 2px;
}

.aging-note {
  padding: 8px 10px;
  margin: 10px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--accent) / 60%);
  border-radius: 8px;
}

.rank-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.rank-list li {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
}

.rank-list__no {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  font-size: 12px;
  font-weight: 650;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--accent));
  border-radius: 6px;
}

.rank-list li:first-child .rank-list__no {
  color: #fff;
  background: var(--board-accent);
}

.rank-list__name {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.rank-list__name strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
}

.rank-list__name small {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.rank-list__track {
  display: block;
  height: 4px;
  margin-top: 5px;
  overflow: hidden;
  background: hsl(var(--accent));
  border-radius: 999px;
}

.rank-list__track > span {
  display: block;
  height: 100%;
  background: var(--board-accent);
  border-radius: 999px;
  opacity: 0.7;
}

.rank-list__value {
  font-size: 14px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.board-empty {
  padding: 48px 24px;
}

.board-empty__hint {
  max-width: 520px;
  margin: 8px auto 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.board-footnote {
  margin: 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

@media (max-width: 1200px) {
  .board-row--hero {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .board {
    padding: 12px 16px;
  }

  .kpi__value {
    font-size: 22px;
  }

  .figure {
    min-width: 0;
    padding: 0 12px;
  }

  .figure--main strong {
    font-size: 24px;
  }

  .board-row--detail {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
