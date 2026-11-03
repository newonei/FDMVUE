<script lang="ts" setup>
import type {
  BoardInput,
  BoardLink,
  EcBoard,
  FactoryBoard,
  TrendView,
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
  Tag,
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
  formatCount,
  formatPercent,
  sum,
  toNumber,
} from '../shared/format';
import Sparkline from '../shared/sparkline.vue';
import { DARK_PALETTE, LIGHT_PALETTE, trendOption } from './charts';
import {
  agingRows,
  buildAlerts,
  buildKpis,
  buildLines,
  LINKS,
  topCustomers,
  topSuppliers,
  trailingMonths,
  trendViews,
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
const activeTrend = ref<TrendView>('signed');

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
const views = computed(() => trendViews(input.value));
const palette = computed(() => (isDark.value ? DARK_PALETTE : LIGHT_PALETTE));
const trend = computed(() =>
  trendOption(activeTrend.value, input.value, months.value, palette.value),
);

const hasAnything = computed(
  () => kpis.value.length > 0 || lines.value.length > 0,
);

const sources = computed(() => {
  const result: string[] = [];
  if (board.value?.foreign) result.push('外贸');
  if (board.value?.domestic) result.push('内销');
  if (board.value?.cashflow) result.push('资金');
  if (board.value?.purchasing) result.push('采购');
  if (ec.value) result.push('电商');
  if (factories.value.some((factory) => factory.dashboard)) {
    result.push('工厂');
  }
  return result;
});

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

const trendTitle = computed(() => {
  const titles: Record<TrendView, string> = {
    cash: '近 12 个月回款与付款（人民币，含金智历史）',
    ec: '近 12 个月电商实际销售额，虚线为去年同月',
    purchasing: '近 12 个月采购额（人民币）',
    signed: '近 12 个月签约额（折人民币），虚线为去年同月合计',
  };
  return titles[activeTrend.value];
});

const ALERT_META = {
  critical: { icon: 'lucide:octagon-alert', label: '紧急' },
  info: { icon: 'lucide:info', label: '提示' },
  serious: { icon: 'lucide:triangle-alert', label: '重要' },
  warning: { icon: 'lucide:circle-alert', label: '关注' },
} as const;

/** 账龄是有序的：越久越接近警示色。 */
const AGING_TONES = ['#86b6ef', '#2a78d6', '#fab219', '#ec835a', '#d03b3b'];

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

watch(views, (available) => {
  if (
    available.length > 0 &&
    !available.some((view) => view.value === activeTrend.value)
  ) {
    activeTrend.value = available[0]!.value;
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
          <template v-if="lastUpdatedAt">
            · 更新于 {{ dayjs(lastUpdatedAt).format('HH:mm') }}
          </template>
        </p>
        <h1>公司看板</h1>
        <p v-if="loadedOnce && hasAnything" class="board-lead">
          {{ summary }}
        </p>
        <p v-else-if="!loadedOnce" class="board-lead">正在汇总各部门数据…</p>
      </div>
      <div class="board-head__actions">
        <div v-if="sources.length" aria-label="数据来源" class="board-sources">
          <span v-for="source in sources" :key="source">{{ source }}</span>
        </div>
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
        <div v-for="item in 5" :key="item" class="panel kpi-tile">
          <Skeleton active :paragraph="{ rows: 2 }" />
        </div>
      </section>
      <div class="panel"><Skeleton active :paragraph="{ rows: 8 }" /></div>
    </template>

    <section v-else-if="!hasAnything" class="panel board-empty">
      <Empty description="当前账号还没有可看的公司经营数据">
        <p class="board-empty__hint">
          公司看板只显示你所在部门本来就能看到的全公司数字：外贸、内销看本业务线签约，
          财务看收付与应收，采购看采购额，电商、工厂看各自看板。需要更多数据请联系管理员分配部门权限。
        </p>
      </Empty>
    </section>

    <template v-else>
      <section aria-label="核心指标" class="kpi-grid">
        <button
          v-for="tile in kpis"
          :key="tile.key"
          class="panel kpi-tile"
          type="button"
          @click="go(tile.link)"
        >
          <span class="kpi-tile__label">{{ tile.label }}</span>
          <span class="kpi-tile__value">{{ tile.value }}</span>
          <span class="kpi-tile__foot">
            <span
              v-if="tile.delta"
              class="delta"
              :class="`delta--${tile.delta.tone}`"
            >
              <IconifyIcon
                :icon="
                  tile.delta.direction === 'up'
                    ? 'lucide:trending-up'
                    : tile.delta.direction === 'down'
                      ? 'lucide:trending-down'
                      : 'lucide:minus'
                "
              />
              {{ tile.delta.text }}
              <small>{{ tile.deltaLabel }}</small>
            </span>
            <span class="kpi-tile__sub">{{ tile.sub }}</span>
          </span>
          <Sparkline
            v-if="tile.spark.length > 1"
            class="kpi-tile__spark"
            :label="`${tile.label}近 12 个月趋势`"
            :values="tile.spark"
            :width="96"
          />
        </button>
      </section>

      <section class="board-row board-row--trend">
        <article v-if="views.length" class="panel">
          <header class="panel-head">
            <div>
              <h2>经营趋势</h2>
              <p>{{ trendTitle }}</p>
            </div>
            <Segmented
              v-if="views.length > 1"
              v-model:value="activeTrend"
              :options="views"
            />
          </header>
          <BoardChart v-if="trend" :height="380" :option="trend" />
          <Empty v-else description="暂无趋势数据" />
        </article>

        <article class="panel">
          <header class="panel-head">
            <div>
              <h2>需要关注</h2>
              <p>按紧急程度排列，点击进入处理</p>
            </div>
            <Tag v-if="alerts.length">{{ alerts.length }} 项</Tag>
          </header>
          <ul v-if="alerts.length" class="alert-list">
            <li v-for="alert in alerts.slice(0, 6)" :key="alert.key">
              <button
                class="alert-item"
                :class="`alert-item--${alert.level}`"
                type="button"
                @click="go(alert.link)"
              >
                <span class="alert-item__badge">
                  <IconifyIcon :icon="ALERT_META[alert.level].icon" />
                  {{ ALERT_META[alert.level].label }}
                </span>
                <span class="alert-item__body">
                  <strong>{{ alert.title }}</strong>
                  <small>{{ alert.detail }}</small>
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
        </article>
      </section>

      <section v-if="lines.length" class="board-section">
        <header class="section-head">
          <h2>业务线</h2>
          <p>各部门本月与今年的关键数字，点击卡片进入部门</p>
        </header>
        <div class="line-grid">
          <button
            v-for="line in lines"
            :key="line.key"
            class="panel line-card"
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
              <strong>{{ line.headline }}</strong>
              <span
                v-if="line.delta"
                class="delta"
                :class="`delta--${line.delta.tone}`"
              >
                {{ line.delta.text }}
                <small>{{ line.deltaLabel }}</small>
              </span>
            </span>
            <Sparkline
              v-if="line.spark.length > 1"
              class="line-card__spark"
              :height="32"
              :label="`${line.name}趋势`"
              :values="line.spark"
              :width="240"
            />
            <dl class="line-card__stats">
              <div v-for="stat in line.stats" :key="stat.label">
                <dt>{{ stat.label }}</dt>
                <dd :class="stat.tone ? `tone--${stat.tone}` : ''">
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
              <p>执行中合同的未回款，从最后一次发货算起</p>
            </div>
            <Button size="small" type="link" @click="go(LINKS.receivables)">
              明细
            </Button>
          </header>
          <div aria-label="应收账龄分布" class="aging-bar" role="img">
            <template v-for="(row, index) in aging" :key="row.bucket">
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
              <tr v-for="(row, index) in aging" :key="row.bucket">
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
              </span>
              <span class="rank-list__value">{{
                compactMoney(row.amount)
              }}</span>
              <span
                class="rank-list__bar"
                :style="{
                  width: `${(row.amount / customers[0]!.amount) * 100}%`,
                }"
              ></span>
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
            </Button>
          </header>
          <ol class="rank-list">
            <li v-for="(row, index) in suppliers" :key="row.key">
              <span class="rank-list__no">{{ index + 1 }}</span>
              <span class="rank-list__name">
                <strong :title="row.name">{{ row.name }}</strong>
                <small>{{ row.detail }}</small>
              </span>
              <span class="rank-list__value">{{
                compactMoney(row.amount)
              }}</span>
              <span
                class="rank-list__bar"
                :style="{
                  width: `${suppliers[0]!.amount > 0 ? (row.amount / suppliers[0]!.amount) * 100 : 0}%`,
                }"
              ></span>
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

  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}

:global(.dark) .board {
  --board-accent: #3987e5;
  --tone-good: #0ca30c;
  --tone-bad: #e66767;
  --tone-warning: #fab219;
  --tone-serious: #ec835a;
}

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
  font-weight: 650;
}

