<script setup lang="ts">
import type { FdmgongchangProductionOrderApi as OrderApi, FdmgongchangSupplyMatchApi as SupplyMatchApi } from '#/api/fdmgongchang/production-order';
import type { FdmgongchangRouteSupplementApi as SupplementApi } from '#/api/fdmgongchang/schedule';

import { computed, ref, watch } from 'vue';

import { Alert, AutoComplete, Button, Input, message, Modal, Select } from 'ant-design-vue';

import { getRouteOptions, getTargetOptions } from '#/api/fdmgongchang/production-order';
import { previewRouteSupplement, releaseRouteSupplement } from '#/api/fdmgongchang/schedule';

import { businessError } from '../../shared/business-error';
import { PROCESS_LABELS, TASK_STAGE_LABELS } from '../../shared/schedule';
import { num } from '../shared';

const props = defineProps<{ factoryId: number; item: OrderApi.Item; orderNo: string }>();
const emit = defineEmits<{ released: [] }>();
const open = defineModel<boolean>('open', { required: true });

const process = ref<string>();
const foldingType = ref('');
const pattern = ref<string>();
const textureFront = ref<string>();
const textureBack = ref<string>();
const reason = ref('');
const options = ref<Array<{ label: string; value: string }>>([]);
const loadingOptions = ref(false);
const targetOptions = ref<SupplyMatchApi.TargetOptions>();
const loadingTargetOptions = ref(false);
const targetOptionError = ref('');
const previewing = ref(false);
const releasing = ref(false);
const operationError = ref('');
const preview = ref<SupplementApi.Preview>();
const previewRequest = ref<SupplementApi.Request>();
const busy = computed(() => previewing.value || releasing.value);

const foldingOptions = ['二折', '三折', '四折', '六折', '八折', '十折', '十二折'].map((value) => ({ value }));
const sideLabels: Record<string, string> = { BACK: '反面', BOTH: '正反面', FRONT: '正面' };
const remaining = computed(() => num(props.item.quantity) - num(props.item.completedQuantity));
const requiresFolding = computed(() => (process.value === 'FOLD' || props.item.processes?.includes('FOLD'))
  && !props.item.targetFoldingType?.trim());
const requiresPattern = computed(() => process.value === 'ENGRAVE' && !props.item.targetPattern?.trim());
const showFrontTexture = computed(() => process.value === 'EMBOSS' && !props.item.targetTextureFront?.trim());
const showBackTexture = computed(() => process.value === 'EMBOSS' && !props.item.targetTextureBack?.trim());
const needsTargetOptions = computed(() => requiresPattern.value || showFrontTexture.value || showBackTexture.value);
const canPreview = computed(() => !busy.value && !loadingOptions.value && !!process.value && !!reason.value.trim()
  && remaining.value > 0 && (!requiresFolding.value || !!foldingType.value.trim()) && (!requiresPattern.value || !!pattern.value));
const canRelease = computed(() => !busy.value && !!previewRequest.value && !!preview.value?.canRelease
  && !!preview.value.previewKey && preview.value.errors.length === 0);

function routeText(route?: string[]) {
  return route?.map((step) => PROCESS_LABELS[step] || step).join(' → ') || '未设置';
}

watch([process, reason, foldingType, pattern, textureFront, textureBack, remaining], () => {
  preview.value = undefined;
  previewRequest.value = undefined;
  operationError.value = '';
}, { flush: 'sync' });

watch(open, async (value, _, onCleanup) => {
  if (!value) return;
  let active = true;
  onCleanup(() => { active = false; });
  process.value = undefined;
  reason.value = '';
  foldingType.value = '';
  pattern.value = undefined;
  textureFront.value = undefined;
  textureBack.value = undefined;
  operationError.value = '';
  preview.value = undefined;
  previewRequest.value = undefined;
  options.value = [];
  loadingOptions.value = true;
  try {
    const routes = await getRouteOptions(props.factoryId);
    if (!active) return;
    options.value = routes.processes.filter(({ code }) => Object.hasOwn(PROCESS_LABELS, code)
      && (code === 'PACK' || !props.item.processes?.includes(code))).map(({ code, label }) => ({ label, value: code }));
  } catch (error) {
    if (active) operationError.value = `工序选项加载失败。${businessError(error).msg}`;
  } finally {
    if (active) loadingOptions.value = false;
  }
}, { immediate: true });

