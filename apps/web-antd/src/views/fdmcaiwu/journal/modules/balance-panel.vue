<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmcaiwuBankBalanceApi as Api } from '#/api/fdmcaiwu/journal';

import { computed, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Alert,
  Button,
  DatePicker,
  message,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  deleteBankAccount,
  exportBankBalanceExcel,
  getBankAccounts,
  getBankBalance,
} from '#/api/fdmcaiwu/journal';

import { formatMoney } from '../model';
import AccountDialog from './account-dialog.vue';

/**
 * 银行余额：余额 = 期初 + 收入 − 支出。每个账户按日记账的收付款行逐月累计，
 * 列与财务原来的余额表一致：上年余额、本年收入/支出/余额，再按 1-12 月展开。
 */
defineProps<{ bankNames: string[] }>();
const emit = defineEmits<{ changed: [] }>();

const { hasAccessByCodes } = useAccess();
const canManage = computed(() => hasAccessByCodes(['fdmcaiwu:journal:account']));

const year = ref(String(dayjs().year()));
const table = ref<Api.Table>();
const accounts = ref<Api.Account[]>([]);
const loading = ref(false);
const exporting = ref(false);
const accountDialog = ref<InstanceType<typeof AccountDialog>>();

async function load() {
  loading.value = true;
  try {
    const [result, list] = await Promise.all([
      getBankBalance(Number(year.value)),
      getBankAccounts(),
    ]);
    table.value = result;
    accounts.value = list;
  } finally {
    loading.value = false;
  }
}
defineExpose({ reload: load });
watch(year, load);
onMounted(load);

const unconfigured = computed(
  () => table.value?.rows.filter((row) => row.accountId === null) ?? [],
);
const hiddenAccounts = computed(() =>
  accounts.value.filter((account) => account.enabled === false),
);

function editAccount(row: Api.Row) {
  const account = accounts.value.find((item) => item.id === row.accountId);
  accountDialog.value?.show(account ? { ...account } : row.name);
}
async function removeAccount(row: Api.Row) {
  if (row.accountId === null) return;
  await deleteBankAccount(row.accountId);
  message.success('已删除账户，日记账收支不变');
  await load();
}
/** 改名会改动日记账，整页一起刷新（含本表） */
function onSaved() {
  emit('changed');
}

async function exportExcel() {
  exporting.value = true;
  try {
    const data = await exportBankBalanceExcel(Number(year.value));
    downloadFileFromBlobPart({ fileName: `${year.value}年银行余额.xlsx`, source: data });
  } finally {
    exporting.value = false;
  }
}

function money(value: unknown, blankZero = false) {
  if (value === null || value === undefined) return '';
  if (blankZero && Number(value) === 0) return '';
  return formatMoney(value);
}

/** 未到的月份淡显 */
function isFuture(month: number) {
  return month > (table.value?.currentMonth ?? 12);
}

const columns = computed<TableColumnsType<Api.Row>>(() => [
  { align: 'center', fixed: 'left', key: 'seq', title: '序号', width: 56 },
  { fixed: 'left', key: 'name', title: '开户行', width: 200 },
  { dataIndex: 'nature', key: 'nature', title: '性质', width: 80 },
  { align: 'center', dataIndex: 'currency', key: 'currency', title: '币种', width: 64 },
  { align: 'right', key: 'previousBalance', title: '上年余额', width: 130 },
  { align: 'right', key: 'yearIncome', title: '本年收入', width: 130 },
  { align: 'right', key: 'yearExpense', title: '本年支出', width: 130 },
  { align: 'right', key: 'yearBalance', title: '本年余额', width: 130 },
  ...Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return {
      children: [
        { align: 'right' as const, key: `m${month}-income`, title: '收入', width: 110 },
        { align: 'right' as const, key: `m${month}-expense`, title: '支出', width: 110 },
        { align: 'right' as const, key: `m${month}-balance`, title: '余额', width: 120 },
      ],
      key: `m${month}`,
      title: `${month}月`,
    };
  }),
]);

function monthCell(row: Api.Row, key: string) {
  const [prefix, field] = key.split('-') as [string, 'balance' | 'expense' | 'income'];
  const item = row.months[Number(prefix.slice(1)) - 1];
  return { field, item, month: Number(prefix.slice(1)) };
}
</script>

