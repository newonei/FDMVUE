<script lang="ts" setup>
import type { FdmgongchangFactorySettingApi as Api } from '#/api/fdmgongchang/factory';

import { computed, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Checkbox,
  InputNumber,
  message,
  Radio,
  Result,
  Spin,
  Tabs,
  Tag,
} from 'ant-design-vue';

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
 * - AI 排单：本厂排单用哪个模型，只能选 AI 网关已给本厂放行的模型；
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
const activeTab = ref<'ai' | 'processes' | 'wage'>('processes');

const factory = useFactory();
const setting = ref<Api.Setting>();
const enabled = ref<string[]>([]);
/** 工序日产能（产出单位 / 天），AI 排单在没有历史产出时参考。 */
const capacities = ref<Record<string, null | number>>({});
const savedCapacity = (code: string) => {
  const v = setting.value?.processes.find((p) => p.code === code)?.dailyCapacity;
  return v === null || v === undefined || v === '' ? null : Number(v);
};
/** 选的排单模型，'' 表示自动。模型编号是长整数，按字符串比较避免精度问题。 */
const modelId = ref('');
const savedModelId = computed(() =>
  setting.value?.scheduleModelId === null || setting.value?.scheduleModelId === undefined
    ? ''
    : String(setting.value.scheduleModelId),
);
const models = computed(() => setting.value?.scheduleModels ?? []);
const autoModel = computed(() => models.value.find((m) => m.allowed));
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
    saved.some((code) => !enabled.value.includes(code)) ||
    (setting.value?.processes ?? []).some(
      (p) => (capacities.value[p.code] ?? null) !== savedCapacity(p.code),
    ) ||
    modelId.value !== savedModelId.value
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
    capacities.value = Object.fromEntries(
      setting.value.processes.map((p) => [p.code, savedCapacity(p.code)]),
    );
    modelId.value = savedModelId.value;
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
      dailyCapacities: Object.fromEntries(
        order.map((code) => [code, capacities.value[code] ?? null]),
      ),
      enabledProcesses: order.filter((code) => enabled.value.includes(code)),
      scheduleModelId: modelId.value || null,
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
          v-if="canEdit && setting && activeTab !== 'wage'"
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
            class="grid grid-cols-1 gap-2 md:grid-cols-2"
          >
            <div
              v-for="p in setting?.processes ?? []"
              :key="p.code"
              class="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <Checkbox :value="p.code">
                {{ p.label }}
                <span class="text-xs text-muted-foreground">产出{{ p.outputStageLabel }}</span>
              </Checkbox>
              <label
                :for="`capacity-${p.code}`"
                class="flex items-center gap-1 text-xs text-muted-foreground"
              >
                日产能
                <InputNumber
                  :id="`capacity-${p.code}`"
                  :disabled="!canEdit || !enabled.includes(p.code)"
                  :min="0"
                  :precision="0"
                  :value="capacities[p.code] ?? undefined"
                  class="w-28"
                  placeholder="选填"
                  size="small"
                  @change="
                    (v) =>
                      (capacities[p.code] =
                        (v as null | number | undefined) ?? null)
                  "
                />
                {{ p.outputUnit }}/天
              </label>
            </div>
          </Checkbox.Group>
          <p class="m-0 text-xs text-muted-foreground">
            日产能是这道工序整个车间一天大概能做多少，AI 排单时用来控制每天的量；不填时按最近 14 天的实际产出估算。
          </p>
        </section>
      </Spin>
          </Tabs.TabPane>
          <Tabs.TabPane key="ai" tab="AI 排单">
            <section class="flex flex-col gap-3">
              <h2 class="m-0 text-sm font-semibold">
                排单模型<span class="ml-2 text-xs font-normal text-muted-foreground">生成排单方案时用哪个 AI 模型；只有 AI 网关已给本厂放行「工厂排单」用途的模型才能选</span>
              </h2>
              <Alert
                v-if="models.length === 0"
                message="AI 网关里还没有可用的文本模型，请先让 AI 网关管理员接入模型。"
                show-icon
                type="warning"
              />
              <Radio.Group
                v-else
                id="factory-schedule-model"
                v-model:value="modelId"
                :disabled="!canEdit"
                class="flex flex-col gap-2"
              >
                <Radio value="" class="rounded-md border border-border px-3 py-2">
                  自动
                  <span class="text-xs text-muted-foreground">
                    {{ autoModel ? `现在用 ${autoModel.name}` : '本厂还没有放行的模型' }}
                  </span>
                </Radio>
                <Radio
                  v-for="m in models"
                  :key="m.id"
                  :disabled="!m.allowed && String(m.id) !== savedModelId"
                  :value="String(m.id)"
                  class="rounded-md border border-border px-3 py-2"
                >
                  {{ m.name }}
                  <span class="text-xs text-muted-foreground">{{ m.code }}</span>
                  <Tag v-if="!m.allowed" class="ml-2" color="orange">未给本厂放行</Tag>
                  <Tag v-else-if="m.structured" class="ml-2" color="green">结构化输出</Tag>
                </Radio>
              </Radio.Group>
              <p class="m-0 text-xs text-muted-foreground">
                想用新的模型：先在「模型中心」接入服务商和文本模型，再由 AI 管理员给本厂放行「工厂排单」用途（FDM_GONGCHANG_SCHEDULE，INTERNAL），这里就能选了。
                选的模型以后不再放行时，自动改用第一个放行的模型。
              </p>
            </section>
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
