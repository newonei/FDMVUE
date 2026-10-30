<script setup lang="ts">
import type { PortalLink } from './model';

import type { PortalSummary, PortalTodo } from '#/api/fdmplatform/portal';

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useUserStore } from '@vben/stores';

import { Alert, Button } from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import { getEcInvoiceApplyPage } from '#/api/fdmdata/ecinvoiceapply';
import { getPortalSummary } from '#/api/fdmplatform/portal';

import { errorText } from '../data';
import { nativeMoney } from '../documents/migration-display';
import CashflowChart from '../finance/cash/CashflowChart.vue';
import { changeText, rmb } from '../finance/cash/model';
import RankBars from '../finance/cash/RankBars.vue';
import {
  actionableCount,
  EC_INVOICES,
  FINANCE_PAYMENTS,
  FINANCE_RECEIPTS,
  formatNumber,
  greeting,
  moneyLines,
  portalDefinitions,
} from './model';

defineOptions({ name: 'FdmPlatformFinancePortalView' });
const router = useRouter();
const userStore = useUserStore();
const definition = portalDefinitions.finance;
const summary = ref<PortalSummary>();
/** 电商开票不在业务协同模块里，按菜单权限在前端单独查；查不到就不显示数字 */
const extraTodos = ref<PortalTodo[]>([]);
const loading = ref(false);
const loadError = ref('');
const accountSide = ref<'in' | 'out'>('in');
let sequence = 0;

function reachable(link: PortalLink) {
  return router.getRoutes().some((route) => route.path === link.path);
}
function go(link: PortalLink) {
  void router.push({ path: link.path, query: link.query });
}

