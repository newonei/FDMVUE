<script setup lang="ts">
import type { ShortageDispatchSeed } from '../../shared/schedule';

import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { ref, watch } from 'vue';

import { Alert, Button, message, Modal, Spin } from 'ant-design-vue';

import { getWorkerList } from '#/api/fdmgongchang/factory';
import { dispatchScheduleShortage, getScheduleFormOptions } from '#/api/fdmgongchang/schedule';
import { newIdempotencyKey } from '#/api/fdmplatform';

import { factoryTodayText } from '../../shared/factory-date';
import TaskFormModal from './task-form-modal.vue';

const props = defineProps<{ factoryId?: null | number; seed: ShortageDispatchSeed }>();
const emit = defineEmits<{ released: [id: number] }>();
const open = defineModel<boolean>('open', { required: true });

const options = ref<Api.FormOptions>();
const workers = ref<FdmgongchangFactoryApi.Worker[]>([]);
const error = ref('');
const requestKey = ref('');
const dateContext = { days: 1, startDate: factoryTodayText(), status: 'DRAFT' as const };
let loadVersion = 0;

async function load() {
  const version = ++loadVersion;
  const { itemId, orderId, orderNo } = props.seed;
  options.value = undefined;
  error.value = '';
  try {
    const [formOptions, activeWorkers] = await Promise.all([
      getScheduleFormOptions({ productionOrderId: orderId }),
      getWorkerList({ assigned: true, status: 0 }).catch(() => []),
    ]);
    if (version !== loadVersion) return;
    const demand = formOptions.demand.find((item) => item.contractCode === orderNo && item.assignmentId === `PO-ITEM:${itemId}`);
    const remaining = demand?.remaining;
    if (!demand || (remaining !== null && remaining !== undefined && Number(remaining) <= 0)) {
      error.value = '这条明细已无可派工的欠量。请关闭后刷新订单，核对订单状态和剩余数量。';
      return;
    }
    if (!formOptions.processes.some((process) => !props.seed.processes?.length || props.seed.processes.includes(process.code))) {
      error.value = '这条明细没有可下发的工序，请核对订单工艺和本厂启用的工序。';
      return;
    }
    workers.value = activeWorkers;
    options.value = formOptions;
  } catch {
    if (version === loadVersion) error.value = '补派工资料加载失败，请重试。';
  }
}

watch([open, () => props.seed, () => props.factoryId], ([isOpen]) => {
  if (!isOpen) {
    ++loadVersion;
    return;
  }
  requestKey.value = newIdempotencyKey();
  void load();
}, { immediate: true });

async function submit(task: Api.PlanTask) {
  const { itemId, orderId } = props.seed;
  const { id, notices } = await dispatchScheduleShortage({ itemId, orderId, requestKey: requestKey.value, task });
  message.success('已下发补派任务');
  if (notices?.length) message.warning(notices.join('；'));
  open.value = false;
  emit('released', id);
}
</script>

<template>
  <TaskFormModal
    v-if="options"
    v-model:open="open"
    :options="options"
    :schedule="dateContext"
    :shortage-dispatch="seed"
    :submit="submit"
    :workers="workers"
  />
  <Modal v-else v-model:open="open" :footer="null" title="补派工">
    <Alert v-if="error" :message="error" show-icon type="warning">
      <template #action><Button size="small" @click="load">重试</Button></template>
    </Alert>
    <div v-else class="flex items-center gap-3 py-4" role="status">
      <Spin size="small" /> 正在加载订单明细和可派工工序…
    </div>
  </Modal>
</template>
