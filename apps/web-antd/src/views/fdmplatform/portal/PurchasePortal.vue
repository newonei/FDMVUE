<script setup lang="ts">
import type { PortalLink } from './model';

import type { PortalSummary } from '#/api/fdmplatform/portal';
import type { ProcurementWorkItem } from '#/api/fdmplatform/procurement-workbench';

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useUserStore } from '@vben/stores';

import { Alert, Button } from 'ant-design-vue';

import { getPortalSummary } from '#/api/fdmplatform/portal';

import { errorText } from '../data';
import PurchaseTrendBars from '../purchase/components/PurchaseTrendBars.vue';
import TopSupplierBars from '../purchase/components/TopSupplierBars.vue';
import { localDate } from '../purchase/quotes/comparison';
import { rmb } from '../purchase/suppliers/model';
import { dueBadge, shortTitle } from '../purchase/tasks/model';
import {
  formatNumber,
  greeting,
  moneyLines,
  pipelineCounts,
  portalDefinitions,
} from './model';

defineOptions({ name: 'FdmPlatformPurchasePortalView' });
const router = useRouter();
const userStore = useUserStore();
const definition = portalDefinitions.purchase;
const summary = ref<PortalSummary>();
const loading = ref(false);
const loadError = ref('');
const today = localDate();
let sequence = 0;

async function load() {
  const run = ++sequence;
  loading.value = true;
  loadError.value = '';
  try {
    const result = await getPortalSummary('purchase');
    if (run === sequence) summary.value = result;
  } catch (error) {
    if (run === sequence) loadError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
onMounted(load);

function reachable(link: PortalLink) {
  return router.getRoutes().some((route) => route.path === link.path);
}
function go(link: PortalLink) {
  void router.push({ path: link.path, query: link.query });
}
const TASKS = '/fdmprocurement/platform-tasks';
const userName = computed(
  () =>
    userStore.userInfo?.realName ||
    (userStore.userInfo as undefined | { nickname?: string })?.nickname ||
    '你好',
);
const steps = computed(() => pipelineCounts(summary.value));
const metric = (key: string) => Number(summary.value?.metrics[key] ?? 0) || 0;
const overdue = computed(() => metric('overdueTasks'));
const soon = computed(() => metric('soonTasks'));
const waiting = computed(() =>
  steps.value
    .filter((step) => step.mine)
    .reduce((sum, step) => sum + step.count, 0),
);
const subline = computed(() => {
  if (!summary.value) return loading.value ? '正在汇总待办…' : '';
  const parts = [];
  if (overdue.value > 0) parts.push(`${overdue.value} 件已超期`);
  const intake = steps.value.find((step) => step.key === 'intake')?.count ?? 0;
  if (intake > 0) parts.push(`${intake} 条申请等你接单`);
  if (parts.length === 0)
    parts.push(
      waiting.value > 0
        ? `${waiting.value} 件事等待处理`
        : '目前没有等待处理的事项',
    );
  return parts.join(' · ');
});
const tasks = computed(() => summary.value?.tasks ?? []);
const department = computed(() => summary.value?.purchasing ?? undefined);
function money(key: string) {
  const lines = moneyLines(summary.value?.metrics[key]);
  return { main: lines[0] ?? '0', sub: lines.slice(1).join(' · ') };
}
const monthCards = computed(() => [
  {
    label: '本月下单额',
    main: money('orderedThisMonth').main,
    sub: money('orderedThisMonth').sub || '我负责的采购单',
  },
  {
    label: '在途采购单',
    main: `${formatNumber(metric('openOrders'), 0)} 张`,
    sub: `待到货 ${formatNumber(metric('awaitingLines'), 0)} 行`,
  },
  {
    label: '未付款',
    main: money('unpaid').main,
    sub: money('unpaid').sub || '已扣除已确认付款',
  },
  {
    label: '我负责的采购单',
    main: `${formatNumber(metric('orders'), 0)} 张`,
    sub: '新系统采购单',
  },
]);
const functions = computed(() =>
  definition.functions
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => reachable(item.link)),
    }))
    .filter((group) => group.items.length > 0),
);
function openTask(task: ProcurementWorkItem) {
  go({ path: TASKS, query: { stage: task.stage, mine: 'true' } });
}
</script>