async function loadEcInvoices() {
  if (!reachable({ path: EC_INVOICES })) return;
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
    const result = await getPortalSummary('finance');
    if (run === sequence) summary.value = result;
  } catch (error) {
    if (run === sequence) loadError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
onMounted(load);

const userName = computed(
  () =>
    userStore.userInfo?.realName ||
    (userStore.userInfo as undefined | { nickname?: string })?.nickname ||
    '你好',
);
const todos = computed(() =>
  definition.todos.map((entry) => {
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
const waiting = computed(
  () =>
    actionableCount(summary.value) +
    extraTodos.value.reduce((sum, todo) => sum + (Number(todo.count) || 0), 0),
);
const subline = computed(() => {
  if (!summary.value) return loading.value ? '正在汇总待办…' : '';
  return waiting.value > 0
    ? `有 ${waiting.value} 件事等待处理`
    : '目前没有等待处理的事项';
});

const cash = computed(() => summary.value?.cashflow ?? undefined);
const net = computed(() => {
  if (!cash.value) return undefined;
  const value = new BigNumber(cash.value.recent12.in).minus(
    cash.value.recent12.out,
  );
  return { negative: value.isNegative(), text: rmb(value.abs().toString()) };
});
/**
 * 收款涨为好、付款不着色；对比期跨过金智迁移截止日时，本期只有新系统登记的收付，不给涨跌。
 */
function compare(
  current: unknown,
  previous: unknown,
  options: { out?: boolean; since?: string } = {},
) {
  const until = cash.value?.migratedUntil;
  if (until && options.since && options.since > until)
    return {
      text: `金智数据截至 ${until}，之后只含新系统登记`,
      tone: 'muted' as const,
    };
  const change = changeText(current, previous, '上年同期为 0');
  return options.out ? { ...change, tone: 'muted' as const } : change;
}
const periodCards = computed(() => {
  const view = cash.value;
  if (!view) return [];
  const monthStart = `${view.asOf.slice(0, 7)}-01`;
  const yearStart = `${view.asOf.slice(0, 4)}-01-01`;
  return [
    {
      label: `本月收款 · ${view.asOf.slice(5, 7)} 月`,
      main: rmb(view.thisMonth.in),
      change: compare(view.thisMonth.in, view.lastYearMonth.in, {
        since: monthStart,
      }),
    },
    {
      label: '本月付款',
      main: rmb(view.thisMonth.out),
      change: compare(view.thisMonth.out, view.lastYearMonth.out, {
        out: true,
        since: monthStart,
      }),
    },
    {
      label: `${view.asOf.slice(0, 4)} 年累计收款`,
      main: rmb(view.ytd.in),
      change: compare(view.ytd.in, view.lastYtd.in, { since: yearStart }),
    },
    {
      label: `${view.asOf.slice(0, 4)} 年累计付款`,
      main: rmb(view.ytd.out),
      change: compare(view.ytd.out, view.lastYtd.out, {
        out: true,
        since: yearStart,
      }),
    },
  ];
});
const metric = (key: string) => {
  const lines = moneyLines(summary.value?.metrics[key]);
  return { main: lines[0] ?? '0', sub: lines.slice(1).join(' · ') };
};
const workCards = computed(() => [
  {
    label: '应收未回款',
    main: metric('receivable').main,
    sub: metric('receivable').sub || '新系统执行中合同',
    link: { path: FINANCE_RECEIPTS, query: { view: 'receivables' } },
  },
  {
    label: '待付款',
    main: metric('payable').main,
    sub: metric('payable').sub || '已提交的采购请款',
    link: { path: FINANCE_PAYMENTS, query: { view: 'requests' } },
  },
  {
    label: '本月开票',
    main: metric('invoicedThisMonth').main,
    sub: `${formatNumber(summary.value?.metrics.invoicesThisMonth ?? 0, 0)} 张有效发票`,
    link: { path: FINANCE_RECEIPTS, query: { view: 'invoices' } },
  },
]);
const topCustomers = computed(() =>
  (cash.value?.topCustomers ?? []).map((row) => ({
    key: row.key,
    name: row.name,
    amount: row.amount,
    hint: `${row.count} 笔回款`,
  })),
);
const topSuppliers = computed(() =>
  (cash.value?.topSuppliers ?? []).map((row) => ({
    key: row.key,
    name: row.name,
    amount: row.amount,
    hint: `${row.count} 笔付款`,
  })),
);
const accounts = computed(() =>
  (
    (accountSide.value === 'in'
      ? cash.value?.accountsIn
      : cash.value?.accountsOut) ?? []
  ).map((row) => ({
    key: row.name,
    name: row.name,
    amount: row.amount,
    hint: `${row.count} 笔`,
    muted: row.other,
  })),
);
const unconverted = computed(() => {
  const value = cash.value?.unconverted;
  return value ? value.in + value.out : 0;
});
const functions = computed(() =>
  definition.functions
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => reachable(item.link)),
    }))
    .filter((group) => group.items.length > 0),
);
</script>

<template>
  <Page>
    <div class="portal">
      <header class="hello">
        <div>
          <h1>{{ userName }}，{{ greeting(new Date()) }}</h1>
          <p>财务门户 · {{ subline }}</p>
        </div>
        <div class="actions">
          <Button :loading="loading" @click="load">刷新</Button>
          <Button
            v-if="reachable({ path: FINANCE_PAYMENTS })"
            @click="go({ path: FINANCE_PAYMENTS, query: { view: 'requests' } })"
          >
            采购请款
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

      <section class="panel" aria-labelledby="finance-todo">
        <div class="panel-head">
          <h2 id="finance-todo">待办<small>财务部共用</small></h2>
        </div>
        <div class="todos">
          <button
            v-for="entry in todos"
            :key="entry.key"
            type="button"
            class="todo"
            :class="{
              zero: entry.count === 0,
              hot: entry.hot && entry.count > 0,
            }"
            :data-todo="entry.key"
            @click="go(entry.link)"
          >
            <span>{{ entry.label }}</span>
            <b>{{ summary ? formatNumber(entry.count, 0) : '—' }}</b>
            <small :title="entry.todo.preview">{{
              entry.count > 0 ? entry.todo.preview || '点击查看' : entry.empty
            }}</small>
          </button>
        </div>
      </section>

      <div class="grid">
        <section class="panel" aria-labelledby="finance-cash">
          <div class="panel-head">
            <h2 id="finance-cash">
              近 12 个月收支<small>全部门 · 人民币</small>
            </h2>
          </div>
          <template v-if="cash">
            <div class="headline">
              <div>
                <span>收款</span><b>{{ rmb(cash.recent12.in) }}</b>
                <small
                  :class="compare(cash.recent12.in, cash.previous12.in).tone"
                  >{{
                    compare(cash.recent12.in, cash.previous12.in).text
                  }}</small>
              </div>
              <div>
                <span>付款</span><b>{{ rmb(cash.recent12.out) }}</b>
                <small
                  :class="
                    compare(cash.recent12.out, cash.previous12.out, {
                      out: true,
                    }).tone
                  "
                  >{{
                    compare(cash.recent12.out, cash.previous12.out, {
                      out: true,
                    }).text
                  }}</small>
              </div>
              <div v-if="net">
                <span>净流入</span><b :class="{ negative: net.negative }">{{ net.negative ? '-' : '' }}{{ net.text }}</b>
                <small>收款 − 采购付款</small>
              </div>
            </div>
            <CashflowChart
              :months="cash.months"
              :inflow="cash.inflow"
              :outflow="cash.outflow"
              :height="120"
            />
            <p class="foot">
              含金智迁入的合同回款、集中回款、逐单与集中付款<template
                v-if="cash.migratedUntil"
              >
                （金智数据截至
                {{ cash.migratedUntil }}，之后只有新系统登记的收付）