async function loadTargetOptions() {
  if (targetOptions.value || loadingTargetOptions.value) return;
  loadingTargetOptions.value = true;
  targetOptionError.value = '';
  try {
    targetOptions.value = await getTargetOptions();
  } catch (error) {
    targetOptionError.value = `图案和纹路选项加载失败。${businessError(error).msg}`;
  } finally {
    loadingTargetOptions.value = false;
  }
}

watch(needsTargetOptions, (value) => { if (value) void loadTargetOptions(); });

async function prepare() {
  if (!canPreview.value || !process.value) return;
  const request: SupplementApi.Request = {
    foldingType: requiresFolding.value ? foldingType.value.trim() : undefined,
    itemId: props.item.id,
    pattern: requiresPattern.value ? pattern.value : undefined,
    process: process.value,
    quantity: remaining.value,
    reason: reason.value.trim(),
    textureBack: showBackTexture.value ? textureBack.value : undefined,
    textureFront: showFrontTexture.value ? textureFront.value : undefined,
  };
  previewing.value = true;
  preview.value = undefined;
  previewRequest.value = undefined;
  operationError.value = '';
  try {
    const result = await previewRouteSupplement(props.factoryId, request);
    if (!open.value || props.item.id !== request.itemId || remaining.value !== request.quantity) return;
    preview.value = result;
    previewRequest.value = request;
  } catch (error) {
    operationError.value = businessError(error).msg;
  } finally {
    previewing.value = false;
  }
}