<template>
  <Page>
    <div class="portal">
      <header class="hello">
        <div>
          <h1>{{ userName }}，{{ greeting(new Date()) }}</h1>
          <p>采购门户 · {{ subline }}</p>
        </div>
        <div class="actions">
          <Button :loading="loading" @click="load">刷新</Button>
          <Button
            v-if="reachable({ path: '/fdmprocurement/raw-purchase' })"
            @click="go({ path: '/fdmprocurement/raw-purchase' })"
          >
            新建原材料采购
          </Button>
          <Button
            v-if="reachable(definition.primary.link)"
            type="primary"
            @click="go(definition.primary.link)"
          >
            {{ definition.primary.label }}
          </Button>
        </div>
      </header>
      <Alert v-if="loadError" type="error" show-icon :message="loadError">
        <template #action>
          <Button size="small" @click="load">重试</Button>
        </template>
      </Alert>

      <section class="panel" aria-labelledby="purchase-flow">
        <div class="panel-head">
          <h2 id="purchase-flow">
            我的采购流程<small>点一步查看对应的单子</small>
          </h2>
          <Button
            v-if="reachable({ path: TASKS })"
            size="small"
            @click="go({ path: TASKS, query: { mine: 'true' } })"
          >
            全部任务
          </Button>
        </div>
        <nav class="pipe" aria-label="采购流程">
          <button
            v-for="step in steps"
            :key="step.key"
            type="button"
            class="seg"
            :class="{
              zero: step.count === 0,
              hot: step.key === 'quote' && step.count > 0,
            }"
            :data-step="step.key"
            @click="go(step.link)"
          >
            <span>{{ step.label }}</span>
            <b>{{ summary ? formatNumber(step.count, 0) : '—' }}</b>
            <small :title="step.preview || step.hint">{{
              step.count > 0 && step.preview ? step.preview : step.hint
            }}</small>
          </button>
        </nav>
      </section>

      <div class="grid">
        <section class="panel" aria-labelledby="purchase-risk">
          <div class="panel-head">
            <h2 id="purchase-risk">交期风险<small>按期望到货日</small></h2>
            <div class="chips">
              <button
                type="button"
                class="chip danger"
                :disabled="overdue === 0"
                @click="
                  go({ path: TASKS, query: { due: 'overdue', mine: 'true' } })
                "
              >
                已超期 {{ overdue }}
              </button>
              <button
                type="button"
                class="chip warn"
                :disabled="soon === 0"
                @click="
                  go({ path: TASKS, query: { due: 'soon', mine: 'true' } })
                "
              >
                3 天内 {{ soon }}
              </button>
            </div>
          </div>
          <button
            v-for="task in tasks"
            :key="task.key"
            type="button"
            class="row"
            @click="openTask(task)"
          >
            <span class="row-main">
              <b :title="task.title">{{ shortTitle(task.title) }}</b>
              <span>{{ task.row.contractCode }} ·
                {{ task.row.customerName || '客户未注明' }}</span>
            </span>
            <span class="pill" :class="dueBadge(task.dueDate, today).tone">{{
              dueBadge(task.dueDate, today).text
            }}</span>
          </button>
          <p v-if="summary && tasks.length === 0" class="empty">
            你名下的采购任务都没有约定交期，或者目前没有任务。
          </p>
        </section>

        <section class="panel" aria-labelledby="purchase-trend">
          <div class="panel-head">
            <h2 id="purchase-trend">
              近 12 个月采购额<small>全部门 · 人民币</small>
            </h2>
          </div>
          <template v-if="department">
            <div class="headline">
              <b>{{ rmb(department.recent12Amount) }}</b>
              <span>{{ formatNumber(department.activeSuppliers, 0) }} 家供应商 ·
                {{ formatNumber(department.recent12Orders, 0) }} 张采购单</span>
            </div>
            <PurchaseTrendBars
              :months="department.months"
              :monthly="department.monthly"
              :height="88"
            />
            <p class="foot">
              含金智迁入的历史采购单，金智没有币种的按人民币计。
            </p>
          </template>
          <p v-else class="empty">
            {{ summary ? '采购统计暂不可用' : '正在汇总…' }}
          </p>
        </section>

        <section class="panel" aria-labelledby="purchase-top">
          <div class="panel-head">
            <h2 id="purchase-top">近 12 个月前 5 家供应商</h2>
            <Button
              v-if="reachable({ path: '/fdmprocurement/platform-suppliers' })"
              size="small"
              @click="go({ path: '/fdmprocurement/platform-suppliers' })"
            >
              供应商管理
            </Button>
          </div>
          <TopSupplierBars
            v-if="department"
            :suppliers="department.topSuppliers"
            @select="go({ path: '/fdmprocurement/platform-suppliers' })"
          />
        </section>

        <section class="panel" aria-labelledby="purchase-month">
          <div class="panel-head">
            <h2 id="purchase-month">
              我的数据<small>{{ summary?.month }}</small>
            </h2>
          </div>
          <div class="metrics">
            <div v-for="card in monthCards" :key="card.label" class="metric">
              <span>{{ card.label }}</span><b :title="card.main">{{ card.main }}</b><small>{{ card.sub }}</small>
            </div>
          </div>
        </section>
      </div>

      <section class="panel" aria-labelledby="purchase-functions">
        <div class="panel-head">
          <h2 id="purchase-functions">全部功能</h2>
        </div>
        <div class="fns">
          <template v-for="group in functions" :key="group.group">
            <button
              v-for="item in group.items"
              :key="item.title"
              type="button"
              class="fn"
              @click="go(item.link)"
            >
              <b>{{ item.title }}</b><span>{{ item.description }}</span>
            </button>
          </template>
        </div>
      </section>
    </div>
  </Page>
