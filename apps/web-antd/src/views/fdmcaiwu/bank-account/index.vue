<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmcaiwuBankBalanceApi as Api } from '#/api/fdmcaiwu/journal';

import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, message, Popconfirm, Select, Space, Table, Tabs, Tag } from 'ant-design-vue';

import {
  deleteBankAccount,
  getBankAccountCompanies,
  getBankAccounts,
} from '#/api/fdmcaiwu/journal';

import { ACCOUNT_TYPE_LABELS } from '../journal/model';
import AccountDialog from './modules/account-dialog.vue';
import BalancePanel from './modules/balance-panel.vue';

defineOptions({ name: 'FdmcaiwuBankAccounts' });

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();
const canManage = computed(() => hasAccessByCodes(['fdmcaiwu:journal:account']));

const accounts = ref<Api.Account[]>([]);
const companies = ref<Api.CompanyOption[]>([]);
const accountType = ref<Api.AccountType>();
const selectedAccountId = ref<number>();
const currency = ref<string>();
const status = ref<'active' | 'inactive'>();
const loading = ref(false);
const dialog = ref<InstanceType<typeof AccountDialog>>();
const balancePanel = ref<InstanceType<typeof BalancePanel>>();

const activeTab = computed({
  get: () => route.query.tab === 'balance' ? 'balance' : 'archive',
  set: (tab) => {
    void router.replace({ query: { ...route.query, tab: tab === 'balance' ? tab : undefined } });
  },
});
const companyId = computed({
  get: () => {
    const raw = route.query.companyId;
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return undefined;
    const id = Number(raw);
    return Number.isSafeInteger(id) ? id : undefined;
  },
  set: (id) => {
    void router.replace({ query: { ...route.query, companyId: id == null ? undefined : String(id) } });
  },
});

const companyOptions = computed(() => [
  { label: '未归属主体', value: 0 },
  ...companies.value.map(({ id, name }) => ({ label: name, value: id })),
]);
const accountTypeOptions = Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => ({ label, value }));
const statusOptions = [
  { label: '启用', value: 'active' },
  { label: '停用', value: 'inactive' },
];

const filters = computed<Api.BalanceFilter>(() => ({
  accountId: selectedAccountId.value,
  accountType: accountType.value,
  active: status.value === undefined ? undefined : status.value === 'active',
  companyId: companyId.value,
  currency: currency.value,
}));
const matchingAccounts = computed(() => accounts.value.filter((account) => {
  const filter = filters.value;
  return (filter.companyId === undefined || (account.companyId ?? 0) === filter.companyId)
    && (filter.accountType === undefined || (account.accountType ?? 'BANK') === filter.accountType)
    && (filter.currency === undefined || account.currency === filter.currency)
    && (filter.active === undefined || (account.active !== false) === filter.active);
}));
const filteredAccounts = computed(() => matchingAccounts.value.filter((account) =>
  selectedAccountId.value === undefined || account.id === selectedAccountId.value));
const currencyOptions = computed(() => [...new Set(accounts.value.map(({ currency }) => currency))].sort().map(
  (value) => ({ label: value, value }),
));
const accountOptions = computed(() => matchingAccounts.value.map(({ id, name }) => ({ label: name, value: id })));
const hiddenAccounts = computed(() => filteredAccounts.value.filter((account) => account.enabled === false));

const columns: TableColumnsType<Api.Account> = [
  { dataIndex: 'name', ellipsis: true, key: 'name', title: '账户简称', width: 150 },
  { dataIndex: 'companyName', ellipsis: true, key: 'companyName', title: '所属公司', width: 170 },
  { key: 'accountType', title: '账户类型', width: 105 },
  { dataIndex: 'accountName', ellipsis: true, key: 'accountName', title: '账户名称', width: 155 },
  { dataIndex: 'bankName', ellipsis: true, key: 'bankName', title: '开户行', width: 140 },
  { dataIndex: 'accountNo', ellipsis: true, key: 'accountNo', title: '银行账号', width: 185 },
  { dataIndex: 'currency', key: 'currency', title: '币种', width: 70 },
  { key: 'active', title: '业务状态', width: 90 },
  { key: 'enabled', title: '余额表', width: 80 },
  { fixed: 'right', key: 'actions', title: '操作', width: 170 },
];

let loadRequest = 0;
async function loadAccounts() {
  const request = ++loadRequest;
  loading.value = true;
  try {
    const result = await getBankAccounts();
    if (request === loadRequest) accounts.value = result;
  } finally {
    if (request === loadRequest) loading.value = false;
  }
}

onMounted(() => {
  void loadAccounts();
  void getBankAccountCompanies().then((list) => { companies.value = list; });
});

