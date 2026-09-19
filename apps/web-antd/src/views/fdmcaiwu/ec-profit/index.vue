<script setup lang="ts">
import { ref } from 'vue';
import { Page } from '@vben/common-ui';
import { Tabs } from 'ant-design-vue';
import dayjs from 'dayjs';
import GroupSettings from './modules/group-settings.vue';
import MonthlyWorkspace from './modules/monthly-workspace.vue';
import YearGroups from './modules/year-groups.vue';

defineOptions({ name: 'FdmcaiwuEcProfit' });
const activeTab = ref('month');
const month = ref(dayjs().format('YYYY-MM'));
const groupKey = ref<string>();
const configRevision = ref(0);
function locateGroup(value: { month: string; key: string }) {
  month.value = value.month;
  groupKey.value = value.key;
  activeTab.value = 'month';
}
</script>

<template>
  <Page>
    <div class="space-y-5 py-2">
      <header>
        <div
          class="mb-2 text-xs font-medium tracking-widest text-muted-foreground"
        >
          财务管理 / 电商经营
        </div>
        <h1 class="mb-2 text-2xl font-semibold tracking-tight">电商毛利表</h1>
        <p class="mb-0 text-sm text-muted-foreground">
          按部门、小组与店铺查看月度毛利，保留每月核算归属。
        </p>
      </header>
      <Tabs v-model:active-key="activeTab" destroy-inactive-tab-pane>
        <Tabs.TabPane key="month" tab="月度毛利">
          <MonthlyWorkspace
            v-model:month="month"
            :focus-group-key="groupKey"
            :config-revision="configRevision"
            @configured="activeTab = 'settings'"
            @clear-focus="groupKey = undefined"
          />
        </Tabs.TabPane>
        <Tabs.TabPane key="year" tab="年度小组对比"
          ><YearGroups
            :default-year="Number(month.slice(0, 4))"
            @locate="locateGroup"
        /></Tabs.TabPane>
        <Tabs.TabPane key="settings" tab="小组与店铺配置"
          ><GroupSettings :default-month="month" @changed="configRevision++"
        /></Tabs.TabPane>
      </Tabs>
    </div>
  </Page>
</template>
