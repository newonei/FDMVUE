<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { Spin, Tabs } from 'ant-design-vue';
import dayjs from 'dayjs';

import { getEcProfitYear } from '#/api/fdmcaiwu/ec-profit';

import GroupSettings from './modules/group-settings.vue';
import MonthlyWorkspace from './modules/monthly-workspace.vue';
import YearGroups from './modules/year-groups.vue';

import './viz.css';

defineOptions({ name: 'FdmcaiwuEcProfit' });
const activeTab = ref('month');
const month = ref<string>();
const groupKey = ref<string>();
const configRevision = ref(0);

/** 默认打开最近一个已建单的月份：当月月报通常次月才建，直接落在空白月体验很差。 */
onMounted(async () => {
  const today = dayjs();
  try {
    for (const year of [today.year(), today.year() - 1]) {
      const reports = await getEcProfitYear(year);
      const latest = reports
        .map((report) => report.month)
        .filter((value) => value <= today.format('YYYY-MM'))
        .sort()
        .at(-1);
      if (latest) {
        month.value = latest;
        return;
      }
    }
  } catch {
    // 回退到当月
  }
  month.value = today.format('YYYY-MM');
});

function locate(value: { key?: string; month: string }) {
  month.value = value.month;
  groupKey.value = value.key;
  activeTab.value = 'month';
}
</script>

<template>
  <Page>
    <div class="py-1">
      <header class="mb-1">
        <h1 class="mb-1 text-xl font-semibold tracking-tight">电商毛利表</h1>
        <p class="mb-0 text-sm text-muted-foreground">
          按部门、分组与店铺查看每月毛利，保留每月核算归属。
        </p>
      </header>
      <div v-if="!month" class="flex h-60 items-center justify-center"><Spin /></div>
      <Tabs v-else v-model:active-key="activeTab" destroy-inactive-tab-pane>
        <Tabs.TabPane key="month" tab="月度毛利">
          <MonthlyWorkspace
            v-model:month="month"
            :focus-group-key="groupKey"
            :config-revision="configRevision"
            @configured="activeTab = 'settings'"
            @clear-focus="groupKey = undefined"
          />
        </Tabs.TabPane>
        <Tabs.TabPane key="year" tab="年度对比">
          <YearGroups :default-year="Number(month.slice(0, 4))" @locate="locate" />
        </Tabs.TabPane>
        <Tabs.TabPane key="settings" tab="电商分组配置">
          <GroupSettings :default-month="month" @changed="configRevision++" />
        </Tabs.TabPane>
      </Tabs>
    </div>
  </Page>
</template>