function createAccount() {
  dialog.value?.show(undefined, companyId.value || null);
}

async function editBalanceRow(row: Api.Row) {
  if (row.accountId == null) {
    dialog.value?.show(row.name, companyId.value || null);
    return;
  }
  let account = accounts.value.find(({ id }) => id === row.accountId);
  if (!account) {
    await loadAccounts();
    account = accounts.value.find(({ id }) => id === row.accountId);
  }
  if (account) dialog.value?.show(account);
}

function refresh() {
  void loadAccounts();
  void balancePanel.value?.reload();
}

async function removeAccount(account: Api.Account) {
  if (account.id == null) return;
  await deleteBankAccount(account.id);
  message.success('已删除账户');
  refresh();
}
</script>

<template>
  <Page>
    <header class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="mb-0 text-xl font-semibold tracking-tight">银行与私账账户</h1>
      <Button v-if="canManage" type="primary" @click="createAccount">
        <template #icon><IconifyIcon icon="lucide:plus" /></template>
        新增账户
      </Button>
    </header>

    <Space wrap>
      <Select
        v-model:value="companyId"
        :options="companyOptions"
        allow-clear
        show-search
        option-filter-prop="label"
        class="w-52"
        aria-label="所属公司"
        placeholder="全部公司"
      />
      <Select
        v-model:value="accountType"
        :options="accountTypeOptions"
        allow-clear
        class="w-32"
        aria-label="账户类型"
        placeholder="全部类型"
      />
      <Select
        v-model:value="status"
        :options="statusOptions"
        allow-clear
        class="w-32"
        aria-label="业务状态"
        placeholder="全部状态"
      />
      <Select
        v-model:value="currency"
        :options="currencyOptions"
        allow-clear
        class="w-28"
        aria-label="币种"
        placeholder="全部币种"
      />
      <Select
        v-model:value="selectedAccountId"
        :options="accountOptions"
        allow-clear
        show-search
        option-filter-prop="label"
        class="w-44"
        aria-label="账户"
        placeholder="全部账户"
      />
    </Space>

    <Tabs v-model:active-key="activeTab" class="mt-2">
      <Tabs.TabPane key="archive" tab="账户档案">
        <Table
          :columns="columns"
          :data-source="filteredAccounts"
          :loading="loading"
          :pagination="{ defaultPageSize: 20, showSizeChanger: true }"
          :scroll="{ x: 1325 }"
          row-key="id"
          size="middle"
        >
          <template #bodyCell="{ column, record, text }">
            <template v-if="column.key === 'companyName'">
              {{ text || (record.companyId == null ? '未归属主体' : `公司 #${record.companyId}`) }}
            </template>
            <template v-else-if="column.key === 'accountType'">
              {{ ACCOUNT_TYPE_LABELS[(record.accountType ?? 'BANK') as Api.AccountType] }}
            </template>
            <template v-else-if="column.key === 'accountName' || column.key === 'bankName' || column.key === 'accountNo'">
              {{ text || '—' }}
            </template>
            <template v-else-if="column.key === 'active'">
              <Tag :color="record.active === false ? 'default' : 'success'">
                {{ record.active === false ? '停用' : '启用' }}
              </Tag>
            </template>
            <template v-else-if="column.key === 'enabled'">
              {{ record.enabled === false ? '隐藏' : '显示' }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <Space :size="8">
                <RouterLink
                  v-if="record.id != null"
                  class="text-primary"
                  :to="{ path: '/caiwu/journal', query: { bankAccountId: record.id, bankAccountName: record.name } }"
                >
                  查看流水
                </RouterLink>
                <template v-if="canManage">
                  <Button type="link" size="small" class="px-0" @click="dialog?.show(record as Api.Account)">修改</Button>
                  <Popconfirm
                    title="删除这个账户？已使用的账户可在修改里停用。"
                    ok-text="删除"
                    ok-type="danger"
                    @confirm="removeAccount(record as Api.Account)"
                  >
                    <Button type="link" size="small" danger class="px-0">删除</Button>
                  </Popconfirm>
                </template>
              </Space>
            </template>
          </template>
        </Table>
      </Tabs.TabPane>
      <Tabs.TabPane key="balance" tab="账户余额">
        <BalancePanel
          ref="balancePanel"
          :can-manage="canManage"
          :filters="filters"
          :hidden-accounts="hiddenAccounts"
          @edit="editBalanceRow"
          @edit-hidden="dialog?.show($event)"
        />
      </Tabs.TabPane>
    </Tabs>

    <AccountDialog ref="dialog" :companies="companies" @saved="refresh" />
  </Page>
</template>
