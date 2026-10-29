<script setup lang="ts">
import type { FdmcaiwuJournalApi as Api } from '#/api/fdmcaiwu/journal';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { Tabs } from 'ant-design-vue';

import { getJournalOptions } from '#/api/fdmcaiwu/journal';
import { getDataCompanySimpleList } from '#/api/fdmdata/datacompany';

import EntryForm from './modules/entry-form.vue';
import EntryList from './modules/entry-list.vue';
import ImportDialog from './modules/import-dialog.vue';
import SummaryPanel from './modules/summary-panel.vue';

defineOptions({ name: 'FdmcaiwuJournal' });

const activeTab = ref<'EXPENSE' | 'INCOME' | 'SUMMARY'>('INCOME');
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

async function loadOptions() {
  const [income, expense] = await Promise.all([
    getJournalOptions('INCOME'),
    getJournalOptions('EXPENSE'),
  ]);
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
    <header class="mb-1">
      <h1 class="mb-1 text-xl font-semibold tracking-tight">日记账</h1>
      <p class="mb-0 text-sm text-muted-foreground">
        逐笔登记公司收入、支出；外币按汇率中心自动折人民币，按月份汇总各账户、经手人、部门的收支。
      </p>
    </header>
    <Tabs v-model:active-key="activeTab">
      <Tabs.TabPane key="INCOME" tab="收入">
        <EntryList
          ref="incomeList"
          direction="INCOME"
          :options="options.INCOME"
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
