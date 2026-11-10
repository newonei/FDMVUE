<script setup lang="ts">
import type { FdmgongchangProductionOrderApi as OrderApi } from '#/api/fdmgongchang/production-order';

import { computed, ref, watch } from 'vue';

import { Checkbox, Empty, Input, Modal, Spin } from 'ant-design-vue';

import { getOpenProductionOrders } from '#/api/fdmgongchang/production-order';
import { releaseTaskPackages } from '#/api/fdmgongchang/schedule';

import { dateText, num } from '../../production-order/shared';

/**
 * 下发任务包前勾选订单：只给勾选的这几张单按工序生成任务包（发泡只排先后，都不定日期）。
 * 传了 orders（订单列表里已经勾好的）就只确认这几张；没传就列出本厂全部已接单的订单自己勾。
 */
const props = defineProps<{ orders?: OrderApi.Order[] }>();
const emit = defineEmits<{ released: [scheduleId: number] }>();
const open = defineModel<boolean>('open', { required: true });

const MAX = 50;
const list = ref<OrderApi.Order[]>([]);
const loading = ref(false);
const checked = ref<number[]>([]);
const keyword = ref('');
const note = ref('');
const submitting = ref(false);

const preset = computed(() => (props.orders?.length ?? 0) > 0);

watch(open, async (value) => {
  if (!value) return;
  keyword.value = '';
  note.value = '';
  if (preset.value) {
    list.value = [...props.orders!];
    checked.value = list.value.map((o) => o.id);
    return;
  }
  list.value = [];
  checked.value = [];
  loading.value = true;
  try {
    list.value = await getOpenProductionOrders();
  } finally {
    loading.value = false;
  }
});

function due(o: OrderApi.Order) {
  return dateText(o.promisedDate) || dateText(o.requiredDate);
}

function searchText(o: OrderApi.Order) {
  return [o.orderNo, o.sourceContractCode, o.customerName, ...o.items.map((i) => i.productName)].filter(Boolean).join(' ').toLowerCase();
}

const shown = computed(() => {
  const k = keyword.value.trim().toLowerCase();
  const rows = k ? list.value.filter((o) => searchText(o).includes(k)) : list.value;
  return rows.toSorted((a, b) => (due(a) || '9999').localeCompare(due(b) || '9999'));
});

const allShownChecked = computed(() => shown.value.length > 0 && shown.value.every((o) => checked.value.includes(o.id)));

function toggle(id: number, on: boolean) {
  checked.value = on ? [...new Set([...checked.value, id])] : checked.value.filter((x) => x !== id);
}

function toggleAll(on: boolean) {
  const ids = new Set(shown.value.map((o) => o.id));
  checked.value = on ? [...new Set([...checked.value, ...ids])] : checked.value.filter((x) => !ids.has(x));
}

async function submit() {
  if (checked.value.length === 0) return;
  submitting.value = true;
  try {
    const res = await releaseTaskPackages({ note: note.value.trim() || undefined, productionOrderIds: checked.value });
    open.value = false;
    Modal.info({
      content: res.warnings.length > 0 ? `要注意：${res.warnings.join('；')}` : '都下发了，工人在工作台的任务大厅里就能看到。',
      title: `已下发 ${res.tasks} 个任务包（发泡 ${res.mixTasks} 个）`,
      width: 560,
    });
    emit('released', res.scheduleId);
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    :confirm-loading="submitting"
    :ok-button-props="{ disabled: checked.length === 0 || checked.length > MAX }"
    :ok-text="checked.length > 0 ? `下发 ${checked.length} 张单的任务包` : '下发任务包'"
    :width="680"
    title="下发任务包 · 选订单"
    @ok="submit"
  >
    <div class="flex flex-col gap-3 text-sm">
      <p class="m-0 text-xs text-muted-foreground">
        只给勾选的订单下发：按库存算每张单各工序还要做多少，每道工序一个包进任务大厅；发泡按交期排先后，开片以后不排日期。已经有任务包的部分不会重复下发。
      </p>
      <div v-if="!preset" class="flex items-center gap-2">
        <Input id="package-order-search" v-model:value="keyword" allow-clear placeholder="搜订单号、合同号、客户、产品" size="small" />
        <Checkbox :checked="allShownChecked" :disabled="shown.length === 0" class="shrink-0" @change="(e: any) => toggleAll(e.target.checked)">全选</Checkbox>
      </div>
      <Spin :spinning="loading">
        <Empty v-if="!loading && shown.length === 0" :image="Empty.PRESENTED_IMAGE_SIMPLE" :description="list.length === 0 ? '没有已接单的订单' : '没有搜到'" />
        <ul v-else class="m-0 flex max-h-80 list-none flex-col divide-y divide-border overflow-auto rounded-md border border-border p-0">
          <li v-for="o in shown" :key="o.id">
            <label class="flex cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-muted/50">
              <Checkbox :checked="checked.includes(o.id)" :aria-label="o.orderNo" @change="(e: any) => toggle(o.id, e.target.checked)" />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="font-mono text-xs">
                  {{ o.orderNo }}<template v-if="o.sourceContractCode"> · {{ o.sourceContractCode }}</template><template v-if="o.customerName"> · {{ o.customerName }}</template>
                </span>
                <span class="truncate text-xs text-muted-foreground">
                  {{ o.items[0]?.productName }}<template v-if="o.items.length > 1"> 等 {{ o.items.length }} 个产品</template>
                </span>
              </span>
              <span class="shrink-0 text-right text-xs text-muted-foreground">
                待做 {{ num(o.totalQuantity) - num(o.completedQuantity) }}<template v-if="due(o)"> · 交期 {{ due(o) }}</template>
              </span>
            </label>
          </li>
        </ul>
      </Spin>
      <p v-if="checked.length > MAX" class="m-0 text-xs text-red-500">一次最多选 {{ MAX }} 张，现在选了 {{ checked.length }} 张</p>
      <label for="package-release-note" class="flex flex-col gap-1 text-xs text-muted-foreground">
        补充说明（选填）
        <Input.TextArea id="package-release-note" v-model:value="note" :maxlength="500" :rows="2" />
      </label>
    </div>
  </Modal>
</template>
