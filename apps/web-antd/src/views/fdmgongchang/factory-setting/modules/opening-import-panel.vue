<script setup lang="ts">
import type { OpeningParsed } from './opening-model';

import type {
  FdmgongchangOpeningApi,
  FdmgongchangStageStockApi,
} from '#/api/fdmgongchang/stage-stock';

import { computed, onMounted, ref } from 'vue';

import {
  Alert,
  Button,
  Input,
  InputNumber,
  message,
  Select,
  Table,
} from 'ant-design-vue';

import {
  getStageStockOptions,
  importOpeningStock,
} from '#/api/fdmgongchang/stage-stock';

import { OPENING_COLUMNS, parseCsv, toOpeningRows } from './opening-model';

/**
 * 期初导入：上传盘点 CSV，按色号、尺寸、配方建物料（色号自动进颜色配置），在本厂对应仓库开一张常规入库单。
 * 同一物料的几行合并；任何一行不对整批不导。入错了在库存中心作废这张入库单。
 */
const options = ref<FdmgongchangStageStockApi.Options>();
const stage = ref('BOARD');
const material = ref('TPE');
const recipeCode = ref('REC-001');
const thickness = ref(4.5);
const source = ref('期初库存');
const remark = ref('');
const fileName = ref('');
const table = ref<string[][]>([]);
const key = ref('');
const importing = ref(false);
const result = ref<FdmgongchangOpeningApi.Result>();

const stageOptions = computed(() =>
  (options.value?.stages ?? [])
    .filter((s) => !['AUX', 'PACKED', 'RAW'].includes(s.code))
    .map((s) => ({ label: s.label, value: s.code })),
);
const parsed = computed<OpeningParsed>(() =>
  table.value.length === 0
    ? { errors: [], rows: [], total: 0 }
    : toOpeningRows(table.value, {
        material: material.value,
        recipeCode: recipeCode.value,
        thickness: thickness.value,
      }),
);
const preview = computed(() =>
  parsed.value.rows.slice(0, 200).map((r, i) => ({
    key: i,
    colorCode: r.colorCode,
    size: `${r.attrs.length}×${r.attrs.width}×${r.attrs.thickness}`,
    recipe: r.attrs.recipeCode,
    quantity: r.quantity,
    remark: r.remark,
  })),
);
const columns = [
  { title: '色号', dataIndex: 'colorCode' },
  { title: '长×宽×厚 cm', dataIndex: 'size' },
  { title: '配方', dataIndex: 'recipe' },
  { title: '数量', dataIndex: 'quantity' },
  { title: '备注', dataIndex: 'remark' },
];

onMounted(async () => {
  options.value = await getStageStockOptions();
});

async function pick(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  fileName.value = file.name;
  table.value = parseCsv(await file.text());
  key.value = `opening-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  result.value = undefined;
}

async function submit() {
  if (parsed.value.errors.length > 0 || parsed.value.rows.length === 0) return;
  importing.value = true;
  try {
    result.value = await importOpeningStock({
      idempotencyKey: key.value,
      remark: remark.value.trim() || undefined,
      rows: parsed.value.rows,
      source: source.value.trim() || undefined,
      stage: stage.value,
    });
    message.success(`已入库 ${result.value.docCode}`);
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <h2 class="m-0 text-sm font-semibold">
      期初导入<span class="ml-2 text-xs font-normal text-muted-foreground">上传盘点 CSV，在本厂仓库开一张常规入库单；同一物料的几行合并，入错了在库存中心作废</span>
    </h2>
    <p class="m-0 text-xs text-muted-foreground">
      表头：{{ OPENING_COLUMNS.join('、') }}。色号、长、宽、数量必填；厚、材质、配方为空时用下面的默认值；数量为 0 的行跳过；色号在颜色配置里没有的会自动新建。
    </p>
    <div class="flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">库存阶段</span>
        <Select v-model:value="stage" :options="stageOptions" class="w-32" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">默认材质</span>
        <Select
          v-model:value="material"
          :options="(options?.materials ?? []).map((m) => ({ label: m.label, value: m.value }))"
          class="w-36"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">默认配方</span>
        <Select
          v-model:value="recipeCode"
          :options="(options?.recipes ?? []).filter((r) => r.enabled).map((r) => ({ label: r.name, value: r.code }))"
          class="w-44"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">默认厚度 cm</span>
        <InputNumber v-model:value="thickness" :min="0.01" :max="1000" class="w-28" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">入库来源</span>
        <Input v-model:value="source" :maxlength="200" class="w-36" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">备注</span>
        <Input v-model:value="remark" :maxlength="2000" class="w-72" />
      </label>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <label class="ant-btn ant-btn-default cursor-pointer">
        选择 CSV 文件
        <input
          type="file"
          accept=".csv,text/csv"
          class="hidden"
          aria-label="选择 CSV 文件"
          @change="pick"
        />
      </label>
      <span v-if="fileName" class="text-sm">
        {{ fileName }}：{{ parsed.rows.length }} 行，共 {{ parsed.total }}
      </span>
      <Button
        type="primary"
        :disabled="!fileName || parsed.errors.length > 0 || parsed.rows.length === 0"
        :loading="importing"
        @click="submit"
      >
        导入
      </Button>
    </div>
    <Alert
      v-if="parsed.errors.length > 0"
      type="error"
      show-icon
      :message="`有 ${parsed.errors.length} 处问题，改好后重新选择文件`"
    >
      <template #description>
        <div v-for="e in parsed.errors.slice(0, 20)" :key="e">{{ e }}</div>
      </template>
    </Alert>
    <Alert
      v-if="result"
      type="success"
      show-icon
      :message="`已在${result.warehouseName}入库 ${result.docCode}：${result.lines} 种、共 ${result.quantity}；新建物料 ${result.newItems} 种、新建色号 ${result.newColors} 个`"
    />
    <Table
      v-if="preview.length > 0"
      :columns="columns"
      :data-source="preview"
      :pagination="{ pageSize: 20, showSizeChanger: false }"
      size="small"
    />
  </section>
</template>