async function release() {
  if (!canRelease.value || !preview.value || !previewRequest.value) return;
  releasing.value = true;
  operationError.value = '';
  try {
    const result = await releaseRouteSupplement(props.factoryId, { ...previewRequest.value, previewKey: preview.value.previewKey });
    const count = result.taskIds?.length || 1;
    message.success(`已补发 ${count} 个工序任务`);
    open.value = false;
    emit('released');
  } catch (error) {
    const { code, msg } = businessError(error);
    if (code >= 1_000_000_000) {
      preview.value = undefined;
      previewRequest.value = undefined;
      operationError.value = `${msg}。请重新预览，核对当前工艺和任务后再继续。`;
    } else {
      operationError.value = `${msg}。可再次点「确认补发」核对本次提交结果。`;
    }
  } finally {
    releasing.value = false;
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    :closable="!busy"
    :keyboard="!busy"
    :mask-closable="false"
    :width="680"
    title="补工序"
  >
    <div class="flex flex-col gap-3 text-sm">
      <div>
        <div class="font-medium">{{ item.productName }}</div>
        <div class="text-xs text-muted-foreground">{{ orderNo }} · 明细 #{{ item.id }}<template v-if="item.productCode"> · {{ item.productCode }}</template></div>
      </div>
      <div class="rounded border border-border p-3">
        <div><span class="text-muted-foreground">当前工艺</span> {{ routeText(preview?.existingRoute ?? item.processes) }}</div>
        <div><span class="text-muted-foreground">剩余数量</span> {{ remaining }} {{ item.unit }}</div>
      </div>
      <label for="route-supplement-process" class="flex flex-col gap-1">
        漏掉的工序
        <Select id="route-supplement-process" v-model:value="process" :options="options" :loading="loadingOptions" :disabled="busy || loadingOptions" placeholder="选择需要补上的工序" />
      </label>
      <p v-if="!loadingOptions && !operationError && options.length === 0" class="m-0 text-muted-foreground">当前工厂没有可补入这条工艺的工序。</p>
      <label v-if="requiresPattern" for="route-supplement-pattern" class="flex flex-col gap-1">
        雕刻图案（必填）
        <Select id="route-supplement-pattern" v-model:value="pattern" :options="targetOptions?.patterns" :loading="loadingTargetOptions" :disabled="busy || loadingTargetOptions" allow-clear show-search option-filter-prop="label" placeholder="选择图案" />
      </label>
      <label v-if="showFrontTexture" for="route-supplement-texture-front" class="flex flex-col gap-1">
        正面压花纹路
        <Select id="route-supplement-texture-front" v-model:value="textureFront" :options="targetOptions?.textures" :loading="loadingTargetOptions" :disabled="busy || loadingTargetOptions" allow-clear show-search option-filter-prop="label" placeholder="不压花 / 选择纹路" />
      </label>
      <label v-if="showBackTexture" for="route-supplement-texture-back" class="flex flex-col gap-1">
        反面压花纹路
        <Select id="route-supplement-texture-back" v-model:value="textureBack" :options="targetOptions?.textures" :loading="loadingTargetOptions" :disabled="busy || loadingTargetOptions" allow-clear show-search option-filter-prop="label" placeholder="不压花 / 选择纹路" />
      </label>
      <Alert v-if="needsTargetOptions && targetOptionError" type="error" show-icon :message="targetOptionError">
        <template #action><Button size="small" :disabled="busy" @click="loadTargetOptions">重新加载</Button></template>
      </Alert>
      <label v-if="requiresFolding" for="route-supplement-folding" class="flex flex-col gap-1">
        折叠要求（必填）
        <AutoComplete id="route-supplement-folding" v-model:value="foldingType" :options="foldingOptions" :maxlength="50" :disabled="busy" placeholder="例如八折" />
      </label>
      <label for="route-supplement-reason" class="flex flex-col gap-1">
        补工序原因（必填）
        <Input.TextArea id="route-supplement-reason" v-model:value="reason" :rows="2" :maxlength="250" :disabled="busy" placeholder="例如拆分订单时漏选雕刻，核对后道还未开工" />
      </label>

      <Alert v-if="operationError" type="error" show-icon :message="operationError" />
      <template v-if="preview">
        <section v-if="preview.proposedRoute.length" class="flex flex-col gap-1 rounded border border-border p-3" aria-label="补工序预览">
          <div><span class="text-muted-foreground">补齐后工艺</span> {{ routeText(preview.proposedRoute) }}</div>
          <div v-if="preview.sourceStage || preview.outputStage">
            <span class="text-muted-foreground">预计领料与产出</span>
            {{ TASK_STAGE_LABELS[preview.sourceStage ?? ''] || preview.sourceStage || '待确认' }} → {{ TASK_STAGE_LABELS[preview.outputStage ?? ''] || preview.outputStage || '待确认' }}
          </div>
          <div v-if="preview.tasks?.length">
            <span class="text-muted-foreground">新增任务</span>
            {{ preview.tasks.map((task) => `${PROCESS_LABELS[task.process] || task.process}${task.side ? `（${sideLabels[task.side] ?? task.side}）` : ''} ${task.quantity}${task.unit ?? ''}`).join('、') }}
          </div>
          <div v-if="preview.adjustedTaskIds.length">
            <span class="text-muted-foreground">会更新的原任务</span>
            {{ preview.adjustedTaskIds.map((id) => `#${id}`).join('、') }}
          </div>
        </section>
        <Alert v-for="(problem, index) in preview.errors" :key="index" type="error" show-icon :message="problem" />
        <Alert v-for="(warning, index) in preview.warnings" :key="index" type="warning" show-icon :message="warning" />
      </template>
    </div>
    <template #footer>
      <Button :disabled="busy" @click="open = false">取消</Button>
      <Button :disabled="!canPreview" :loading="previewing" @click="prepare">预览影响</Button>
      <Button type="primary" :disabled="!canRelease" :loading="releasing" @click="release">确认补发</Button>
    </template>
  </Modal>
</template>
