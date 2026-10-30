<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { FdmgongchangWageApi as Api } from '#/api/fdmgongchang/wage';

import { ref, watch } from 'vue';

import { Alert, DatePicker, InputNumber, Modal } from 'ant-design-vue';
import dayjs from 'dayjs';

import { saveWagePrice } from '#/api/fdmgongchang/wage';

import { formatDateValue, formatMoney } from '../../shared/wage';

/** 调价：新增一个价格版本；报工按干活日期取当时生效的价格，补录旧日期也按旧价算。 */
const props = defineProps<{ item?: Api.Item }>();
const emit = defineEmits<{ saved: [message: string] }>();
const open = defineModel<boolean>('open', { required: true });

const price = ref<number>();
const effectiveFrom = ref<Dayjs>(dayjs().add(1, 'month').startOf('month'));
const error = ref('');
const saving = ref(false);

watch(open, (value) => {
  if (!value) return;
  price.value = undefined;
  error.value = '';
  effectiveFrom.value = dayjs().add(1, 'month').startOf('month');
});

async function submit() {
  if (!props.item) return;
  if (price.value === undefined || price.value === null) {
    error.value = '请填写新单价';
    return;
  }
  saving.value = true;
  try {
    const date = effectiveFrom.value.format('YYYY-MM-DD');
    await saveWagePrice({ effectiveFrom: date, itemId: props.item.id, price: price.value });
    emit('saved', `「${props.item.name}」从 ${date} 起按 ${price.value} 元计`);
    open.value = false;
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    :confirm-loading="saving"
    :title="`调价 · ${item?.name ?? ''}`"
    ok-text="保存新价格"
    @ok="submit"
  >
    <div class="flex flex-col gap-3 text-sm">
      <div class="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
        <label for="wage-price-value" class="flex flex-col gap-1">
          新单价（元 / {{ item?.unit }}）
          <InputNumber id="wage-price-value" v-model:value="price" :min="0" :precision="4" class="w-full" />
        </label>
        <label for="wage-price-date" class="flex flex-col gap-1">
          生效日期
          <DatePicker id="wage-price-date" v-model:value="effectiveFrom" :allow-clear="false" class="w-full" />
        </label>
      </div>
      <p class="m-0 text-xs text-muted-foreground">同一天已经有价格时会覆盖；更早日期的报工仍按当时的价格算。</p>
      <div>
        <h4 class="m-0 mb-1 text-xs font-semibold">价格记录</h4>
        <ul class="m-0 flex list-none flex-col gap-1 p-0 text-xs">
          <li v-for="p in item?.prices ?? []" :key="p.id" class="flex justify-between rounded border border-border px-2 py-1">
            <span>{{ formatDateValue(p.effectiveFrom) }} 起</span>
            <b class="tabular-nums">{{ formatMoney(p.price, 4) }} 元</b>
          </li>
          <li v-if="(item?.prices ?? []).length === 0" class="text-muted-foreground">还没有价格</li>
        </ul>
      </div>
      <Alert v-if="error" :message="error" show-icon type="error" />
    </div>
  </Modal>
</template>
