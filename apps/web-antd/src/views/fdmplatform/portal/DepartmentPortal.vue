<script setup lang="ts">
import type { PortalLink } from './model';

import type {
  PortalDepartment,
  PortalSummary,
  PortalTodo,
} from '#/api/fdmplatform/portal';

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useUserStore } from '@vben/stores';

import { Alert, Button } from 'ant-design-vue';

import { getEcInvoiceApplyPage } from '#/api/fdmdata/ecinvoiceapply';
import { getPortalSummary } from '#/api/fdmplatform/portal';

import {
  contractMainline,
  contractNextStep,
} from '../components/contract-mainline';
import { contractWorkboard } from '../components/contract-workboard';
import { errorText } from '../data';
import { nativeMoney } from '../documents/migration-display';
import {
  actionableCount,
  contractLink,
  EC_INVOICES,
  formatNumber,
  greeting,
  pickTrend,
  portalDefinitions,
} from './model';

/** 外贸 and 财务 portals; 采购门户 has its own page (PurchasePortal). */
const props = defineProps<{ department: PortalDepartment }>();
const router = useRouter();
const userStore = useUserStore();
const definition = computed(() => portalDefinitions[props.department]);
const summary = ref<PortalSummary>();
/** 业务协同之外的待办（电商开票），按菜单权限在前端单独查；查不到就不显示数字 */
const extraTodos = ref<PortalTodo[]>([]);
const loading = ref(false);
const loadError = ref('');
let sequence = 0;

async function loadEcInvoices() {
  if (props.department !== 'finance' || !reachable({ path: EC_INVOICES }))
    return;
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
    const text = (date: Date) =>
      date.toLocaleString('sv-SE').replace('T', ' ').slice(0, 19);
    const [pending, urgent] = await Promise.all([
      getEcInvoiceApplyPage({
        pageNo: 1,
        pageSize: 1,
        invoiceStatus: 0,
        sort: 'DUE',
      }),
      getEcInvoiceApplyPage({
        pageNo: 1,
        pageSize: 1,
        invoiceStatus: 0,
        invoiceDueTime: [text(now), text(soon)],
      }),
    ]);
    const first = pending.list[0];
    let preview = first ? `${first.shopName ?? ''} · ${first.title ?? ''}` : '';
    if (urgent.total > 0) preview = `${urgent.total} 张 3 天内到开票截止`;
    extraTodos.value = [{ key: 'ecInvoice', count: pending.total, preview }];
  } catch {
    extraTodos.value = [];
  }
}
async function load() {
  void loadEcInvoices();
  const run = ++sequence;
  loading.value = true;
  loadError.value = '';
  try {
    const result = await getPortalSummary(props.department);
    if (run === sequence) summary.value = result;
  } catch (error) {
    if (run === sequence) loadError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
onMounted(load);

/** Entries the user cannot open (no menu for their role) are left out instead of leading to a 404. */
function reachable(link: PortalLink) {
  return router.getRoutes().some((route) => route.path === link.path);
}
function go(link: PortalLink) {
  void router.push({ path: link.path, query: link.query });
}
const userName = computed(
  () =>
    userStore.userInfo?.realName ||
    (userStore.userInfo as undefined | { nickname?: string })?.nickname ||
    '你好',
);
const headline = computed(() => `${userName.value}，${greeting(new Date())}`);
const waiting = computed(() => actionableCount(summary.value));
const subline = computed(() => {
  if (!summary.value) return loading.value ? '正在汇总待办…' : '';
  return waiting.value > 0
    ? `有 ${waiting.value} 件事等待处理`
    : '目前没有等待处理的事项';
});
const todos = computed(() =>
  definition.value.todos.map((entry) => {
    const todo: PortalTodo = [
      ...(summary.value?.todos ?? []),
      ...extraTodos.value,
    ].find((item) => item.key === entry.key) ?? {
      key: entry.key,
      count: 0,
      preview: '',
    };
    return {
      ...entry,
      todo,
      count: Number(todo.count) || 0,
      link: entry.target(todo),
    };
  }),
);
const busyTodos = computed(
  () => todos.value.filter((entry) => entry.count > 0).length,
);
const metrics = computed(() =>
  definition.value.metrics.map((metric) => ({
    label: metric.label,
    ...(summary.value
      ? metric.value(summary.value.metrics)
      : { main: '—', sub: '' }),
  })),
);
const trend = computed(() => pickTrend(summary.value?.trend));
const trendMax = computed(() =>
  Math.max(1, ...trend.value.values.map((value) => Math.abs(value))),
);
const trendTitle = computed(() => {
  const unit = trend.value.key === 'BATCH' ? '' : trend.value.key;
  const others = trend.value.others.filter((key) => key !== 'BATCH');
  return `${definition.value.trendLabel}${unit ? `（${unit}）` : ''}${others.length > 0 ? `，另有 ${others.join('、')}` : ''}`;
});
const functions = computed(() =>
  definition.value.functions
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => reachable(item.link)),
    }))
    .filter((group) => group.items.length > 0),
);

