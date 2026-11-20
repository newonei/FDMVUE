<script setup lang="ts">
import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { Alert, Button, Checkbox, message, Modal, Spin } from 'ant-design-vue';

import { batchAddEngrave, getProductionOrder } from '#/api/fdmgongchang/production-order';

import { businessError } from '../../shared/business-error';
import { PROCESS_LABELS } from '../../shared/schedule';
import { num, specText } from '../shared';

const props = defineProps<{ order: Api.Order }>();
const emit = defineEmits<{ cancel: []; saved: [order: Api.Order] }>();

const latestOrder = ref<Api.Order>();
const selectedIds = ref<number[]>([]);
const loading = ref(false);
const saving = ref(false);
const loadError = ref('');
const saveError = ref('');
let active = true;

const items = computed(() => {
  if (latestOrder.value?.status !== 'ACCEPTED' || !latestOrder.value.batchRouteEditable) return [];
  return latestOrder.value.items.filter((item) => num(item.quantity) > Math.max(0, num(item.completedQuantity))
    && item.processes?.length && !item.processes.includes('ENGRAVE'));
});

function routeText(item: Api.Item) {
  return item.processes?.map((code) => item.steps?.find((step) => step.process === code)?.label
    || PROCESS_LABELS[code] || code).join(' → ');
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const fresh = await getProductionOrder(props.order.id);
    if (!active) return;
    if (fresh.factoryId !== props.order.factoryId) {
      loadError.value = '订单所属工厂已变化，请关闭后刷新订单。';
      return;
    }
    latestOrder.value = fresh;
  } catch (error) {
    if (active) loadError.value = businessError(error).msg;
  } finally {
    if (active) loading.value = false;
  }
}

async function save() {
  if (loading.value || saving.value || selectedIds.value.length === 0) return;
  saving.value = true;
  saveError.value = '';
  try {
    const fresh = await batchAddEngrave({ itemIds: [...selectedIds.value], orderId: props.order.id });
    if (!active) return;
    message.success('已批量补上雕刻工序');
    emit('saved', fresh);
  } catch (error) {
    if (active) saveError.value = businessError(error).msg;
  } finally {
    if (active) saving.value = false;
  }
}

onMounted(load);
onBeforeUnmount(() => { active = false; });
</script>

<template>
  <Modal :open="true" title="批量修改工艺" :width="700" :closable="!saving" :keyboard="!saving" :mask-closable="false" @cancel="emit('cancel')">
    <Spin :spinning="loading">
      <div class="flex flex-col gap-3">
        <p class="m-0 text-sm text-muted-foreground">{{ props.order.orderNo }} · 为勾选产品补上「雕刻」，其余工序按各产品现有路线保留。</p>
        <Alert v-if="loadError" type="error" show-icon :message="loadError">
          <template #action><Button size="small" @click="load">重新加载</Button></template>
        </Alert>
        <template v-else-if="items.length > 0">
          <Checkbox
            :checked="selectedIds.length === items.length"
            :disabled="saving"
            :indeterminate="selectedIds.length > 0 && selectedIds.length < items.length"
            @change="(event) => selectedIds = event.target.checked ? items.map((item) => item.id) : []"
          >
全选可修改产品（{{ items.length }} 条）
</Checkbox>
          <Checkbox.Group v-model:value="selectedIds" :disabled="saving" class="flex max-h-[45vh] flex-col overflow-y-auto rounded border border-border" role="group" aria-label="选择要补雕刻的产品">
            <div v-for="item in items" :key="item.id" class="border-b border-border p-3 last:border-b-0">
              <Checkbox :value="item.id">
                <span class="font-medium">{{ item.productName }}</span>
                <span class="block break-words text-xs text-muted-foreground">{{ [item.productCode, specText(item)].filter(Boolean).join(' · ') }}</span>
                <span class="block break-words text-xs text-muted-foreground">{{ routeText(item) }}</span>
              </Checkbox>
            </div>
          </Checkbox.Group>
        </template>
        <Alert v-else-if="!loading" type="info" show-icon message="当前订单没有可批量补雕刻的产品。请核对订单状态、下发情况和工艺。" />
        <Alert v-if="saveError" type="error" show-icon :message="saveError" />
      </div>
    </Spin>
    <template #footer>
      <Button :disabled="saving" @click="emit('cancel')">取消</Button>
      <Button type="primary" :disabled="loading || selectedIds.length === 0" :loading="saving" @click="save">保存工艺（{{ selectedIds.length }} 条）</Button>
    </template>
  </Modal>
</template>