</template>；外币按冻结汇率或金智本位币金额折算<template v-if="unconverted">
                ，{{ unconverted }} 笔外币缺汇率未计入
</template>。付款只含采购付款，不含费用报销。
            </p>
          </template>
          <p v-else class="empty">
            {{ summary ? '收支统计暂不可用' : '正在汇总…' }}
          </p>
        </section>

        <section class="panel" aria-labelledby="finance-period">
          <div class="panel-head">
            <h2 id="finance-period">
              本月与今年<small>{{ cash?.asOf ?? summary?.month }}</small>
            </h2>
          </div>
          <div class="metrics">
            <div v-for="card in periodCards" :key="card.label" class="metric">
              <span>{{ card.label }}</span>
              <b :title="card.main">{{ card.main }}</b>
              <small :class="card.change.tone">{{ card.change.text }}</small>
            </div>
            <button
              v-for="card in workCards"
              :key="card.label"
              type="button"
              class="metric link"
              @click="go(card.link)"
            >
              <span>{{ card.label }}</span>
              <b :title="card.main">{{ card.main }}</b>
              <small>{{ card.sub }}</small>
            </button>
          </div>
        </section>

        <section class="panel" aria-labelledby="finance-customers">
          <div class="panel-head">
            <h2 id="finance-customers">
              回款前 5 的客户<small>近 12 个月</small>
            </h2>
            <Button
              v-if="reachable({ path: FINANCE_RECEIPTS })"
              size="small"
              @click="
                go({ path: FINANCE_RECEIPTS, query: { view: 'customers' } })
              "
            >
              客户回款
            </Button>
          </div>
          <RankBars
            :rows="topCustomers"
            clickable
            empty="近 12 个月没有回款"
            @select="
              go({ path: FINANCE_RECEIPTS, query: { view: 'customers' } })
            "
          />
        </section>

        <section class="panel" aria-labelledby="finance-suppliers">
          <div class="panel-head">
            <h2 id="finance-suppliers">
              付款前 5 的供应商<small>近 12 个月</small>
            </h2>
            <Button
              v-if="reachable({ path: FINANCE_PAYMENTS })"
              size="small"
              @click="
                go({ path: FINANCE_PAYMENTS, query: { view: 'suppliers' } })
              "
            >
              供应商付款
            </Button>
          </div>
          <RankBars
            :rows="topSuppliers"
            tone="out"
            clickable
            empty="近 12 个月没有付款"
            @select="
              go({ path: FINANCE_PAYMENTS, query: { view: 'suppliers' } })
            "
          />
        </section>

        <section class="panel" aria-labelledby="finance-accounts">
          <div class="panel-head">
            <h2 id="finance-accounts">资金账户<small>近 12 个月</small></h2>
            <div class="seg" role="group" aria-label="收款或付款账户">
              <button
                type="button"
                :class="{ on: accountSide === 'in' }"
                @click="accountSide = 'in'"
              >
                收款账户
              </button>
              <button
                type="button"
                :class="{ on: accountSide === 'out' }"
                @click="accountSide = 'out'"
              >
                付款账户
              </button>
            </div>
          </div>
          <RankBars :rows="accounts" :tone="accountSide" empty="没有记录账户" />
        </section>

        <section class="panel" aria-labelledby="finance-waiting">
          <div class="panel-head">
            <h2 id="finance-waiting">{{ definition.listTitle }}</h2>
            <Button
              v-if="reachable(definition.listMore)"
              size="small"
              @click="go(definition.listMore)"
            >
              查看全部
            </Button>
          </div>
          <button
            v-for="payment in summary?.payments ?? []"
            :key="`${payment.type}:${payment.id}`"
            type="button"
            class="row"
            @click="
              go(
                payment.type === 'RECEIPT'
                  ? {
                      path: FINANCE_RECEIPTS,
                      query: {
                        view: 'receipts',
                        contractId: payment.contractId ?? '',
                        documentId: payment.id,
                      },
                    }
                  : {
                      path: FINANCE_PAYMENTS,
                      query: { view: 'requests', financeId: payment.id },
                    },
              )
            "
          >
            <span class="row-main">
              <b>{{ payment.type === 'RECEIPT' ? '回款' : '采购请款' }} ·
                {{ nativeMoney(payment.amount, payment.currency) }}</b>
              <span>{{
                [payment.contractCode, payment.party, payment.name]
                  .filter(Boolean)
                  .join(' · ')
              }}</span>
            </span>
            <span class="pill warn">{{
              payment.type === 'RECEIPT' ? '待确认' : '待付款'
            }}</span>
          </button>
          <p v-if="summary && !summary.payments?.length" class="empty">
            {{ definition.listEmpty }}
          </p>
        </section>
      </div>

      <section class="panel" aria-labelledby="finance-functions">
        <div class="panel-head">
          <h2 id="finance-functions">全部功能</h2>
        </div>
        <div v-for="group in functions" :key="group.group" class="fn-group">
          <h3>{{ group.group }}</h3>
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