const STAGE_KEYS = ['合同', '采购', '到货', '发货', '回款', '开票'];
const contractRows = computed(() =>
  (summary.value?.contracts ?? []).map((contract) => {
    const stages = contractMainline(contract);
    const next = contractNextStep(
      contract,
      stages,
      contractWorkboard(contract),
    );
    return { contract, stages, next };
  }),
);
</script>
<template>
  <Page>
    <div class="portal">
      <header class="portal-hello">
        <div>
          <h1>{{ headline }}</h1>
          <p>{{ definition.name }} · {{ subline }}</p>
        </div>
        <div class="portal-actions">
          <Button :loading="loading" @click="load">刷新</Button>
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
      <div class="portal-grid">
        <div class="portal-col">
          <section class="portal-panel" aria-labelledby="portal-todo">
            <div class="panel-head">
              <h2 id="portal-todo">
                我的待办<small v-if="summary">{{ busyTodos }} 类有事项</small>
              </h2>
            </div>
            <div class="todos">
              <button
                v-for="entry in todos"
                :key="entry.key"
                type="button"
                class="todo"
                :class="[
                  {
                    zero: entry.count === 0,
                    hot: entry.hot && entry.count > 0,
                  },
                ]"
                :data-todo="entry.key"
                @click="go(entry.link)"
              >
                <span class="todo-top">
                  <span>{{ entry.label }}</span><b>{{ summary ? formatNumber(entry.count, 0) : '—' }}</b>
                </span>
                <span class="todo-preview">{{
                  entry.count > 0
                    ? entry.todo.preview || '点击查看'
                    : entry.empty
                }}</span>
                <span class="todo-go">去处理 →</span>
              </button>
            </div>
          </section>
          <section class="portal-panel" aria-labelledby="portal-list">
            <div class="panel-head">
              <h2 id="portal-list">{{ definition.listTitle }}</h2>
              <Button
                v-if="reachable(definition.listMore)"
                size="small"
                @click="go(definition.listMore)"
              >
                查看全部
              </Button>
            </div>
            <template v-if="department === 'trade'">
              <button
                v-for="row in contractRows"
                :key="row.contract.id"
                type="button"
                class="list-row"
                @click="go(contractLink(row.contract.id))"
              >
                <span class="list-main">
                  <b>{{ row.contract.code }}</b>
                  <span>{{ row.contract.customerName }} ·
                    {{
                      nativeMoney(row.contract.amount, row.contract.currency)
                    }}</span>
                </span>
                <span class="steps" aria-label="办理主线">
                  <span class="step-bars">
                    <i
                      v-for="stage in row.stages"
                      :key="stage.key"
                      :class="`is-${stage.state}`"
                      :title="`${stage.title}：${stage.summary}`"
                    ></i>
                  </span>
                  <span class="step-names" aria-hidden="true">
                    <span v-for="name in STAGE_KEYS" :key="name">{{
                      name
                    }}</span>
                  </span>
                </span>
                <span class="pill">{{ row.next.title }}</span>
              </button>
            </template>
            <template v-else-if="department === 'finance'">
              <button
                v-for="payment in summary?.payments ?? []"
                :key="`${payment.type}:${payment.id}`"
                type="button"
                class="list-row"
                @click="
                  go(
                    payment.type === 'RECEIPT'
                      ? {
                          path: '/caiwu/platform-receipts',
                          query: {
                            view: 'receipts',
                            contractId: payment.contractId ?? '',
                            documentId: payment.id,
                          },
                        }
                      : {
                          path: '/caiwu/platform-procurement-requests',
                          query: { view: 'requests', financeId: payment.id },
                        },
                  )
                "
              >
                <span class="list-main">
                  <b>{{ payment.type === 'RECEIPT' ? '回款' : '采购请款' }} ·
                    {{ nativeMoney(payment.amount, payment.currency) }}</b>
                  <span>{{
                      [payment.contractCode, payment.party, payment.name]
                        .filter(Boolean)
                        .join(' · ')
                    }}<template v-if="payment.rmbAmount !== undefined">
                      · 折 CNY {{ formatNumber(payment.rmbAmount) }}</template></span>
                </span>
                <span></span>
                <span class="pill warn">{{
                  payment.type === 'RECEIPT' ? '待确认' : '待付款'
                }}</span>
              </button>
            </template>
            <template v-else>
              <button
                v-for="movement in summary?.movements ?? []"
                :key="`${movement.contractId}:${movement.time}:${movement.kind}`"
                type="button"
                class="list-row"
                @click="
                  go({
                    path: '/fdmwaimao/platform-shipments',
                    query: { contractId: movement.contractId },
                  })
                "
              >
                <span class="list-main">
                  <b>{{ movement.kind === 'OUTBOUND' ? '发货' : '客户退货' }} ·
                    {{ movement.product || '产品' }}
                    {{ formatNumber(movement.quantity) }} {{ movement.unit }}</b>
                  <span>{{ movement.contractCode }} ·
                    {{ movement.time.slice(0, 10) }}</span>
                </span>
                <span></span>
                <span
                  class="pill"
                  :class="[movement.kind === 'OUTBOUND' ? 'ok' : 'warn']"
                  >{{
                    movement.kind === 'OUTBOUND' ? '已发货' : '已退回'
                  }}</span>
              </button>
            </template>
            <p
              v-if="
                summary &&
                !(
                  summary.contracts?.length ||
                  summary.tasks?.length ||
                  summary.payments?.length ||
                  summary.movements?.length
                )
              "
              class="empty"
            >
              {{ definition.listEmpty }}
            </p>
          </section>
        </div>
        <div class="portal-col">
          <section class="portal-panel" aria-labelledby="portal-data">
            <div class="panel-head">
              <h2 id="portal-data">
                {{ definition.dataTitle
                }}<small v-if="summary">{{ summary.month }}</small>
              </h2>
            </div>
            <div class="metrics">
              <div v-for="metric in metrics" :key="metric.label" class="metric">
                <span>{{ metric.label }}</span><b :title="metric.main">{{ metric.main }}</b><small>{{ metric.sub || ' ' }}</small>
              </div>
            </div>
            <div class="bars" role="img" :aria-label="trendTitle">
              <span
                v-for="(value, index) in trend.values"
                :key="index"
                :class="{ current: index === trend.values.length - 1 }"
                :style="{
                  height: `${Math.max(2, Math.round((Math.abs(value) / trendMax) * 100))}%`,
                }"
                :title="`${trend.months[index] ?? ''} ${formatNumber(value)}`"
              ></span>
            </div>
            <div class="bar-labels">
              <span v-for="month in trend.months" :key="month">{{
                month
              }}</span>
            </div>
            <p class="foot">{{ trendTitle }}</p>
          </section>
          <section class="portal-panel" aria-labelledby="portal-functions">
            <div class="panel-head">
              <h2 id="portal-functions">全部功能</h2>
            </div>
            <div v-for="group in functions" :key="group.group" class="fn-group">
              <span class="fn-title">{{ group.group }}</span>
              <div class="fns">
                <button
                  v-for="item in group.items"
                  :key="item.title"
                  type="button"
                  class="fn"
                  @click="go(item.link)"
                >
                  <b>{{ item.title }}</b><span>{{ item.description }}</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Page>
