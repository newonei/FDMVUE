<script lang="ts" setup>
import type { FdmgongchangFactorySettingApi as Api } from '#/api/fdmgongchang/factory';

import { computed, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { Button, Checkbox, message, Result, Spin, Tabs } from 'ant-design-vue';

import {
  getFactorySetting,
  saveFactorySetting,
} from '#/api/fdmgongchang/factory';

import FactorySwitch from '../shared/factory-switch.vue';
import { useFactory } from '../shared/use-factory';
import WageItemPanel from './modules/wage-item-panel.vue';

/**
 * 工厂部门 · 工厂设置：各厂自己的配置集中在这里。
 * - 本厂工序：各厂工序不一样，没勾的工序不会出现在开单、生产链和人员岗位里；
 * - 计价项目：本厂的计件、计时、杂活、补助价格（单独权限，普通人员看不到）。
 */
defineOptions({ name: 'FdmGongchangFactorySetting' });

const { hasAccessByCodes } = useAccess();
const canEdit = computed(() =>
  hasAccessByCodes(['fdmgongchang:factory-setting:update']),
);
const canSeeWage = computed(() =>
  hasAccessByCodes(['fdmgongchang:wage-item:query']),
);
const activeTab = ref<'processes' | 'wage'>('processes');

const factory = useFactory();
const setting = ref<Api.Setting>();
const enabled = ref<string[]>([]);
const loading = ref(false);
const saving = ref(false);
const loadError = ref(false);
const noFactory = ref(false);

const dirty = computed(() => {
  const saved = (setting.value?.processes ?? [])
    .filter((p) => p.enabled)
    .map((p) => p.code);
  return (
    saved.length !== enabled.value.length ||
    saved.some((code) => !enabled.value.includes(code))
  );
});

async function load() {
  loadError.value = false;
  noFactory.value = false;
  loading.value = true;
  try {
    if (!factory.loaded.value) await factory.load();
    if (factory.factoryId.value === null) {
      noFactory.value = true;
      return;
    }
    setting.value = await getFactorySetting();
    enabled.value = setting.value.processes
      .filter((p) => p.enabled)
      .map((p) => p.code);
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function switchFactory(id: number) {
  if (id === factory.factoryId.value) return;
  factory.select(id);
  setting.value = undefined;
  await load();
}

async function save() {
  if (enabled.value.length === 0) {
    message.warning('本厂至少要启用一道工序');
    return;
  }
  saving.value = true;
  try {
    const order = (setting.value?.processes ?? []).map((p) => p.code);
    await saveFactorySetting({
      enabledProcesses: order.filter((code) => enabled.value.includes(code)),
    });
    message.success(`${factory.current.value?.name ?? '本厂'}的工厂设置已保存`);
    await load();
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Page>
    <div class="flex flex-col gap-4">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h1 class="m-0 text-xl font-semibold tracking-tight">工厂设置</h1>
            <FactorySwitch
              v-if="factory.factories.value.length > 0"
              :factories="factory.factories.value"
              :value="factory.factoryId.value"
              @change="switchFactory"
            />
          </div>
          <p class="m-0 mt-1 text-sm text-muted-foreground">
            每家工厂自己的配置集中在这里，改动只影响当前工厂。
          </p>
        </div>
        <Button
          v-if="canEdit && setting && activeTab === 'processes'"
          :disabled="!dirty"
          :loading="saving"
          type="primary"
          @click="save"
        >
          保存设置
        </Button>
      </header>

      <Result v-if="noFactory" status="info" title="你的账号还不属于任何工厂">
        <template #subTitle>
          请在钉钉里把你调到所在工厂的部门，或联系管理员分配「查看全部工厂」权限。
        </template>
      </Result>
      <Result
        v-else-if="loadError"
        status="warning"
        title="工厂设置没有加载出来"
      >
        <template #subTitle>
          可能是网络问题，或者还没有分配「工厂设置」的查看权限。
        </template>
        <template #extra>
          <Button type="primary" @click="load">重新加载</Button>
        </template>
      </Result>

      <section
        v-else
        :key="factory.factoryId.value ?? 0"
        class="rounded-lg border border-border bg-card px-4 pb-4"
      >
        <Tabs v-model:active-key="activeTab">
          <Tabs.TabPane key="processes" tab="本厂工序">
      <Spin :spinning="loading">
        <section class="flex flex-col gap-3">
          <h2 class="m-0 text-sm font-semibold">
            本厂工序<span
              class="ml-2 text-xs font-normal text-muted-foreground"
              >没勾的工序不会出现在开单、生产链和人员岗位里；少了某道工序时，下道工序自动改从更上游领料</span>
          </h2>
          <Checkbox.Group
            id="factory-processes"
            v-model:value="enabled"
            :disabled="!canEdit"
            class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Checkbox
              v-for="p in setting?.processes ?? []"
              :key="p.code"
              :value="p.code"
            >
              {{ p.label }}
              <span class="text-xs text-muted-foreground">产出{{ p.outputStageLabel }}</span>
            </Checkbox>
          </Checkbox.Group>
        </section>
      </Spin>
          </Tabs.TabPane>
          <Tabs.TabPane v-if="canSeeWage && setting" key="wage" tab="计价项目">
            <WageItemPanel
              :processes="
                setting.processes.map((p) => ({ code: p.code, label: p.label }))
              "
            />
          </Tabs.TabPane>
        </Tabs>
      </section>
    </div>
  </Page>
</template>
