<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { FdmgongchangWageApi as Api } from '#/api/fdmgongchang/wage';

import { computed, reactive, ref, watch } from 'vue';

import {
  Alert,
  AutoComplete,
  DatePicker,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { createWageItem, updateWageItem } from '#/api/fdmgongchang/wage';

import {
  CATEGORY_LABELS,
  PRODUCT_TYPE_OPTIONS,
  ROLE_OPTIONS,
  toNum,
  UNIT_OPTIONS,
} from '../../shared/wage';

/** 新建 / 修改计价项目：修改时不改价格，调价走「调价」。 */
const props = defineProps<{
  item?: Api.Item;
  items: Api.Item[];
  processes: Array<{ code: string; label: string }>;
}>();
const emit = defineEmits<{ saved: [message: string] }>();
const open = defineModel<boolean>('open', { required: true });

const form = reactive({
  baseItemId: undefined as number | undefined,
  category: 'PROCESS' as Api.Category,
  coefficient: undefined as number | undefined,
  lengthMinMm: undefined as number | undefined,
  name: '',
  price: undefined as number | undefined,
  pricing: 'price' as 'coefficient' | 'price',
  process: undefined as string | undefined,
  productType: '',
  remark: '',
  role: '',
  sort: undefined as number | undefined,
  thicknessMaxMm: undefined as number | undefined,
  thicknessMinMm: undefined as number | undefined,
  unit: '',
  widthMm: undefined as number | undefined,
});
const effectiveFrom = ref<Dayjs>(dayjs().startOf('month'));
const error = ref('');
const saving = ref(false);
const editing = computed(() => !!props.item);

const baseOptions = computed(() =>
  props.items
    .filter(
      (i) =>
        i.category === form.category &&
        !i.baseItemId &&
        i.id !== props.item?.id,
    )
    .map((i) => ({ label: i.name, value: i.id })),
);

watch(open, (value) => {
  if (!value) return;
  error.value = '';
  const i = props.item;
  Object.assign(form, {
    baseItemId: i?.baseItemId ?? undefined,
    category: i?.category ?? 'PROCESS',
    coefficient: toNum(i?.coefficient),
    lengthMinMm: i?.lengthMinMm ?? undefined,
    name: i?.name ?? '',
    price: undefined,
    pricing: i?.baseItemId ? 'coefficient' : 'price',
    process: i?.process ?? props.processes[0]?.code,
    productType: i?.productType ?? '',
    remark: i?.remark ?? '',
    role: i?.role ?? '',
    sort: i?.sort ?? undefined,
    thicknessMaxMm: toNum(i?.thicknessMaxMm),
    thicknessMinMm: toNum(i?.thicknessMinMm),
    unit: i?.unit ?? '',
    widthMm: i?.widthMm ?? undefined,
  });
  effectiveFrom.value = dayjs().startOf('month');
});

/** 修改时从按系数改成按单价，需要补一个价格。 */
const needsPrice = computed(
  () =>
    form.pricing === 'price' && (!editing.value || !!props.item?.baseItemId),
);

async function submit() {
  error.value = '';
  if (!form.name.trim()) error.value = '请填写项目名称';
  else if (!form.unit.trim()) error.value = '请填写单位';
  else if (form.category === 'PROCESS' && !form.process)
    error.value = '工序计件要选择对应的工序';
  else if (form.pricing === 'coefficient' && (!form.baseItemId || !form.coefficient))
    error.value = '按系数计价要选择基准项目并填写系数';
  else if (needsPrice.value && form.price === undefined)
    error.value = '请填写单价';
  if (error.value) return;
  const byCoefficient = form.pricing === 'coefficient';
  const data: Api.ItemSaveReq = {
    baseItemId: byCoefficient ? form.baseItemId : null,
    category: form.category,
    coefficient: byCoefficient ? form.coefficient : null,
    effectiveFrom: effectiveFrom.value.format('YYYY-MM-DD'),
    id: props.item?.id,
    lengthMinMm: form.category === 'PROCESS' ? (form.lengthMinMm ?? null) : null,
    name: form.name.trim(),
    price: byCoefficient ? null : form.price,
    process: form.category === 'PROCESS' ? form.process : null,
    productType:
      form.category === 'PROCESS' ? form.productType.trim() || null : null,
    remark: form.remark.trim() || null,
    role: form.role.trim() || null,
    sort: form.sort ?? null,
    thicknessMaxMm:
      form.category === 'PROCESS' ? (form.thicknessMaxMm ?? null) : null,
    thicknessMinMm:
      form.category === 'PROCESS' ? (form.thicknessMinMm ?? null) : null,
    unit: form.unit.trim(),
    widthMm: form.category === 'PROCESS' ? (form.widthMm ?? null) : null,
  };
  saving.value = true;
  try {
    if (editing.value) {
      await updateWageItem(data);
      emit('saved', `已保存「${data.name}」`);
    } else {
      await createWageItem(data);
      emit('saved', `已新建「${data.name}」`);
    }
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
    :title="editing ? `修改计价项目 · ${item?.name ?? ''}` : '新建计价项目'"
    :width="680"
    ok-text="保存"
    @ok="submit"
  >
    <div class="grid grid-cols-1 gap-3 text-xs text-muted-foreground sm:grid-cols-2">
      <div class="flex flex-col gap-1 sm:col-span-2">
        类别
        <Radio.Group v-model:value="form.category" button-style="solid" size="small">
          <Radio.Button v-for="(label, code) in CATEGORY_LABELS" :key="code" :value="code">
            {{ label }}
          </Radio.Button>
        </Radio.Group>
      </div>
      <label for="wage-item-name" class="flex flex-col gap-1">
        项目名称
        <Input id="wage-item-name" v-model:value="form.name" :maxlength="64" placeholder="例如 复合800（15厚）" />
      </label>
      <label for="wage-item-unit" class="flex flex-col gap-1">
        单位
        <AutoComplete
          id="wage-item-unit"
          v-model:value="form.unit"
          :options="UNIT_OPTIONS.map((u) => ({ value: u }))"
          placeholder="片 / 件 / 小时 / 班 …"
        />
      </label>
      <label v-if="form.category === 'PROCESS'" for="wage-item-process" class="flex flex-col gap-1">
        工序
        <Select
          id="wage-item-process"
          v-model:value="form.process"
          :options="processes.map((p) => ({ label: p.label, value: p.code }))"
        />
      </label>
      <label for="wage-item-role" class="flex flex-col gap-1">
        岗位角色（选填）
        <AutoComplete
          id="wage-item-role"
          v-model:value="form.role"
          :options="ROLE_OPTIONS.map((u) => ({ value: u }))"
          placeholder="例如 送片、接片"
        />
      </label>

      <template v-if="form.category === 'PROCESS'">
        <div class="flex flex-col gap-1 sm:col-span-2">
          <span>适用条件（留空为不限；报产出时按产出的宽、长、厚自动推荐）</span>
          <div class="flex flex-wrap items-center gap-2">
            <InputNumber id="wage-item-width" v-model:value="form.widthMm" :min="1" :precision="0" addon-before="宽" addon-after="mm" class="w-40" />
            <InputNumber id="wage-item-length" v-model:value="form.lengthMinMm" :min="1" :precision="0" addon-before="长 ≥" addon-after="mm" class="w-44" />
            <InputNumber id="wage-item-tmin" v-model:value="form.thicknessMinMm" :min="0.01" :precision="2" addon-before="厚 ≥" addon-after="mm" class="w-40" />
            <InputNumber id="wage-item-tmax" v-model:value="form.thicknessMaxMm" :min="0.01" :precision="2" addon-before="厚 ≤" addon-after="mm" class="w-40" />
          </div>
        </div>
        <label for="wage-item-product" class="flex flex-col gap-1">
          产品类型（选填，需人工选择）
          <AutoComplete
            id="wage-item-product"
            v-model:value="form.productType"
            :options="PRODUCT_TYPE_OPTIONS.map((u) => ({ value: u }))"
            placeholder="例如 双人垫、圆形垫"
          />
        </label>
      </template>

      <div class="flex flex-col gap-1 sm:col-span-2">
        计价方式
        <Radio.Group v-model:value="form.pricing" size="small">
          <Radio value="price">按单价</Radio>
          <Radio value="coefficient">按系数（基准项目单价 × 系数）</Radio>
        </Radio.Group>
      </div>
      <template v-if="form.pricing === 'coefficient'">
        <label for="wage-item-base" class="flex flex-col gap-1">
          基准项目
          <Select id="wage-item-base" v-model:value="form.baseItemId" :options="baseOptions" placeholder="例如 发泡" />
        </label>
        <label for="wage-item-coefficient" class="flex flex-col gap-1">
          系数
          <InputNumber id="wage-item-coefficient" v-model:value="form.coefficient" :min="0.0001" :precision="4" class="w-full" placeholder="例如 1.05" />
        </label>
      </template>
      <template v-else-if="needsPrice">
        <label for="wage-item-price" class="flex flex-col gap-1">
          单价（元）
          <InputNumber id="wage-item-price" v-model:value="form.price" :min="0" :precision="4" class="w-full" />
        </label>
        <label for="wage-item-effective" class="flex flex-col gap-1">
          生效日期
          <DatePicker id="wage-item-effective" v-model:value="effectiveFrom" :allow-clear="false" class="w-full" />
        </label>
      </template>
      <p v-else class="m-0 text-xs sm:col-span-2">价格不在这里改，请用列表里的「调价」，会保留调价前的价格。</p>

      <label for="wage-item-sort" class="flex flex-col gap-1">
        排序
        <InputNumber id="wage-item-sort" v-model:value="form.sort" :precision="0" class="w-full" placeholder="小的在前" />
      </label>
      <label for="wage-item-remark" class="flex flex-col gap-1">
        备注
        <Input id="wage-item-remark" v-model:value="form.remark" :maxlength="255" placeholder="选填" />
      </label>
      <Alert v-if="error" :message="error" class="sm:col-span-2" show-icon type="error" />
    </div>
  </Modal>
</template>