.todos {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.todo {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 10px 12px;
  font: inherit;
  color: hsl(var(--muted-foreground));
  text-align: left;
  cursor: pointer;
  background: hsl(var(--accent));
  border: 1px solid transparent;
  border-radius: 8px;
}

.todo span {
  font-size: 12px;
}

.todo b {
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
  color: hsl(var(--foreground));
}

.todo small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  white-space: nowrap;
}

.todo.zero b {
  color: hsl(var(--muted-foreground));
}

.todo.hot {
  background: hsl(var(--destructive) / 8%);
}

.todo.hot b {
  color: hsl(var(--destructive));
}

.todo:hover,
.todo:focus-visible {
  outline: none;
  border-color: hsl(var(--primary));
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 16px;
}

.headline {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin-bottom: 12px;
}

.headline div {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.headline span,
.headline small {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.headline b {
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.negative,
small.down {
  color: hsl(var(--destructive)) !important;
}

small.up {
  color: hsl(var(--success)) !important;
}

.foot {
  margin: 8px 0 0;
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
  font: inherit;
  color: inherit;
  text-align: left;
  background: hsl(var(--accent));
  border: 1px solid transparent;
  border-radius: 8px;
}

.metric.link {
  cursor: pointer;
}

.metric.link:hover,
.metric.link:focus-visible {
  outline: none;
  border-color: hsl(var(--primary));
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

.seg {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.seg button {
  padding: 2px 10px;
  font: inherit;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
}

.seg button.on {
  font-weight: 600;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
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

.pill.warn {
  color: hsl(var(--warning));
  background: hsl(var(--warning) / 12%);
}

.fn-group + .fn-group {
  margin-top: 12px;
}

.fn-group h3 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
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

@media (max-width: 1200px) {
  .todos {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 560px) {
  .todos {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
