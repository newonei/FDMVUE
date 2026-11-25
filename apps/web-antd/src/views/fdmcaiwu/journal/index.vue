<script setup lang="ts">
import type { FdmcaiwuJournalApi as Api } from '#/api/fdmcaiwu/journal';

import { computed, onActivated, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { Button, Tabs } from 'ant-design-vue';

import { getJournalOptions } from '#/api/fdmcaiwu/journal';
import { getDataCompanySimpleList } from '#/api/fdmdata/datacompany';

import EntryForm from './modules/entry-form.vue';
import EntryList from './modules/entry-list.vue';
import ImportDialog from './modules/import-dialog.vue';
import SummaryPanel from './modules/summary-panel.vue';

defineOptions({ name: 'FdmcaiwuJournal' });

const route = useRoute();
const router = useRouter();
const activeTab = ref<'EXPENSE' | 'INCOME' | 'SUMMARY'>('INCOME');
const linkedAccount = computed(() => {
  const raw = route.query.bankAccountId;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return undefined;
  const id = Number(raw);
  const name = route.query.bankAccountName;
  if (!Number.isSafeInteger(id) || id <= 0) return undefined;
  return { id, name: typeof name === 'string' ? name : undefined };
});
const options = ref<Record<Api.Direction, Api.Options | undefined>>({
  EXPENSE: undefined,
  INCOME: undefined,
});
/** 公司主体里的全称 + 以前填过的名称（导入时可能是简称或主体里没有的公司） */
const companyNames = ref<string[]>([]);
const formRef = ref<InstanceType<typeof EntryForm>>();
const formDirection = ref<Api.Direction>('INCOME');
const importOpen = ref(false);
const incomeList = ref<InstanceType<typeof EntryList>>();
const expenseList = ref<InstanceType<typeof EntryList>>();
const summaryPanel = ref<InstanceType<typeof SummaryPanel>>();

let optionsRequest = 0;
async function loadOptions() {
  const request = ++optionsRequest;
  const [income, expense] = await Promise.all([
    getJournalOptions('INCOME'),
    getJournalOptions('EXPENSE'),
  ]);
  if (request !== optionsRequest) return;
  options.value = { EXPENSE: expense, INCOME: income };
  companyNames.value = [
    ...new Set([
      ...companyNames.value,
      ...income.companyNames,
      ...expense.companyNames,
    ]),
  ];
}

onMounted(async () => {
  try {
    const companies = await getDataCompanySimpleList();
    companyNames.value = companies
      .map((company) => company.companyName)
      .filter((name): name is string => Boolean(name));
  } catch {
    // 公司主体读不到时只用填过的名称
  }
  await loadOptions();
});
onActivated(() => {
  if (options.value.INCOME) void loadOptions();
});

function openForm(data: Api.Direction | Api.SaveReq) {
  formDirection.value = typeof data === 'string' ? data : data.direction;
  formRef.value?.show(data);
}

function refresh() {
  incomeList.value?.reload();
  expenseList.value?.reload();
  summaryPanel.value?.reload();
  loadOptions();
}
</script>

<template>
  <Page>
    <header class="mb-1 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h1 class="mb-1 text-xl font-semibold tracking-tight">日记账</h1>
        <p class="mb-0 text-sm text-muted-foreground">
          逐笔登记收入和支出，关联银行或私账账户，按月查看收支。
        </p>
      </div>
      <Button @click="router.push({ path: '/caiwu/bank-accounts', query: { tab: 'balance' } })">
        账户余额
      </Button>
    </header>
    <Tabs v-model:active-key="activeTab">
      <Tabs.TabPane key="INCOME" tab="收入">
        <EntryList
          ref="incomeList"
          direction="INCOME"
          :options="options.INCOME"
          :linked-account="linkedAccount"
          :company-names="companyNames"
          @edit="openForm"
          @import="importOpen = true"
          @changed="refresh"
        />
      </Tabs.TabPane>
      <Tabs.TabPane key="EXPENSE" tab="支出">
        <EntryList
          ref="expenseList"
          direction="EXPENSE"
          :options="options.EXPENSE"
          :linked-account="linkedAccount"
          :company-names="companyNames"
          @edit="openForm"
          @import="importOpen = true"
          @changed="refresh"
        />
      </Tabs.TabPane>
      <Tabs.TabPane key="SUMMARY" tab="收支汇总">
        <SummaryPanel ref="summaryPanel" :company-names="companyNames" />
      </Tabs.TabPane>
    </Tabs>

    <EntryForm
      ref="formRef"
      :options="options[formDirection]"
      :company-names="companyNames"
      @saved="refresh"
    />
    <ImportDialog v-model:open="importOpen" @imported="refresh" />
  </Page>
</template>
