<script lang="ts" setup>
import type {
  FdmgongchangFactorySettingApi as Api,
  FdmgongchangCustomProcess,
} from '#/api/fdmgongchang/factory';

import { computed, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Checkbox,
  Input,
  InputNumber,
  message,
  Radio,
  Result,
  Spin,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  getCustomProcesses,
  getFactorySetting,
  saveFactorySetting,
} from '#/api/fdmgongchang/factory';

import FactorySwitch from '../shared/factory-switch.vue';
import { useFactory } from '../shared/use-factory';
import CustomProcessPanel from './modules/custom-process-panel.vue';
import RoutePanel from './modules/route-panel.vue';
import StandingPanel from './modules/standing-panel.vue';
import SupplierPanel from './modules/supplier-panel.vue';
import WageItemPanel from './modules/wage-item-panel.vue';

/**
 * 工厂部门 · 工厂设置：各厂自己的配置集中在这里。
 * - 本厂工序：各厂工序不一样，没勾的工序不会出现在开单、生产链和人员岗位里；
 *   附加工序（打孔、全检等，不改变规格）也在这里新建、停用；
 * - 工艺路线：本厂常用的工序组合，下单人向工厂下单时选用并按产品调整；
 * - AI 排单：本厂排单用哪个模型，只能选 AI 网关已给本厂放行的模型；
 * - 对应供应商：采购单的供应商是这些公司时自动生成工厂订单；
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
const activeTab = ref<'ai' | 'processes' | 'routes' | 'suppliers' | 'wage'>('processes');

const factory = useFactory();
const setting = ref<Api.Setting>();
const enabled = ref<string[]>([]);
/** 工序产能：台数 × 单台每天下限~上限；AI 按订单难度在范围里估计，下发时按上限硬校验。 */
const CAPACITY_FIELDS = ['machines', 'min', 'max', 'crewMin', 'crewMax'] as const;
const capacities = ref<Record<string, Api.Capacity>>({});
const toNumber = (v: null | number | string | undefined) =>
  v === null || v === undefined || v === '' ? null : Number(v);
