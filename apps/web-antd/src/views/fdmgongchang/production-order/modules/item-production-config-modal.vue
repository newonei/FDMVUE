<script setup lang="ts">
import type { RouteDraft } from '../shared';
import type { ProductionConfigDraft } from './item-production-config';

import type { FdmgongchangRouteApi as RouteApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangProductionOrderApi as Api, FdmgongchangSupplyMatchApi as MatchApi } from '#/api/fdmgongchang/production-order';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Alert, AutoComplete, Button, InputNumber, Modal, Select, Spin } from 'ant-design-vue';

import { getProductionOrder, getRouteOptions, getTargetOptions, saveItemProductionConfig } from '#/api/fdmgongchang/production-order';

import { routeLabel, routeProblem, sortSteps } from '../shared';
import { productionConfigDraft, productionConfigProblems, productionConfigTarget, productionRouteProblems, unfinishedProductionParameters } from './item-production-config';
import RoutePicker from './route-picker.vue';

const props = defineProps<{ itemId: number; orderId: number }>();
const emit = defineEmits<{ saved: [] }>();
const open = defineModel<boolean>('open', { required: true });
const order = ref<Api.Order>();
const item = ref<Api.Item>();
const form = ref<ProductionConfigDraft>({ colorMode: 'UNKNOWN', constructionType: 'UNKNOWN' });
const route = ref<RouteDraft>({ steps: [] });
const targetOptions = ref<MatchApi.TargetOptions>();
const routeOptions = ref<RouteApi.Options>();
const loading = ref(false);
const saving = ref(false);
const loadError = ref('');
const saveError = ref('');
const attemptedSave = ref(false);
let version = 0;

function errorText(error: unknown) {
  const e = error as { message?: string; msg?: string };
  return e?.msg || e?.message || '请求失败，请重试';
}

async function load() {
  const current = ++version;
  if (!open.value) return;
  loading.value = true;
  loadError.value = '';
  saveError.value = '';
  attemptedSave.value = false;
  item.value = undefined;
  order.value = undefined;
  routeOptions.value = undefined;
  try {
    const [freshOrder, options] = await Promise.all([getProductionOrder(props.orderId), getTargetOptions()]);
    if (current !== version) return;
    const selected = freshOrder.items.find((row) => row.id === props.itemId);
    if (!selected) throw new Error('该产品明细已不存在，请关闭后刷新订单');
    const routes = await getRouteOptions(freshOrder.factoryId);
    if (current !== version) return;
    order.value = freshOrder;
    item.value = selected;
    targetOptions.value = options;
    routeOptions.value = routes;
    form.value = productionConfigDraft(selected);
    route.value = { routeId: selected.routeId ?? undefined, steps: [...(selected.processes ?? [])] };
  } catch (error) {
    if (current === version) loadError.value = errorText(error);
  } finally {
    if (current === version) loading.value = false;
  }
}

watch([open, () => props.orderId, () => props.itemId], load, { immediate: true });
onBeforeUnmount(() => { version++; });

const processLabels = computed(() => new Map(routeOptions.value?.processes.map((p) => [p.code, p.label])));
const actualRoute = computed(() => route.value.steps.map((code) => processLabels.value.get(code) ?? code).join(' → ') || '未选择工序');
const unfinished = computed(() => unfinishedProductionParameters(form.value, route.value.steps));
const problems = computed(() => {
  const result = productionConfigProblems(form.value);
  const steps = route.value.steps;
  const available = routeOptions.value?.processes ?? [];
  const unknown = steps.filter((code) => !available.some((p) => p.code === code));
  if (unknown.length > 0) result.push(`本厂未启用工序：${unknown.join('、')}，请重新选择工艺`);
  const problem = routeProblem(steps, available);
  if (problem) result.push(problem);
  const structureProblem = productionRouteProblems(form.value.constructionType, steps);
  if (structureProblem) result.push(structureProblem);
  if (!steps.includes('EMBOSS') && (form.value.textureFront || form.value.textureBack)) result.push('未选择压花工序，请清空正反纹路，或加入压花工序');
  if (!steps.includes('ENGRAVE') && form.value.pattern) result.push('未选择雕刻工序，请清空雕刻图案，或加入雕刻工序');
  return result;
});

function close() { if (!saving.value) open.value = false; }

