<script setup lang="ts">
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Input,
  InputNumber,
  message,
  Modal,
  Radio,
  Select,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { receiveStock } from '#/api/fdmgongchang/stage-stock';

import { normalizeForStage, RAW_CATEGORY_LABELS, stageFields } from '../model';
import AttrFields from './attr-fields.vue';

/** 原料入库（只入原材料）与期初入库（上线时录入各阶段现有库存）。 */
const props = defineProps<{ options: Api.Options; stage: string }>();
const emit = defineEmits<{ saved: [] }>();
const open = defineModel<boolean>('open', { required: true });
const type = ref<Api.ReceiveType>('RAW_RECEIPT');
const attrs = ref<Api.ItemAttrs>({});
const batchNo = ref('');
const location = ref('');
const quantity = ref<number>();
const remark = ref('');
const saving = ref(false);
const errors = ref<string[]>([]);

const stageOption = computed(() =>
  props.options.stages.find((s) => s.code === props.stage),
);
const isRaw = computed(() => props.stage === 'RAW');
const rawOptions = computed(() =>
  props.options.rawMaterials.map((m) => ({
    label: `${m.name}（${m.code}）· ${RAW_CATEGORY_LABELS[m.category] ?? m.category}`,
    value: m.code,
  })),
);

watch(open, (value) => {
  if (!value) return;
  type.value = isRaw.value ? 'RAW_RECEIPT' : 'OPENING';
  attrs.value = isRaw.value
    ? {}
    : {
        material: props.options.materials.find(
          (m) => m.value.toUpperCase() === 'TPE',
        )?.value,
      };
  batchNo.value = isRaw.value ? `RM${dayjs().format('MMDD')}` : '';
  location.value = '';
  quantity.value = undefined;
  remark.value = '';
  errors.value = [];
});

async function submit() {
  const problems: string[] = [];
  if (isRaw.value && !attrs.value.rawMaterialCode)
    problems.push('请选择原材料。');
  if (!batchNo.value.trim()) problems.push('请填写批次。');
  if (!quantity.value || quantity.value <= 0)
    problems.push('请填写大于 0 的入库数量。');
  errors.value = problems;
  if (problems.length > 0) return;
  saving.value = true;
  try {
    await receiveStock({
      attrs: isRaw.value
        ? { rawMaterialCode: attrs.value.rawMaterialCode }
        : normalizeForStage(props.stage, attrs.value),
      batchNo: batchNo.value.trim(),
      location: location.value.trim() || undefined,
      quantity: quantity.value!,
      remark: remark.value.trim() || undefined,
      stage: props.stage,
      type: type.value,
    });
    message.success(
      `${stageOption.value?.label ?? ''}已入库 ${quantity.value} ${stageOption.value?.unit ?? ''}`,
    );
    open.value = false;
    emit('saved');
  } catch {
    // 后端错误已由全局提示展示，保留弹窗方便修改
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    :title="isRaw ? '原料入库' : `期初入库 · ${stageOption?.label ?? ''}`"
    :confirm-loading="saving"
    ok-text="确认入库"
    width="640px"
    @ok="submit"
  >
    <div class="flex flex-col gap-3 py-2">
      <Radio.Group
        v-if="isRaw"
        v-model:value="type"
        button-style="solid"
        size="small"
      >
        <Radio.Button value="RAW_RECEIPT">原料入库</Radio.Button>
        <Radio.Button value="OPENING">期初入库</Radio.Button>
      </Radio.Group>
      <Alert
        v-if="!isRaw"
        type="info"
        show-icon
        message="这一段库存平时由工序单报完工产生。期初入库只用于上线时录入仓库里已有的库存。"
      />
      <label
        v-if="isRaw"
        for="receive-raw"
        class="flex flex-col gap-1 text-xs text-muted-foreground"
      >
        原材料（来自财务部门的原材料价格表）
        <Select
          id="receive-raw"
          :value="attrs.rawMaterialCode ?? undefined"
          :options="rawOptions"
          option-filter-prop="label"
          placeholder="搜索名称或编码"
          show-search
          @change="(v) => (attrs = { rawMaterialCode: v as string })"
        />
      </label>
      <AttrFields
        v-else
        v-model="attrs"
        :fields="stageFields(stage)"
        :options="options"
        id-prefix="receive"
      />
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label
          for="receive-batch"
          class="flex flex-col gap-1 text-xs text-muted-foreground"
        >
          批次
          <Input
            id="receive-batch"
            v-model:value="batchNo"
            :maxlength="128"
            placeholder="例如 MB-0928-01"
          />
        </label>
        <label
          for="receive-location"
          class="flex flex-col gap-1 text-xs text-muted-foreground"
        >
          库位
          <Input
            id="receive-location"
            v-model:value="location"
            :maxlength="64"
            :placeholder="`默认 ${stageOption?.defaultLocation ?? ''}`"
          />
        </label>
        <label
          for="receive-qty"
          class="flex flex-col gap-1 text-xs text-muted-foreground"
        >
          数量（{{ stageOption?.unit }}）
          <InputNumber
            id="receive-qty"
            v-model:value="quantity"
            :min="0"
            :precision="3"
            class="w-full"
          />
        </label>
        <label
          for="receive-remark"
          class="flex flex-col gap-1 text-xs text-muted-foreground"
        >
          备注
          <Input
            id="receive-remark"
            v-model:value="remark"
            :maxlength="500"
            placeholder="选填"
          />
        </label>
      </div>
      <Alert v-if="errors.length > 0" type="error" show-icon>
        <template #message>
          <ul class="m-0 list-disc pl-4">
            <li v-for="e in errors" :key="e">{{ e }}</li>
          </ul>
        </template>
      </Alert>
    </div>
  </Modal>
</template>