const savedCapacity = (code: string): Api.Capacity => {
  const p = setting.value?.processes.find((x) => x.code === code);
  return {
    crewMax: toNumber(p?.crewMax),
    crewMin: toNumber(p?.crewMin),
    machines: toNumber(p?.machines),
    max: toNumber(p?.capacityMax),
    min: toNumber(p?.capacityMin),
  };
};
/** 整道工序每天的范围，例如「4000~4800」。 */
function dailyRange(code: string) {
  const c = capacities.value[code];
  if (!c?.max) return '';
  const n = c.machines ?? 1;
  const lo = (c.min ?? c.max) * n;
  const hi = c.max * n;
  return lo === hi ? `${hi}` : `${lo}~${hi}`;
}
/** 每台几人，例如「2~3」；两头都填了才是范围。 */
function crewText(code: string) {
  const c = capacities.value[code];
  if (!c?.machines || (c.crewMin === null && c.crewMax === null)) return '';
  if (c.crewMin === null) return `最多 ${c.crewMax}`;
  if (c.crewMax === null) return `至少 ${c.crewMin}`;
  return c.crewMin === c.crewMax ? `${c.crewMin}` : `${c.crewMin}~${c.crewMax}`;
}
/** 发泡出板规格（cm）和每锅出几张，AI 排单用来把原料换算成板材、再换算成成品。 */
const MIX_FIELDS = ['length', 'width', 'thickness', 'boardsPerBatch'] as const;
type MixField = (typeof MIX_FIELDS)[number];
const mixBoard = ref<Record<MixField, null | number>>({ boardsPerBatch: null, length: null, thickness: null, width: null });
const savedMix = (key: MixField) => {
  const v = setting.value?.mixBoard?.[key];
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
/** 提生产需求时 AI 识别附件的默认提示词；提需求的人每次还能当场改。 */
const fillPrompt = ref('');
const savedFillPrompt = computed(() => setting.value?.demandFillPrompt ?? '');
const autoModel = computed(() => models.value.find((m) => m.allowed));
const loading = ref(false);
const saving = ref(false);
/** 附加工序（含停用的）。 */
const customs = ref<FdmgongchangCustomProcess[]>([]);
/** 附加工序改了以后让工艺路线重新取可选工序。 */
const routeKey = ref(0);
/** 库存阶段（板材起）：附加工序挂在其中一个之后。 */
const stages = computed(() =>
  (setting.value?.processes ?? []).map((p) => ({ code: p.outputStage, label: p.outputStageLabel })),
);
/** 所有工序名称（主干 + 附加），路线和计价项目里显示用。 */
const allProcesses = computed(() => [
  ...(setting.value?.processes ?? []).map((p) => ({ code: p.code, label: p.label })),
  ...customs.value.map((c) => ({ code: c.code ?? '', label: `${c.name}（附加）` })),
]);

async function loadCustoms() {
  try {
    customs.value = await getCustomProcesses();
  } catch {
    customs.value = [];
  }
}

async function onCustomsChanged() {
  await loadCustoms();
  routeKey.value += 1;
}
const loadError = ref(false);
const noFactory = ref(false);

const dirty = computed(() => {
  const saved = (setting.value?.processes ?? [])
    .filter((p) => p.enabled)
    .map((p) => p.code);
  return (
    saved.length !== enabled.value.length ||
    saved.some((code) => !enabled.value.includes(code)) ||
    (setting.value?.processes ?? []).some((p) =>
      CAPACITY_FIELDS.some(
        (k) => (capacities.value[p.code]?.[k] ?? null) !== savedCapacity(p.code)[k],
      ),
    ) ||
    modelId.value !== savedModelId.value ||
    fillPrompt.value.trim() !== savedFillPrompt.value.trim() ||
    MIX_FIELDS.some((k) => mixBoard.value[k] !== savedMix(k))
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
    [setting.value] = await Promise.all([getFactorySetting(), loadCustoms()]);
    enabled.value = setting.value.processes
      .filter((p) => p.enabled)
      .map((p) => p.code);
    capacities.value = Object.fromEntries(
      setting.value.processes.map((p) => [p.code, savedCapacity(p.code)]),
    );
    modelId.value = savedModelId.value;
    fillPrompt.value = savedFillPrompt.value;
    mixBoard.value = Object.fromEntries(MIX_FIELDS.map((k) => [k, savedMix(k)])) as Record<MixField, null | number>;
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
  const sizes = [mixBoard.value.length, mixBoard.value.width, mixBoard.value.thickness];
  if (sizes.some((v) => v !== null) && sizes.some((v) => !(v && v > 0))) {
    message.warning('发泡出板规格的长、宽、厚要一起填');
    return;
  }
  const badRange = (setting.value?.processes ?? []).find((p) => {
    const c = capacities.value[p.code];
    return c && ((c.min !== null && !c.max) || (c.min !== null && c.max !== null && c.min > c.max));
  });
  if (badRange) {
    message.warning(`${badRange.label}的产能下限不能大于上限，填了下限也要填上限`);
    return;
  }
  const badCrew = (setting.value?.processes ?? []).find((p) => {
    const c = capacities.value[p.code];
    return c && c.crewMin !== null && c.crewMax !== null && c.crewMin > c.crewMax;
  });
  if (badCrew) {
    message.warning(`${badCrew.label}每台最少人数不能大于最多人数`);
    return;
  }
  saving.value = true;
  try {
    const order = (setting.value?.processes ?? []).map((p) => p.code);
    await saveFactorySetting({
      capacities: Object.fromEntries(
        order.map((code) => {
          const c = capacities.value[code];
          // 没填台数时每台人数没有意义，不保存
          return [code, c?.max ? { ...c, ...(c.machines ? {} : { crewMax: null, crewMin: null }) } : null];
        }),
      ),
      enabledProcesses: order.filter((code) => enabled.value.includes(code)),
      mixBoard: { ...mixBoard.value },
      scheduleModelId: modelId.value || null,
      ...(fillPrompt.value.trim() === savedFillPrompt.value.trim() ? {} : { demandFillPrompt: fillPrompt.value.trim() }),
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
          v-if="canEdit && setting && activeTab !== 'wage' && activeTab !== 'routes'"
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
            class="grid grid-cols-1 gap-2 xl:grid-cols-2"
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
              <div class="flex flex-wrap items-center justify-end gap-1 text-xs text-muted-foreground">
                <label :for="`capacity-machines-${p.code}`">{{ p.code === 'PACK' ? '流水线' : '台数' }}</label>
                <InputNumber
                  :id="`capacity-machines-${p.code}`"
                  :disabled="!canEdit || !enabled.includes(p.code)"
                  :min="1"
                  :max="100"
                  :precision="0"
                  :value="capacities[p.code]?.machines ?? undefined"
                  :style="{ width: '4rem' }"
                  placeholder="选填"
                  size="small"
                  @change="(v) => (capacities[p.code]!.machines = (v as null | number | undefined) ?? null)"
                />
                <label :for="`capacity-min-${p.code}`">{{ capacities[p.code]?.machines ? '× 单台' : '每天' }}</label>
                <InputNumber
                  :id="`capacity-min-${p.code}`"
                  :aria-label="`${p.label}产能下限`"
                  :disabled="!canEdit || !enabled.includes(p.code)"
                  :min="0"
                  :precision="0"
                  :value="capacities[p.code]?.min ?? undefined"
                  :style="{ width: '5.5rem' }"
                  placeholder="下限"
                  size="small"
                  @change="(v) => (capacities[p.code]!.min = (v as null | number | undefined) ?? null)"
                />
                ~
                <InputNumber
                  :id="`capacity-max-${p.code}`"
                  :aria-label="`${p.label}产能上限`"
                  :disabled="!canEdit || !enabled.includes(p.code)"
                  :min="0"
                  :precision="0"
                  :value="capacities[p.code]?.max ?? undefined"
                  :style="{ width: '5.5rem' }"
                  placeholder="上限"
                  size="small"
                  @change="(v) => (capacities[p.code]!.max = (v as null | number | undefined) ?? null)"
                />
                {{ p.capacityUnit ?? p.outputUnit }}{{ p.code === 'SLICE' ? '板材' : '' }}/天
                <template v-if="capacities[p.code]?.machines">
                  <label :for="`capacity-crew-min-${p.code}`" class="ml-2">{{ p.code === 'PACK' ? '每条线' : '每台' }}</label>
                  <InputNumber
                    :id="`capacity-crew-min-${p.code}`"
                    :aria-label="`${p.label}每台最少人数`"
                    :disabled="!canEdit || !enabled.includes(p.code)"
                    :min="1"
                    :max="100"
                    :precision="0"
                    :value="capacities[p.code]?.crewMin ?? undefined"
                    :style="{ width: '3.5rem' }"
                    placeholder="最少"
                    size="small"
                    @change="(v) => (capacities[p.code]!.crewMin = (v as null | number | undefined) ?? null)"
                  />
                  ~
                  <InputNumber
                    :id="`capacity-crew-max-${p.code}`"
                    :aria-label="`${p.label}每台最多人数`"
                    :disabled="!canEdit || !enabled.includes(p.code)"
                    :min="1"
                    :max="100"
                    :precision="0"
                    :value="capacities[p.code]?.crewMax ?? undefined"
                    :style="{ width: '3.5rem' }"
                    placeholder="最多"
                    size="small"
                    @change="(v) => (capacities[p.code]!.crewMax = (v as null | number | undefined) ?? null)"
                  />
                  人
                </template>
                <span v-if="capacities[p.code]?.machines && dailyRange(p.code)" class="w-full text-right">
                  合计 {{ dailyRange(p.code) }}{{ p.capacityUnit ?? p.outputUnit }}/天<template v-if="crewText(p.code)">，一台 {{ crewText(p.code) }} 人</template>
                </span>
              </div>
            </div>
          </Checkbox.Group>
          <p class="m-0 text-xs text-muted-foreground">
            产能填一台机器一天能做多少，有几台填台数（没有机器的工序不填台数，直接填整道工序一天的量）。
            填了台数的工序 AI 按机台派人：一台机当天的规格派给同一组人（人数按「每台几人」），一台做得完就只开一台。
            快慢看产品难度时填下限和上限，AI 按订单难度在范围里估计；下发时按「上限 × 台数」硬校验，超了拒绝。
            开片按每天投入的板材张数填，其他工序 1 条 = 1 片/1 件。不填时 AI 按最近 14 天的实际产出估算。
          </p>
          <h2 class="m-0 mt-2 text-sm font-semibold">
            发泡出板规格<span class="ml-2 text-xs font-normal text-muted-foreground">AI 排单用它把原料换算成板材、再换算成能出几条成品</span>
          </h2>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <label
              v-for="f in [
                { key: 'length', label: '长', unit: 'cm' },
                { key: 'width', label: '宽', unit: 'cm' },
                { key: 'thickness', label: '厚', unit: 'cm' },
                { key: 'boardsPerBatch', label: '每锅出', unit: '张（选填）' },
              ] as const"
              :key="f.key"
              :for="`mix-board-${f.key}`"
              class="flex items-center gap-1"
            >
              {{ f.label }}
              <InputNumber
                :id="`mix-board-${f.key}`"
                :disabled="!canEdit"
                :min="0"
                :value="mixBoard[f.key] ?? undefined"
                :style="{ width: '6rem' }"
                size="small"
                @change="(v) => (mixBoard[f.key] = (v as null | number | undefined) ?? null)"
              />
              {{ f.unit }}
            </label>
          </div>
          <p class="m-0 text-xs text-muted-foreground">
            每锅出几张不填时，按配方一锅的重量 × 出材率 ÷（板材体积 × 配方密度）估算。
          </p>
        </section>
        <CustomProcessPanel
          class="mt-6"
          :can-edit="canEdit"
          :list="customs"
          :stages="stages"
          @changed="onCustomsChanged"
        />
      </Spin>
          </Tabs.TabPane>
          <Tabs.TabPane v-if="setting" key="routes" tab="工艺路线">
            <RoutePanel :key="routeKey" :can-edit="canEdit" :processes="allProcesses" />
          </Tabs.TabPane>
          <Tabs.TabPane key="ai" tab="AI 设置">
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
            <section v-if="setting" class="mt-6 flex flex-col gap-2">
              <h2 class="m-0 text-sm font-semibold">
                识别需求的默认提示词<span class="ml-2 text-xs font-normal text-muted-foreground">别的部门向本厂提生产需求、上传附件让 AI 识别时默认用这段话；提需求的人每次还能当场改</span>
              </h2>
              <Input.TextArea
                id="factory-demand-fill-prompt"
                v-model:value="fillPrompt"
                :auto-size="{ minRows: 6, maxRows: 16 }"
                :disabled="!canEdit"
                :maxlength="4000"
              />
              <span class="flex items-center gap-3 text-xs text-muted-foreground">
                输出格式、今天日期、产品分类由系统自动补上，这里只写要怎么识别。
                <button
                  v-if="canEdit && fillPrompt.trim() !== (setting.demandFillDefaultPrompt ?? '').trim()"
                  class="text-primary hover:underline"
                  type="button"
                  @click="fillPrompt = setting.demandFillDefaultPrompt ?? ''"
                >
                  恢复系统默认
                </button>
              </span>
            </section>
          </Tabs.TabPane>
          <Tabs.TabPane v-if="setting" key="suppliers" tab="对应供应商">
            <SupplierPanel :can-edit="canEdit" :suppliers="setting.suppliers" @saved="load" />
          </Tabs.TabPane>
          <Tabs.TabPane v-if="setting" key="standing" tab="常备物料">
            <StandingPanel :can-edit="canEdit" />
          </Tabs.TabPane>
          <Tabs.TabPane v-if="canSeeWage && setting" key="wage" tab="计价项目">
            <WageItemPanel :processes="allProcesses" />
          </Tabs.TabPane>
        </Tabs>
      </section>
    </div>
  </Page>
</template>