</template>
<style scoped>
.portal {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.portal-hello {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  justify-content: space-between;
}

.portal-hello h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}

.portal-hello p {
  margin: 4px 0 0;
  color: hsl(var(--muted-foreground));
}

.portal-actions {
  display: flex;
  gap: 8px;
}

.portal-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.portal-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.portal-panel {
  min-width: 0;
  padding: 16px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.panel-head {
  display: flex;
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
.foot {
  font-size: 12px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.todos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}

.todo,
.fn,
.list-row {
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.todo {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 12px;
  background: hsl(var(--accent));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.todo:hover,
.fn:hover,
.todo:focus-visible,
.fn:focus-visible {
  outline: none;
  border-color: hsl(var(--primary));
}

.todo.hot {
  border-left: 3px solid hsl(var(--destructive));
  border-radius: 0 8px 8px 0;
}

.todo-top {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.todo-top b {
  font-size: 24px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--foreground));
}

.todo.zero .todo-top b {
  color: hsl(var(--muted-foreground));
}

.todo-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.todo-go {
  font-size: 12px;
  color: hsl(var(--primary));
}

.list-row {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1.4fr) auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 10px 4px;
  background: transparent;
  border: 0;
  border-top: 1px solid hsl(var(--border));
}

.list-row:first-of-type {
  border-top: 0;
}

.list-row:hover {
  background: hsl(var(--accent));
}

.list-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.list-main b {
  font-size: 13px;
}

.list-main span {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-bars,
.step-names {
  display: flex;
  gap: 3px;
}

.step-bars i {
  display: block;
  width: 26px;
  height: 6px;
  background: hsl(var(--border));
  border-radius: 3px;
}

.step-bars i.is-done {
  background: hsl(var(--success));
}

.step-bars i.is-active {
  background: hsl(var(--primary));
}

.step-bars i.is-unknown {
  background: hsl(var(--warning));
}

.step-names span {
  width: 26px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.pill {
  padding: 1px 8px;
  font-size: 12px;
  color: hsl(var(--primary));
  white-space: nowrap;
  background: hsl(var(--primary) / 12%);
  border-radius: 999px;
}

.pill.warn {
  color: hsl(var(--warning));
  background: hsl(var(--warning) / 12%);
}

.pill.danger {
  color: hsl(var(--destructive));
  background: hsl(var(--destructive) / 12%);
}

.pill.ok {
  color: hsl(var(--success));
  background: hsl(var(--success) / 12%);
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
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.metric b {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.metric small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bars {
  display: flex;
  gap: 6px;
  align-items: flex-end;
  height: 64px;
  margin-top: 12px;
  border-bottom: 1px solid hsl(var(--border));
}

.bars span {
  flex: 1;
  background: hsl(var(--primary) / 25%);
  border-radius: 3px 3px 0 0;
}

.bars span.current {
  background: hsl(var(--primary));
}

.bar-labels {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.bar-labels span {
  flex: 1;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.foot,
.empty {
  margin: 6px 0 0;
}

.empty {
  padding: 12px 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.fn-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fn-group + .fn-group {
  padding-top: 12px;
  margin-top: 12px;
  border-top: 1px dashed hsl(var(--border));
}

.fn-title {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.fns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.fn {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 8px 10px;
  background: hsl(var(--accent));
  border: 1px solid transparent;
  border-radius: 8px;
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
  .portal-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 560px) {
  .list-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .metrics,
  .fns {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
