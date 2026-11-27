<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { ref, watch } from 'vue';

import { DatePicker, Input, message, Modal, Select } from 'ant-design-vue';

import { generateSchedule } from '#/api/fdmgongchang/schedule';

import { factoryToday } from '../../shared/factory-date';
import { dateText, num } from '../shared';

/**
 * 选中的订单做 AI 排单：只把这几张单交给 AI 排（其他订单这次不排），
 * 提交后切到「排单方案」看方案、调整、确认下发。
 */
const props = defineProps<{ orders: Api.Order[] }>();
const emit = defineEmits<{ generated: [id: number] }>();
const open = defineModel<boolean>('open', { required: true });

const startDate = ref<Dayjs>(factoryToday());
const days = ref(3);
const note = ref('');
const submitting = ref(false);
const dayOptions = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ label: `${d} 天`, value: d }));

watch(open, (value) => {
  if (!value) return;
  startDate.value = factoryToday();
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
        只把这几张单交给 AI 排（其他订单这次不排），AI 参考库存、原料、人员和产能排出未来几天发泡的先后；确认下发时，开片以后由系统按工序生成任务包。
        出方案后在「AI 排单」里调整、确认下发。
      </p>
      <div class="max-h-48 overflow-auto rounded-md border border-border" role="region" aria-label="AI 排单订单表格" tabindex="0">
        <table aria-label="待排单订单" class="w-full min-w-[440px] border-collapse text-left text-xs">
          <thead class="sticky top-0 bg-muted">
            <tr class="[&>th]:px-3 [&>th]:py-2">
              <th scope="col">订单号</th>
              <th scope="col">产品</th>
              <th scope="col" class="text-right whitespace-nowrap">待做数量</th>
              <th scope="col" class="whitespace-nowrap">交期</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in orders" :key="order.id" class="border-t border-border [&>td]:border-r [&>td]:border-border [&>td]:px-3 [&>td]:py-2 [&>td:last-child]:border-r-0">
              <th scope="row" class="border-r border-border px-3 py-2 font-mono font-medium whitespace-nowrap">{{ order.orderNo }}</th>
              <td :title="order.items.map((item) => item.productName).join('、')">
                {{ order.items[0]?.productName || '—' }}<template v-if="order.items.length > 1"> 等 {{ order.items.length }} 个产品</template>
              </td>
              <td class="text-right tabular-nums">{{ num(order.totalQuantity) - num(order.completedQuantity) }}</td>
              <td class="tabular-nums whitespace-nowrap">{{ dateText(order.promisedDate) || dateText(order.requiredDate) || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label for="po-schedule-start" class="flex flex-col gap-1 text-xs text-muted-foreground">
          从哪天开始
          <DatePicker
            id="po-schedule-start"
            v-model:value="startDate"
            :allow-clear="false"
            :disabled-date="(d: Dayjs) => d.isBefore(factoryToday(), 'day')"
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