</template>

<style scoped>
.portal {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hello {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  justify-content: space-between;
}

.hello h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}

.hello p {
  margin: 4px 0 0;
  color: hsl(var(--muted-foreground));
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.panel {
  min-width: 0;
  padding: 16px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.panel-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-head h2 {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.panel-head small,
.foot,
.empty {
  font-size: 12px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

/* Each step is an arrow into the next one. */
.pipe {
  display: flex;
}

.seg {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 10px 14px 10px 24px;
  margin-right: -6px;
  font: inherit;
  color: hsl(var(--muted-foreground));
  text-align: left;
  cursor: pointer;
  background: hsl(var(--accent));
  border: 0;
  clip-path: polygon(
    0 0,
    calc(100% - 12px) 0,
    100% 50%,
    calc(100% - 12px) 100%,
    0 100%,
    12px 50%
  );
}

.seg:first-child {
  padding-left: 14px;
  border-radius: 8px 0 0 8px;
  clip-path: polygon(
    0 0,
    calc(100% - 12px) 0,
    100% 50%,
    calc(100% - 12px) 100%,
    0 100%
  );
}

.seg:last-child {
  margin-right: 0;
}

.seg span {
  font-size: 12px;
}

.seg b {
  font-size: 24px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  color: hsl(var(--foreground));
}

.seg.zero b {
  color: hsl(var(--muted-foreground));
}

.seg.hot {
  background: hsl(var(--destructive) / 10%);
}

.seg.hot b {
  color: hsl(var(--destructive));
}

.seg small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  white-space: nowrap;
}

.seg:hover,
.seg:focus-visible {
  outline: none;
  background: hsl(var(--primary) / 10%);
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 16px;
}

.chips {
  display: flex;
  gap: 6px;
}

.chip {
  padding: 2px 10px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  border: 0;
  border-radius: 999px;
}

.chip:disabled {
  cursor: default;
  opacity: 0.6;
}

.chip.danger {
  color: hsl(var(--destructive));
  background: hsl(var(--destructive) / 12%);
}

.chip.warn {
  color: hsl(var(--warning));
  background: hsl(var(--warning) / 12%);
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 9px 4px;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-top: 1px solid hsl(var(--border));
}

.row:first-of-type {
  border-top: 0;
}

.row:hover {
  background: hsl(var(--accent));
}

.row-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.row-main b {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  white-space: nowrap;
}

.row-main span {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.pill {
  padding: 1px 8px;
  font-size: 12px;
  white-space: nowrap;
  border-radius: 999px;
}

.pill.danger {
  color: hsl(var(--destructive));
  background: hsl(var(--destructive) / 12%);
}

.pill.warn {
  color: hsl(var(--warning));
  background: hsl(var(--warning) / 12%);
}

.pill.muted {
  color: hsl(var(--muted-foreground));
  background: hsl(var(--accent));
}

.headline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 4px;
}

.headline b {
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.headline span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.foot {
  margin: 6px 0 0;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.metric {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 10px 12px;
  background: hsl(var(--accent));
  border-radius: 8px;
}

.metric span,
.metric small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.metric b {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.fns {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.fn {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 8px 10px;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: hsl(var(--accent));
  border: 1px solid transparent;
  border-radius: 8px;
}

.fn:hover,
.fn:focus-visible {
  outline: none;
  border-color: hsl(var(--primary));
}

.fn b {
  font-size: 13px;
}

.fn span {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

@media (max-width: 960px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .pipe {
    flex-wrap: wrap;
    row-gap: 6px;
  }

  .seg {
    flex-basis: 30%;
  }
}

@media (max-width: 560px) {
  .seg {
    flex-basis: 45%;
  }
}
</style>
