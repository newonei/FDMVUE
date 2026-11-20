<script setup lang="ts">
import type { RouteDraft } from '../shared';
import type { BatchDetailLine, BatchDetailPatch } from './batch-detail';

import type { FdmgongchangRouteApi as RouteApi } from '#/api/fdmgongchang/factory';

import { computed, ref, watch } from 'vue';

import { Alert, Checkbox, Input, InputNumber, Modal } from 'ant-design-vue';

import { routeProblem, sortSteps } from '../shared';
import { planBatchDetails } from './batch-detail';
import RoutePicker from './route-picker.vue';

const props = defineProps<{ lines: BatchDetailLine[]; options?: RouteApi.Options }>();
const emit = defineEmits<{ apply: [changes: BatchDetailPatch[]] }>();
const open = defineModel<boolean>('open', { required: true });

const route = ref<RouteDraft>({ steps: [] });
const quantity = ref<null | number>(null);
const remark = ref('');
const overwrite = ref(false);

watch(open, (value) => {
  if (!value) return;
  route.value = { steps: [] };
  quantity.value = null;
  remark.value = '';
  overwrite.value = false;
});

const normalizedRoute = computed(() => {
  if (route.value.steps.length === 0 || !props.options) return undefined;
  return {
    routeId: route.value.routeId,
    steps: sortSteps(route.value.steps, props.options.processes),
  };
});
const routeUnavailable = computed(() => route.value.steps.length > 0
  && (!normalizedRoute.value || normalizedRoute.value.steps.length !== route.value.steps.length));
const invalidRoute = computed(() => routeUnavailable.value
  || Boolean(normalizedRoute.value && props.options && routeProblem(normalizedRoute.value.steps, props.options.processes)));
const invalidQuantity = computed(() => quantity.value !== null
  && (!Number.isInteger(quantity.value) || quantity.value < 1));
const plan = computed(() => planBatchDetails(props.lines, {
  quantity: quantity.value ?? undefined,
  remark: remark.value.trim(),
  route: normalizedRoute.value,
}, overwrite.value));
const canApply = computed(() => plan.value.changes.length > 0
  && !invalidRoute.value
  && !invalidQuantity.value
  && !plan.value.mixedUnits
  && !plan.value.auxConflicts);

function apply() {
  if (!canApply.value) return;
  emit('apply', plan.value.changes);
  open.value = false;
}
</script>

<template>
  <Modal
    v-model:open="open"
    :mask-closable="false"
    :ok-button-props="{ disabled: !canApply }"
    :width="600"
    cancel-text="取消"
    ok-text="应用到明细"
    title="批量设置明细"
    @ok="apply"
  >
    <div class="flex flex-col gap-4">
      <p class="m-0 text-muted-foreground">已勾选 {{ lines.length }} 行。只应用填写的字段，留空不会清除原值。</p>

      <section class="flex flex-col gap-2 rounded-md border border-border p-3" aria-label="批量工艺路线">
        <h3 class="m-0 text-sm font-semibold">工艺路线</h3>
        <RoutePicker v-if="options?.processes.length" id="po-batch-route" v-model="route" :options="options" allow-empty />
        <span v-else class="text-xs text-muted-foreground">当前没有可用工序，请先选择已启用工序的工厂。</span>
        <span v-if="routeUnavailable" class="text-xs text-destructive" role="alert">工厂可用工序已变化，请重新选择。</span>
      </section>

      <div class="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <label for="po-batch-quantity" class="flex flex-col gap-1">
          每行数量
          <InputNumber
            id="po-batch-quantity"
            :value="quantity ?? undefined"
            :min="1"
            :precision="0"
            class="w-full"
            placeholder="不设置则留空"
            @change="(value) => (quantity = typeof value === 'number' ? value : null)"
          />
          <span v-if="invalidQuantity" class="text-xs text-destructive" role="alert">请输入正整数。</span>
        </label>
        <label for="po-batch-remark" class="flex flex-col gap-1">
          明细备注
          <Input id="po-batch-remark" v-model:value="remark" :maxlength="255" placeholder="不设置则留空" />
        </label>
      </div>

      <Checkbox id="po-batch-overwrite" v-model:checked="overwrite">覆盖已有值</Checkbox>
      <span class="-mt-3 text-xs text-muted-foreground">默认按字段只填空白，保留 AI 回填及手工填写的内容。</span>

      <div class="rounded-md bg-muted/50 p-3 text-sm" role="status">
        将修改 {{ plan.changes.length }} 行（工艺 {{ plan.counts.route }}，数量 {{ plan.counts.quantity }}，备注 {{ plan.counts.remark }}）
      </div>
      <Alert v-if="plan.overwritten > 0" :message="`将覆盖 ${plan.overwritten} 行的已有值，请核对后应用。`" show-icon type="warning" />
      <Alert v-if="plan.mixedUnits" message="本次要设置数量的明细单位不同，请按相同单位分批设置，或留空数量。" show-icon type="warning" />
      <Alert v-if="plan.auxConflicts > 0" :message="`有 ${plan.auxConflicts} 行的已有辅料领用工序不在新路线中，请调整所选路线或分开处理。`" show-icon type="warning" />
    </div>
  </Modal>
</template>
