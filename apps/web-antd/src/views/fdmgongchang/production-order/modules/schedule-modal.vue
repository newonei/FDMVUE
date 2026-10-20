<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { ref, watch } from 'vue';

import { DatePicker, Input, message, Modal, Select } from 'ant-design-vue';
import dayjs from 'dayjs';

import { generateSchedule } from '#/api/fdmgongchang/schedule';

import { dateText, num } from '../shared';

/**
 * 选中的订单做 AI 排单：只把这几张单交给 AI 排（外贸任务和其他订单这次不排），
 * 提交后切到「排单方案」看方案、调整、确认下发。
 */
const props = defineProps<{ orders: Api.Order[] }>();
const emit = defineEmits<{ generated: [id: number] }>();
const open = defineModel<boolean>('open', { required: true });

const startDate = ref<Dayjs>(dayjs());
const days = ref(3);
const note = ref('');
const submitting = ref(false);
const dayOptions = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ label: `${d} 天`, value: d }));

watch(open, (value) => {
  if (!value) return;
  startDate.value = dayjs();
  days.value = 3;
  note.value = '';
});

async function submit() {
  submitting.value = true;
  try {
    const id = await generateSchedule({
      days: days.value,
      note: note.value.trim() || undefined,
      productionOrderIds: props.orders.map((o) => o.id),
      startDate: startDate.value.format('YYYY-MM-DD'),
    });
    message.success('已提交，AI 正在排单');
    open.value = false;
    emit('generated', id);
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
    :width="640"
    ok-text="交给 AI 排单"
    :title="`AI 排单 · 选了 ${orders.length} 张订单`"
    @ok="submit"
  >
    <div class="flex flex-col gap-3 text-sm">
      <p class="m-0 text-xs text-muted-foreground">
        只把这几张单交给 AI 排（外贸任务和其他订单这次不排），AI 会参考库存、在制、人员和产能排出未来几天的任务。
        出方案后在「AI 排单」里调整、确认下发。
      </p>
      <ul class="m-0 flex max-h-48 list-none flex-col divide-y divide-border overflow-auto rounded-md border border-border p-0">
        <li v-for="o in orders" :key="o.id" class="flex items-center justify-between gap-3 px-3 py-1.5">
          <span class="flex min-w-0 flex-col">
            <span class="font-mono text-xs">{{ o.orderNo }}</span>
            <span class="truncate text-xs text-muted-foreground">
              {{ o.items[0]?.productName }}<template v-if="o.items.length > 1"> 等 {{ o.items.length }} 个产品</template>
            </span>
          </span>
          <span class="shrink-0 text-right text-xs text-muted-foreground">
            待做 {{ num(o.totalQuantity) - num(o.completedQuantity) }} · 交期 {{ dateText(o.promisedDate) || dateText(o.requiredDate) }}
          </span>
        </li>
      </ul>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label for="po-schedule-start" class="flex flex-col gap-1 text-xs text-muted-foreground">
          从哪天开始
          <DatePicker
            id="po-schedule-start"
            v-model:value="startDate"
            :allow-clear="false"
            :disabled-date="(d: Dayjs) => d.isBefore(dayjs(), 'day')"
            class="w-full"
          />
        </label>
        <label for="po-schedule-days" class="flex flex-col gap-1 text-xs text-muted-foreground">
          排几天
          <Select id="po-schedule-days" v-model:value="days" :options="dayOptions" />
        </label>
      </div>
      <label for="po-schedule-note" class="flex flex-col gap-1 text-xs text-muted-foreground">
        补充说明（选填）
        <Input.TextArea
          id="po-schedule-note"
          v-model:value="note"
          :maxlength="500"
          :rows="2"
          placeholder="例如：GD 开头的这几张要赶在周五前交；2 号压花机周三保养"
        />
      </label>
    </div>
  </Modal>
</template>
