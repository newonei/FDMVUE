<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';
import type { ItemAmountKey } from '../item-edit-model';
import type { LeafRow } from '../tree-model';

import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import {
  Alert,
  Button,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Table,
  Tag,
} from 'ant-design-vue';

import { saveEcProfitItem } from '#/api/fdmcaiwu/ec-profit';

import {
  ITEM_AMOUNT_FIELDS,
  itemDraft,
  itemDraftChanged,
  itemSaveRequest,
  validateItemDraft,
} from '../item-edit-model';

const props = defineProps<{
  month: string;
  reportVersion: number;
  rows: LeafRow[];
  visibleRows: LeafRow[];
}>();
const emit = defineEmits<{ saved: []; cancel: [hasSaved: boolean] }>();

// 进入编辑时固定快照，筛选只控制可见行，不丢失其他行的草稿。
const entries = reactive(
  props.rows.flatMap((row) =>
    row.item
      ? [
          {
            item: row.item,
            original: itemDraft(row.item),
            draft: itemDraft(row.item),
          },
        ]
      : [],
  ),
);
const byId = computed(
  () => new Map(entries.map((entry) => [entry.item.id, entry])),
);
const changed = computed(() =>
  entries.filter((entry) => itemDraftChanged(entry.draft, entry.original)),
);
const saving = ref(false);
const error = ref('');
const savedCount = ref(0);
const fieldMode = ref<'all' | 'manual'>('manual');
let version = props.reportVersion;

const fields = computed(() =>
  ITEM_AMOUNT_FIELDS.filter(
    (field) => fieldMode.value === 'all' || !('imported' in field),
  ),
);
const columns = computed<TableColumnsType>(() => [
  { key: 'name', title: '店铺 / 费用', width: 230, fixed: 'left' },
  ...fields.value.map((field) => ({
    key: field.key,
    title: field.label,
    width: 155,
  })),
  { key: 'platformFeeAdjustmentReason', title: '平台调整原因', width: 240 },
  { key: 'remark', title: '备注', width: 220 },
]);
const scrollX = computed(() =>
  columns.value.reduce((total, column) => total + Number(column.width), 0),
);
const visible = computed(() =>
  props.visibleRows.filter((row) => row.item && byId.value.has(row.item.id)),
);
function draft(id: number) {
  return byId.value.get(id)!.draft;
}
function setAmount(
  id: number,
  key: ItemAmountKey,
  value: null | number | string,
) {
  draft(id)[key] = value === '' ? null : value;
}

async function confirmLeave(): Promise<boolean> {
  if (saving.value) return false;
  if (changed.value.length === 0) return true;
  return new Promise((resolve) => {
    Modal.confirm({
      title: `还有 ${changed.value.length} 行未保存，放弃修改？`,
      content: '已成功保存的行会保留，未保存的填写内容将丢失。',
      okText: '放弃修改',
      cancelText: '继续填写',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}
async function cancel() {
  if (await confirmLeave()) {
    emit('cancel', savedCount.value > 0);
  }
}
async function save() {
  if (saving.value || changed.value.length === 0) return;
  error.value = '';
  const pending = [...changed.value];
  for (const entry of pending) {
    const invalid = validateItemDraft(entry.draft);
    if (invalid) {
      error.value = `${entry.item.shopName}：${invalid}`;
      return;
    }
  }
  saving.value = true;
  let current = pending[0]!;
  try {
    // 每次成功只使月报版本 +1。串行提交，任一失败立即停止，不覆盖并发修改。
    for (const entry of pending) {
      current = entry;
      await saveEcProfitItem(
        itemSaveRequest(entry.item, entry.draft, props.month, version),
      );
      version++;
      savedCount.value++;
      entry.original = { ...entry.draft };
    }
    emit('saved');
  } catch {
    error.value = `「${current.item.shopName}」保存失败。已保存 ${savedCount.value} 行，其余 ${changed.value.length} 行仍保留，可重试；如月报已被他人修改，请先记录未保存内容，退出后刷新核对。`;
  } finally {
    saving.value = false;
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (saving.value || changed.value.length > 0) {
    event.preventDefault();
    event.returnValue = '';
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
defineExpose({ confirmLeave });
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="text-sm">
        直接填写，按 Tab 连续切换 · 空白表示未填，0 表示零金额
        <Tag class="!ml-2 !mr-0" color="blue"
          >{{ changed.length }} 行待保存</Tag
        >
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Segmented
          v-model:value="fieldMode"
          :disabled="saving"
          :options="[
            { label: '手工字段', value: 'manual' },
            { label: '全部字段', value: 'all' },
          ]"
        />
        <Button :disabled="saving" @click="cancel">退出编辑</Button>
        <Button
          type="primary"
          :disabled="changed.length === 0"
          :loading="saving"
          @click="save"
        >
          保存 {{ changed.length }} 行
        </Button>
      </div>
    </div>
    <Alert v-if="error" :message="error" type="error" show-icon />
    <Table
      :columns="columns"
      :data-source="visible"
      :pagination="false"
      :scroll="{ x: scrollX, y: 560 }"
      row-key="key"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <div class="truncate font-medium" :title="record.name">
            {{ record.name }}
          </div>
          <div class="text-xs text-muted-foreground">
            {{ record.groupLabel }}
          </div>
          <Tag
            v-if="
              itemDraftChanged(
                draft(record.item.id),
                byId.get(record.item.id)!.original,
              )
            "
            color="gold"
            >未保存</Tag
          >
        </template>
        <Input
          v-else-if="
            column.key === 'platformFeeAdjustmentReason' ||
            column.key === 'remark'
          "
          v-model:value="
            draft(record.item.id)[
              column.key as 'platformFeeAdjustmentReason' | 'remark'
            ]
          "
          :disabled="saving"
          :maxlength="500"
          :aria-label="`${record.name} ${column.title}`"
          :placeholder="column.key === 'remark' ? '备注' : '调整非零时必填'"
        />
        <InputNumber
          v-else
          :value="
            draft(record.item.id)[column.key as ItemAmountKey] ?? undefined
          "
          :disabled="saving"
          :precision="6"
          :controls="false"
          string-mode
          class="!w-full"
          placeholder="未填"
          :aria-label="`${record.name} ${column.title}`"
          @update:value="
            (value) =>
              setAmount(record.item.id, column.key as ItemAmountKey, value)
          "
        />
      </template>
    </Table>
    <div class="text-xs text-muted-foreground">
      保存会更新毛利和分组合计；切换筛选仍会保留所有未保存行。
    </div>
  </div>
</template>