.board-lead {
  max-width: 760px;
  margin: 6px 0 0;
  font-size: 14px;
  color: hsl(var(--muted-foreground));
}

.board-head__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.board-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.board-sources span {
  padding: 2px 10px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--accent));
  border-radius: 999px;
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

.panel {
  min-width: 0;
  padding: 18px;
  font: inherit;
  color: inherit;
  text-align: left;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
}

button.panel {
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

button.panel:hover {
  border-color: hsl(var(--primary) / 45%);
  box-shadow: 0 10px 28px -18px hsl(var(--foreground) / 40%);
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
  font-weight: 600;
}

.panel-head p,
.section-head p {
  margin: 2px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

/* 核心指标 */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
}

.kpi-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 140px;
  overflow: hidden;
}

.kpi-tile__label {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.kpi-tile__value {
  font-size: 28px;
  font-weight: 650;
  line-height: 1.15;
}

.kpi-tile__foot {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding-right: 100px;
  margin-top: auto;
}

.kpi-tile__sub {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.kpi-tile__spark {
  position: absolute;
  right: 16px;
  bottom: 16px;
}

.delta {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
}

.delta small {
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.delta--good {
  color: var(--tone-good);
}

.delta--bad {
  color: var(--tone-bad);
}

.delta--neutral {
  color: hsl(var(--foreground));
}

/* 行布局 */
.board-row {
  display: grid;
  gap: 16px;
}

.board-row--trend {
  grid-template-columns: minmax(0, 1.8fr) minmax(300px, 1fr);
}

.board-row--detail {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

/* 需要关注 */
.alert-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.alert-item {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: hsl(var(--accent) / 55%);
  border: 1px solid transparent;
  border-radius: 10px;
}

.alert-item:hover {
  border-color: hsl(var(--border));
}

.alert-item__badge {
  display: inline-flex;
  flex-shrink: 0;
  gap: 4px;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
}

.alert-item--critical .alert-item__badge {
  color: var(--tone-bad);
}

.alert-item--serious .alert-item__badge {
  color: var(--tone-serious);
}

.alert-item--warning .alert-item__badge {
  color: var(--tone-warning);
}

.alert-item--info .alert-item__badge {
  color: hsl(var(--muted-foreground));
}

.alert-item__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.alert-item__body strong {
  font-size: 13px;
  font-weight: 600;
}

.alert-item__body small {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.alert-item__go {
  flex-shrink: 0;
  color: hsl(var(--muted-foreground));
}

.alert-clear {
  display: flex;
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
  background: hsl(var(--accent));
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
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.line-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  font-weight: 600;
}

.line-card__icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: var(--board-accent);
  background: hsl(var(--accent));
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

.line-card__headline strong {
  font-size: 22px;
  font-weight: 650;
}

.line-card__spark {
  width: 100%;
}

.line-card__stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
  width: 100%;
  padding-top: 12px;
  margin: 0;
  border-top: 1px solid hsl(var(--border));
}

.line-card__stats dt {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.line-card__stats dd {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
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
.aging-bar {
  display: flex;
  gap: 2px;
  height: 12px;
  margin-bottom: 14px;
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

.num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.strong {
  font-weight: 600;
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

.rank-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.rank-list li {
  position: relative;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 8px 0 10px;
}

.rank-list__no {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--accent));
  border-radius: 6px;
}

.rank-list__name {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.rank-list__name strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.rank-list__name small {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.rank-list__value {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.rank-list__bar {
  position: absolute;
  bottom: 2px;
  left: 34px;
  max-width: calc(100% - 34px);
  height: 3px;
  background: var(--board-accent);
  border-radius: 999px;
  opacity: 0.35;
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

@media (max-width: 1100px) {
  .board-row--trend {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .board {
    padding: 12px;
  }

  .kpi-tile__value {
    font-size: 24px;
  }

  .board-row--detail {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
