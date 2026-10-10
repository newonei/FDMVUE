<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangWageApi as Api } from '#/api/fdmgongchang/wage';

import { computed, ref, watch } from 'vue';

import { Alert, DatePicker, Input, InputNumber, Modal, Radio, Select } from 'ant-design-vue';
import dayjs from 'dayjs';

import { createWorkRecords } from '#/api/fdmgongchang/wage';

import { CATEGORY_LABELS, formatMoney, toNum } from '../../shared/wage';

/**
 * 手动登记报工：选日期、班次 → 选项目 → 选人 → 每人填工时或数量。
 * 计时填工时，杂活、工序计件填数量，补助按班（默认 1 班）。
 */
const props = defineProps<{
  items: Api.Item[];
  people: FdmgongchangFactoryApi.Worker[];
}>();
const emit = defineEmits<{ saved: [message: string] }>();
const open = defineModel<boolean>('open', { required: true });

const workDate = ref<Dayjs>(dayjs());
const shift = ref<Api.Shift>('DAY');
const itemId = ref<number>();
const userIds = ref<number[]>([]);
const values = ref<Record<number, null | number>>({});
const remark = ref('');
const error = ref('');
const saving = ref(false);

const item = computed(() => props.items.find((i) => i.id === itemId.value));
const byHours = computed(() => item.value?.category === 'TIME');
const valueLabel = computed(() => {
  if (byHours.value) return '工时（小时）';
  if (item.value?.category === 'ALLOWANCE') return '班数';
  return `数量（${item.value?.unit ?? ''}）`;
});
const itemOptions = computed(() =>
  (Object.keys(CATEGORY_LABELS) as Api.Category[])
    .map((c) => ({
      label: CATEGORY_LABELS[c],
      options: props.items
        .filter((i) => i.category === c)
        .map((i) => ({
          disabled: toNum(i.currentPrice) === undefined,
          label: `${i.name} · ${formatMoney(i.currentPrice, 4)} 元/${i.unit}${toNum(i.currentPrice) === undefined ? '（未定价）' : ''}`,
          value: i.id,
        })),
    }))
    .filter((g) => g.options.length > 0),
);
const peopleOptions = computed(() =>
  props.people.map((p) => ({
    label: [p.nickname, p.team, p.deptName].filter(Boolean).join(' · '),
    value: p.userId,
  })),
);
const nameOf = (id: number) => props.people.find((p) => p.userId === id)?.nickname ?? String(id);
const total = computed(() =>
  userIds.value.reduce((t, id) => t + (values.value[id] ?? 0) * (toNum(item.value?.currentPrice) ?? 0), 0),
);

watch(open, (value) => {
  if (!value) return;
  workDate.value = dayjs();
  shift.value = 'DAY';
  itemId.value = undefined;
  userIds.value = [];
  values.value = {};
  remark.value = '';
  error.value = '';
});

/** 补助默认 1 班；夜班选中时自动带出夜班补助。 */
watch(userIds, (ids) => {
  for (const id of ids) {
    if (values.value[id] === undefined && item.value?.category === 'ALLOWANCE') values.value[id] = 1;
  }
});
watch(itemId, () => {
  if (item.value?.category === 'ALLOWANCE') for (const id of userIds.value) values.value[id] ??= 1;
});
watch(shift, (value) => {
  if (value === 'NIGHT' && !itemId.value) {
    const night = props.items.find((i) => i.category === 'ALLOWANCE' && i.name.includes('夜班'));
    if (night) itemId.value = night.id;
  }
});

function fillAll(value: null | number) {
  for (const id of userIds.value) values.value[id] = value;
}

async function submit() {
  error.value = '';
  if (!itemId.value) error.value = '请选择项目';
  else if (userIds.value.length === 0) error.value = '请选择人员';
  else if (userIds.value.some((id) => !(values.value[id] && values.value[id]! > 0)))
    error.value = `请给每个人填写${valueLabel.value}`;
  if (error.value || !itemId.value) return;
  saving.value = true;
  try {
    const count = await createWorkRecords({
      itemId: itemId.value,
      lines: userIds.value.map((id) =>
        byHours.value ? { hours: values.value[id]!, userId: id } : { quantity: values.value[id]!, userId: id },
      ),
      remark: remark.value.trim() || undefined,
      shift: shift.value,
      workDate: workDate.value.format('YYYY-MM-DD'),
    });
    emit('saved', `已登记 ${count} 条「${item.value?.name}」，待班组长确认`);
    open.value = false;
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal v-model:open="open" :confirm-loading="saving" :width="680" ok-text="登记" title="登记报工" @ok="submit">
    <div class="flex flex-col gap-3 text-xs text-muted-foreground">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label for="record-date" class="flex flex-col gap-1">
          干活日期
          <DatePicker
            id="record-date"
            v-model:value="workDate"
            :allow-clear="false"
            :disabled-date="(d: Dayjs) => d.isAfter(dayjs(), 'day')"
            class="w-full"
          />
        </label>
        <div class="flex flex-col gap-1">
          班次
          <Radio.Group v-model:value="shift" button-style="solid" size="small">
            <Radio.Button value="DAY">白班</Radio.Button>
            <Radio.Button value="NIGHT">夜班</Radio.Button>
          </Radio.Group>
        </div>
        <label for="record-item" class="flex flex-col gap-1 sm:col-span-2">
          项目
          <Select
            id="record-item"
            v-model:value="itemId"
            :options="itemOptions"
            option-filter-prop="label"
            placeholder="计时、杂活、补助，或没走工序单的计件"
            show-search
          />
        </label>
        <label for="record-people" class="flex flex-col gap-1 sm:col-span-2">
          人员（可多选）
          <Select
            id="record-people"
            v-model:value="userIds"
            :options="peopleOptions"
            mode="multiple"
            option-filter-prop="label"
            placeholder="选择本厂人员"
          />
        </label>
      </div>
      <div v-if="userIds.length > 0 && item" class="flex flex-col gap-2 rounded-md border border-border p-3">
        <div class="flex items-center justify-between gap-2">
          <span>{{ valueLabel }}</span>
          <span class="flex items-center gap-1">
            全部填
            <InputNumber
              id="record-fill-all"
              :min="0"
              :precision="byHours ? 2 : 3"
              class="w-24"
              size="small"
              @change="(v) => fillAll((v as null | number) ?? null)"
            />
          </span>
        </div>
        <div v-for="id in userIds" :key="id" class="flex items-center justify-between gap-2 text-sm text-foreground">
          <span>{{ nameOf(id) }}</span>
          <InputNumber
            :id="`record-value-${id}`"
            :aria-label="`${nameOf(id)} ${valueLabel}`"
            :max="byHours ? 24 : undefined"
            :min="0"
            :precision="byHours ? 2 : 3"
            :value="values[id] ?? undefined"
            class="w-32"
            size="small"
            @change="(v) => (values[id] = (v as null | number | undefined) ?? null)"
          />
        </div>
        <div class="text-right text-sm text-foreground">
          预计金额 <b class="tabular-nums">{{ formatMoney(total) }}</b> 元
        </div>
      </div>
      <label for="record-remark" class="flex flex-col gap-1">
        备注
        <Input id="record-remark" v-model:value="remark" :maxlength="200" placeholder="选填" />
      </label>
      <Alert v-if="error" :message="error" show-icon type="error" />
    </div>
  </Modal>
</template>
