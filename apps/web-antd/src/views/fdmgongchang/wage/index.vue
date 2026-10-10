<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { Button, DatePicker, Result, Tabs } from 'ant-design-vue';
import dayjs from 'dayjs';

import FactorySwitch from '../shared/factory-switch.vue';
import { useFactory } from '../shared/use-factory';
import RecordPanel from './modules/record-panel.vue';
import SummaryPanel from './modules/summary-panel.vue';

/**
 * 工厂部门 · 计件工资：工序计件跟工序单报产出带出，计时、杂活、补助由班组长在这里登记；
 * 确认后按月汇总、结算。价格在「工厂设置 → 计价项目」里维护。
 */
defineOptions({ name: 'FdmGongchangWage' });

const factory = useFactory();
const month = ref<Dayjs>(dayjs());
const tab = ref<'records' | 'summary'>('records');
const refreshKey = ref(0);
const noFactory = ref(false);
const loadError = ref(false);
const ready = ref(false);

async function load() {
  loadError.value = false;
  noFactory.value = false;
  try {
    if (!factory.loaded.value) await factory.load();
    noFactory.value = factory.factoryId.value === null;
    ready.value = !noFactory.value;
  } catch {
    loadError.value = true;
  }
}
onMounted(load);

function switchFactory(id: number) {
  if (id === factory.factoryId.value) return;
  factory.select(id);
  refreshKey.value += 1;
}

const monthText = () => month.value.format('YYYY-MM');
</script>

<template>
  <Page>
    <div class="flex flex-col gap-4">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h1 class="m-0 text-xl font-semibold tracking-tight">计件工资</h1>
            <FactorySwitch
              v-if="factory.factories.value.length > 0"
              :factories="factory.factories.value"
              :value="factory.factoryId.value"
              @change="switchFactory"
            />
          </div>
          <p class="m-0 mt-1 text-sm text-muted-foreground">
            工序计件在工序单报产出时带出；计时、杂活、补助在这里登记。班组长确认后按月结算。
          </p>
        </div>
        <label for="wage-month" class="flex items-center gap-2 text-sm text-muted-foreground">
          月份
          <DatePicker id="wage-month" v-model:value="month" :allow-clear="false" picker="month" />
        </label>
      </header>

      <Result v-if="noFactory" status="info" title="你的账号还不属于任何工厂">
        <template #subTitle>请在钉钉里把你调到所在工厂的部门，或联系管理员分配「查看全部工厂」权限。</template>
      </Result>
      <Result v-else-if="loadError" status="warning" title="计件工资没有加载出来">
        <template #extra>
          <Button type="primary" @click="load">重新加载</Button>
        </template>
      </Result>
      <section
        v-else-if="ready"
        :key="factory.factoryId.value ?? 0"
        class="rounded-lg border border-border bg-card px-4 pb-4"
      >
        <Tabs v-model:active-key="tab">
          <Tabs.TabPane key="records" tab="报工登记">
            <RecordPanel :month="monthText()" :refresh-key="refreshKey" @changed="refreshKey += 1" />
          </Tabs.TabPane>
          <Tabs.TabPane key="summary" tab="月度汇总">
            <SummaryPanel :month="monthText()" :refresh-key="refreshKey" @changed="refreshKey += 1" />
          </Tabs.TabPane>
        </Tabs>
      </section>
    </div>
  </Page>
</template>