<template>
  <div>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <Space wrap>
        <DatePicker
          v-model:value="year"
          picker="year"
          value-format="YYYY"
          :allow-clear="false"
          class="w-32"
        />
        <span class="text-xs text-muted-foreground">
          余额 = 上年余额 + 本年收入 − 本年支出；按实际收付日期累计。人民币账户按折人民币，外币账户按原币。
        </span>
      </Space>
      <Space wrap>
        <Button v-if="canManage" @click="accountDialog?.show()">
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          新增账户
        </Button>
        <Button v-access:code="['fdmcaiwu:journal:export']" :loading="exporting" @click="exportExcel">
          <template #icon><IconifyIcon icon="lucide:file-down" /></template>
          导出
        </Button>
      </Space>
    </div>

    <Alert
      v-if="unconfigured.length"
      type="warning"
      show-icon
      class="mb-3"
      :message="`${unconfigured.length} 个收付款行还没设置期初余额（${unconfigured.map((row) => row.name).join('、')}），暂按 0、从第一笔收支算起；如果和已有账户是同一个，修改那个账户时把名称统一即可。`"
    />

    <Table
      bordered
      size="small"
      :columns="columns"
      :data-source="table?.rows ?? []"
      :loading="loading"
      :pagination="false"
      :row-key="(row: Api.Row) => row.name"
      :scroll="{ x: 4950 }"
    >
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === 'seq'">{{ index + 1 }}</template>
        <template v-else-if="column.key === 'name'">
          <div class="flex items-center justify-between gap-1">
            <span class="truncate" :title="record.name">{{ record.name }}</span>
            <Space :size="2" class="shrink-0">
              <Tooltip v-if="record.mismatchCount" :title="`${record.mismatchCount} 笔币种不是 ${record.currency}，未计入余额`">
                <Tag color="warning" class="mr-0">币种</Tag>
              </Tooltip>
              <template v-if="record.accountId === null">
                <Button v-if="canManage" size="small" type="link" class="px-1" @click="editAccount(record as Api.Row)">
                  设置期初
                </Button>
                <Tag v-else class="mr-0">未设置</Tag>
              </template>
              <template v-else-if="canManage">
                <Button size="small" type="link" class="px-1" @click="editAccount(record as Api.Row)">修改</Button>
                <Popconfirm title="删除这个账户？日记账收支不会删除" ok-text="删除" ok-type="danger" @confirm="removeAccount(record as Api.Row)">
                  <Button size="small" type="link" danger class="px-1">删除</Button>
                </Popconfirm>
              </template>
            </Space>
          </div>
        </template>
        <template v-else-if="column.key === 'previousBalance'">
          <Tooltip :title="record.openingMonth ? `期初 ${record.openingMonth}` : '未设置期初，按 0 起算'">
            <span class="balance-num">{{ record.previousBalance == null ? '—' : money(record.previousBalance) }}</span>
          </Tooltip>
        </template>
        <template v-else-if="column.key === 'yearIncome'">
          <span class="balance-num is-income">{{ money(record.yearIncome, true) }}</span>
        </template>
        <template v-else-if="column.key === 'yearExpense'">
          <span class="balance-num is-expense">{{ money(record.yearExpense, true) }}</span>
        </template>
        <template v-else-if="column.key === 'yearBalance'">
          <span class="balance-num font-medium" :class="Number(record.yearBalance) < 0 ? 'is-expense' : ''">
            {{ money(record.yearBalance) }}
          </span>
        </template>
        <template v-else-if="String(column.key).startsWith('m')">
          <span
            class="balance-num"
            :class="[
              monthCell(record as Api.Row, String(column.key)).field === 'income' ? 'is-income' : '',
              monthCell(record as Api.Row, String(column.key)).field === 'expense' ? 'is-expense' : '',
              monthCell(record as Api.Row, String(column.key)).field === 'balance' ? 'font-medium' : '',
              isFuture(monthCell(record as Api.Row, String(column.key)).month) ? 'opacity-50' : '',
            ]"
          >
            {{
              money(
                monthCell(record as Api.Row, String(column.key)).item?.[monthCell(record as Api.Row, String(column.key)).field],
                monthCell(record as Api.Row, String(column.key)).field !== 'balance',
              )
            }}
          </span>
        </template>
      </template>
      <template #summary>
        <Table.Summary fixed>
          <Table.Summary.Row v-for="total in table?.totals ?? []" :key="total.currency">
            <Table.Summary.Cell :index="0" :col-span="3">
              <span class="font-medium">合计</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell :index="3" align="center">{{ total.currency }}</Table.Summary.Cell>
            <Table.Summary.Cell :index="4" align="right">
              <span class="balance-num font-medium">{{ money(total.previousBalance) }}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell :index="5" align="right">
              <span class="balance-num font-medium is-income">{{ money(total.yearIncome, true) }}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell :index="6" align="right">
              <span class="balance-num font-medium is-expense">{{ money(total.yearExpense, true) }}</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell :index="7" align="right">
              <span class="balance-num font-medium">{{ money(total.yearBalance) }}</span>
            </Table.Summary.Cell>
            <template v-for="item in total.months" :key="item.month">
              <Table.Summary.Cell :index="5 + item.month * 3" align="right">
                <span class="balance-num is-income">{{ money(item.income, true) }}</span>
              </Table.Summary.Cell>
              <Table.Summary.Cell :index="6 + item.month * 3" align="right">
                <span class="balance-num is-expense">{{ money(item.expense, true) }}</span>
              </Table.Summary.Cell>
              <Table.Summary.Cell :index="7 + item.month * 3" align="right">
                <span class="balance-num font-medium">{{ money(item.balance) }}</span>
              </Table.Summary.Cell>
            </template>
          </Table.Summary.Row>
        </Table.Summary>
      </template>
    </Table>
    <p v-if="hiddenAccounts.length" class="mt-2 text-xs text-muted-foreground">
      已隐藏 {{ hiddenAccounts.length }} 个账户：
      <template v-for="(item, i) in hiddenAccounts" :key="item.id">
        <a v-if="canManage" @click="accountDialog?.show({ ...item })">{{ item.name }}</a>
        <span v-else>{{ item.name }}</span>
        <span v-if="i < hiddenAccounts.length - 1">、</span>
      </template>
      （点名称修改，打开「在余额表显示」即可）
    </p>

    <AccountDialog ref="accountDialog" :bank-names="bankNames" @saved="onSaved" />
  </div>
</template>

<style scoped>
.balance-num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.is-income {
  color: var(--ant-color-success, #389e0d);
}

.is-expense {
  color: var(--ant-color-error, #cf1322);
}
</style>