async function save() {
  if (saving.value || loading.value || !item.value) return;
  attemptedSave.value = true;
  saveError.value = '';
  if (problems.value.length > 0) return;
  const current = version;
  const payload: Api.ItemProductionConfigReq = {
    itemId: item.value.id,
    target: productionConfigTarget(item.value.id, { ...form.value, foldingType: route.value.steps.includes('FOLD') ? form.value.foldingType : '' }),
    routeId: route.value.routeId ?? null,
    processes: sortSteps([...route.value.steps], routeOptions.value?.processes ?? []),
  };
  saving.value = true;
  try {
    await saveItemProductionConfig(payload);
    if (current !== version || !open.value) return;
    open.value = false;
    emit('saved');
  } catch (error) {
    if (current === version) saveError.value = errorText(error);
  } finally {
    saving.value = false;
  }
}

const colorModes = [{ label: '待核实', value: 'UNKNOWN' }, { label: '单色', value: 'SINGLE' }, { label: '双色', value: 'DUAL' }];
const constructionTypes = [{ label: '待核实', value: 'UNKNOWN' }, { label: '单层', value: 'SINGLE_LAYER' }, { label: '双层贴合', value: 'DOUBLE_LAYER' }];
</script>

<template>
  <Modal :open="open" title="修改生产参数与工艺" :width="980" :footer="null" :closable="!saving" :keyboard="!saving" :mask-closable="false" @cancel="close">
    <Spin :spinning="loading">
      <div v-if="loadError" class="flex flex-col gap-3 py-4">
        <Alert type="error" :message="loadError" show-icon />
        <Button class="self-start" @click="load">重新加载</Button>
      </div>
      <div v-else-if="item && order" class="production-config-editor flex flex-col gap-4">
        <div class="border-b pb-3">
          <div class="font-medium">{{ order.orderNo }} · {{ item.productCode || '未填产品编码' }} · {{ item.productName }}</div>
          <div class="mt-1 text-xs text-muted-foreground">订单数量 {{ item.quantity }} {{ item.unit || '件' }} · {{ item.targetConfirmedAt ? '从已保存生产参数继续修改' : '请核对已有参数；空缺项使用系统建议值' }}</div>
        </div>
        <fieldset :disabled="saving" :inert="saving || undefined" class="m-0 min-w-0 border-0 p-0">
          <div class="config-fields">
            <label for="config-material">材质 *
              <Select id="config-material" v-model:value="form.material" :options="targetOptions?.materials" allow-clear show-search option-filter-prop="label" placeholder="请选择材质" />
            </label>
            <label for="config-color-mode">单色 / 双色 *
              <Select id="config-color-mode" v-model:value="form.colorMode" :options="colorModes" />
            </label>
            <label for="config-construction">制造结构 *
              <Select id="config-construction" v-model:value="form.constructionType" :options="constructionTypes" />
            </label>
            <label for="config-front-color">正面颜色 *
              <Select id="config-front-color" v-model:value="form.frontColor" :options="targetOptions?.colors" allow-clear show-search option-filter-prop="label" placeholder="未填写" />
            </label>
            <label for="config-back-color">反面颜色{{ form.colorMode === 'DUAL' ? ' *' : '' }}
              <Select v-if="form.colorMode === 'SINGLE'" id="config-back-color" :value="form.frontColor" :options="targetOptions?.colors" disabled placeholder="与正面同色" />
              <Select v-else id="config-back-color" v-model:value="form.backColor" :options="targetOptions?.colors" allow-clear show-search option-filter-prop="label" placeholder="未填写" />
            </label>
            <label for="config-length">成品长度 mm（冲裁后）*
              <InputNumber id="config-length" v-model:value="form.lengthMm" :min="0" :precision="3" placeholder="未填写" />
            </label>
            <label for="config-width">成品宽度 mm（冲裁后）*
              <InputNumber id="config-width" v-model:value="form.widthMm" :min="0" :precision="3" placeholder="未填写" />
            </label>
            <label for="config-thickness">成品总厚 mm（冲裁后）*
              <InputNumber id="config-thickness" v-model:value="form.thicknessMm" :min="0" :precision="3" :step="0.1" placeholder="未填写" />
            </label>
            <div class="flex flex-col gap-1">
              <span>保存后的制造层厚</span>
              <div class="config-layer rounded bg-muted px-3 py-1.5 text-sm">
                <template v-if="form.constructionType === 'DOUBLE_LAYER'">正面 {{ form.frontThicknessMm ?? '未填写' }} mm + 反面 {{ form.backThicknessMm ?? '未填写' }} mm</template>
                <template v-else-if="form.constructionType === 'SINGLE_LAYER'">单层 {{ form.thicknessMm ?? '未填写' }} mm</template>
                <template v-else>请先核实制造结构</template>
              </div>
            </div>
            <template v-if="form.constructionType === 'DOUBLE_LAYER'">
              <label for="config-front-thickness">正面层厚 mm *
                <InputNumber id="config-front-thickness" v-model:value="form.frontThicknessMm" :min="0" :precision="3" :step="0.1" placeholder="按实际层厚填写" />
              </label>
              <label for="config-back-thickness">反面层厚 mm *
                <InputNumber id="config-back-thickness" v-model:value="form.backThicknessMm" :min="0" :precision="3" :step="0.1" placeholder="按实际层厚填写" />
              </label>
            </template>
            <label v-if="route.steps.includes('EMBOSS') || form.textureFront || form.textureBack" for="config-texture-front">正面压花纹路
              <Select id="config-texture-front" v-model:value="form.textureFront" :options="targetOptions?.textures" allow-clear show-search option-filter-prop="label" placeholder="不压花 / 选择纹路" />
            </label>
            <label v-if="route.steps.includes('EMBOSS') || form.textureFront || form.textureBack" for="config-texture-back">反面压花纹路
              <Select id="config-texture-back" v-model:value="form.textureBack" :options="targetOptions?.textures" allow-clear show-search option-filter-prop="label" placeholder="不压花 / 选择纹路" />
            </label>
            <label for="config-pattern" class="sm:col-span-2">雕刻图案
              <Select id="config-pattern" v-model:value="form.pattern" :options="targetOptions?.patterns" allow-clear show-search option-filter-prop="label" placeholder="未填写" />
            </label>
            <p v-if="route.steps.length > 0 && !route.steps.includes('EMBOSS')" class="text-sm text-muted-foreground">本产品不经过压花工序。</p>
          </div>
          <p class="mt-3 text-xs text-muted-foreground">这里填写冲裁后的成品尺寸。颜色方式与制造结构分别确认，单色也可双层贴合；双层正反面按实际层厚填写，两层之和必须等于成品总厚。压花至少选择一面纹路，另一面可不压花。</p>
          <div class="mt-4 border-t pt-3">
            <div class="mb-2 font-medium">实际生产工艺</div>
            <RoutePicker id="production-config" v-model="route" :options="routeOptions" />
            <label v-if="route.steps.includes('FOLD')" for="config-folding" class="mt-3 flex flex-col gap-1 text-sm">
              折叠要求（下发前必须确认）
              <AutoComplete id="config-folding" v-model:value="form.foldingType" :maxlength="50" :options="['二折', '三折', '四折', '六折', '八折', '十折', '十二折'].map(value => ({ value }))" placeholder="选择或填写，如八折；员工按此要求生产" />
            </label>
            <p v-else class="mt-2 text-sm text-muted-foreground">本产品不经过折叠工序。</p>
            <p class="config-actual-route mb-0 mt-2 text-sm">{{ routeLabel(route, routeOptions) }}：{{ actualRoute }}</p>
          </div>
        </fieldset>
        <Alert v-if="unfinished.length > 0" type="warning" show-icon :message="unfinished.join('；')" description="可以先保存，后续继续补齐；拆分下发前仍需完整配置。" />
        <Alert v-if="attemptedSave && problems.length > 0" class="config-validation" type="error" show-icon :message="problems.join('；')" />
        <Alert v-if="saveError" type="error" :message="saveError" show-icon />
      </div>
      <div v-else class="min-h-24"></div>
    </Spin>
    <div class="mt-5 flex justify-end gap-2 border-t pt-3">
      <Button :disabled="saving" @click="close">取消</Button>
      <Button type="primary" :loading="saving" :disabled="loading || !!loadError || !item" @click="save">保存参数与工艺</Button>
    </div>
  </Modal>
</template>

<style scoped>
.config-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.config-fields label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.config-fields :deep(.ant-input-number) { width: 100%; }

@media (max-width: 700px) { .config-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
