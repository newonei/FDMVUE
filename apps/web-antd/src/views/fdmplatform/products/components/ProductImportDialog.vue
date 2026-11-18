<script setup lang="ts">
import type {
  ProductImportCorrections,
  ProductImportResult,
  ProductImportRow,
} from '#/api/fdmplatform/products';

import { computed, ref, shallowRef } from 'vue';

import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Alert,
  Button,
  Checkbox,
  Modal,
  Space,
  Table,
  Tag,
  Upload,
} from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import {
  downloadProductImportTemplate,
  importProducts,
  previewProductImport,
} from '#/api/fdmplatform/products';

import { errorText } from '../../data';
import { productProcessText } from '../attributes';
import {
  configurationMissingFields,
  productDimensionsText,
  productPatternText,
  productSliceThicknessText,
  productThicknessProcessText,
} from '../manufacturing';
import ProductColorSummary from './ProductColorSummary.vue';
import ProductImportRowEditor from './ProductImportRowEditor.vue';

const props = defineProps<{ companyId: number; open: boolean }>();
const emit = defineEmits<{ close: []; imported: [] }>();
const { Dragger } = Upload;
const file = shallowRef<File>();
const result = ref<ProductImportResult>();
const previewing = ref(false);
const importing = ref(false);
const downloading = ref(false);
const completed = ref(false);
const panelError = ref('');
const onlyIssues = ref(false);
const idempotencyKey = ref('');
const corrections = shallowRef<ProductImportCorrections>({});
const validatedCorrections = shallowRef(corrections.value);
const editing = ref<ProductImportRow>();
const busy = computed(() => previewing.value || importing.value);
const needsValidation = computed(
  () => corrections.value !== validatedCorrections.value,
);
const editingCells = computed(() => {
  const row = editing.value;
  return row ? { ...row.rawCells, ...corrections.value[row.rowNumber] } : {};
});
const dirtyRows = computed(
  () =>
    new Set(
      Object.keys(corrections.value)
        .map(Number)
        .filter(
          (rowNumber) =>
            validatedCorrections.value[rowNumber] !==
            corrections.value[rowNumber],
        ),
    ),
);
const reusableCount = computed(
  () =>
    result.value?.rows.filter(
      (row) => row.status === 'REUSE' || row.status === 'REUSED',
    ).length ?? 0,
);
const reuseDisplayCount = computed(() =>
  completed.value
    ? (result.value?.reusedCount ?? reusableCount.value)
    : reusableCount.value,
);
const importableCount = computed(
  () =>
    (result.value?.readyCount ?? 0) +
    (completed.value ? 0 : reusableCount.value),
);
const incompleteCount = computed(
  () =>
    result.value?.rows.filter(
      (row) =>
        row.status !== 'ERROR' &&
        configurationMissingFields(row.values).length > 0,
    ).length ?? 0,
);
const rows = computed(() =>
  (result.value?.rows ?? [])
    .filter(
      (row) =>
        !onlyIssues.value ||
        row.status === 'ERROR' ||
        row.status === 'SKIPPED' ||
        dirtyRows.value.has(row.rowNumber),
    )
    .map((row) => {
      if (!dirtyRows.value.has(row.rowNumber)) return row;
      const changes = corrections.value[row.rowNumber];
      return {
        ...row,
        code: changes?.['产品编号'] ?? row.code,
        name: changes?.['产品名称'] ?? row.name,
      };
    }),
);
const columns = computed(() => [
  { title: 'Excel 行', dataIndex: 'rowNumber', width: 80 },
  { title: '产品编号 / 名称', key: 'product', width: 195 },
  { title: '校验结果', key: 'status', width: 270 },
  { title: '型号 / 规格 / 单位', key: 'specification', width: 180 },
  { title: '成品尺寸 / 雕刻版本', key: 'configuration', width: 190 },
  { title: '颜色 / 制造结构', key: 'colors', width: 175 },
  { title: '生产分类 / 工艺属性', key: 'production', width: 180 },
  { title: '分类 / 状态', key: 'category', width: 125 },
  ...(completed.value
    ? []
    : [{ title: '操作', key: 'action', width: 76, fixed: 'right' as const }]),
]);
const statusText: Record<ProductImportRow['status'], string> = {
  ERROR: '待修正',
  IMPORTED: '已导入',
  READY: '可新增',
  REUSE: '复用已有 SKU',
  REUSED: '已复用 SKU',
  SKIPPED: '已跳过',
};
const statusColor: Record<ProductImportRow['status'], string> = {
  ERROR: 'red',
  IMPORTED: 'green',
  READY: 'blue',
  REUSE: 'cyan',
  REUSED: 'green',
  SKIPPED: 'default',
};

const failedRows = computed(() =>
  (result.value?.rows ?? []).filter((row) => row.status === 'ERROR'),
);
/** 失败清单：行号、编号、名称、失败原因，便于在原 Excel 里逐行修改。 */
function downloadFailures() {
  const quote = (value: unknown) =>
    `"${String(value ?? '').replaceAll('"', '""')}"`;
  const lines = [
    ['Excel 行', '产品编号', '产品名称', '失败原因']
      .map((cell) => quote(cell))
      .join(','),
    ...failedRows.value.map((row) =>
      [row.rowNumber, row.code, row.name, row.message]
        .map((cell) => quote(cell))
        .join(','),
    ),
  ];
  downloadFileFromBlobPart({
    source: new Blob([`\uFEFF${lines.join('\n')}`], {
      type: 'text/csv;charset=utf-8',
    }),
    fileName: '产品导入失败清单.csv',
  });
}

function clearFile() {
  if (busy.value) return;
  file.value = undefined;
  result.value = undefined;
  completed.value = false;
  panelError.value = '';
  onlyIssues.value = false;
  idempotencyKey.value = '';
  corrections.value = {};
  validatedCorrections.value = corrections.value;
  editing.value = undefined;
}
function chooseFile(selected: File) {
  if (busy.value) return false;
  clearFile();
  if (!/\.(xls|xlsx)$/i.test(selected.name)) {
    panelError.value = '请选择 .xls 或 .xlsx 格式的 Excel 文件';
    return false;
  }
  if (selected.size === 0 || selected.size > 10 * 1024 * 1024) {
    panelError.value = '文件不能为空，且大小不能超过 10 MB';
    return false;
  }
  file.value = selected;
  idempotencyKey.value = newIdempotencyKey();
  void preview();
  return false;
}
async function preview() {
  if (!file.value || busy.value || completed.value || editing.value) return;
  previewing.value = true;
  panelError.value = '';
  const changes = corrections.value;
  const hadResult = Boolean(result.value);
  try {
    const next =
      Object.keys(changes).length > 0
        ? await previewProductImport(file.value, props.companyId, changes)
        : await previewProductImport(file.value, props.companyId);
    result.value = next;
    validatedCorrections.value = changes;
    const issues = next.errorCount + next.skippedCount;
    if (!hadResult || issues === 0) onlyIssues.value = issues > 0;
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    previewing.value = false;
  }
}
function saveRowChanges(changes: Record<string, string>) {
  const row = editing.value;
  if (!row || busy.value || completed.value) return;
  if (Object.keys(changes).length > 0) {
    corrections.value = {
      ...corrections.value,
      [row.rowNumber]: { ...corrections.value[row.rowNumber], ...changes },
    };
    idempotencyKey.value = newIdempotencyKey();
    panelError.value = '';
  }
  editing.value = undefined;
}
async function submit() {
  if (
    !file.value ||
    !result.value?.previewHash ||
    importableCount.value < 1 ||
    needsValidation.value ||
    busy.value ||
    completed.value ||
    editing.value
  )
    return;
  importing.value = true;
  panelError.value = '';
  try {
    result.value = await importProducts({
      file: file.value,
      companyId: props.companyId,
      ...(Object.keys(corrections.value).length > 0
        ? { corrections: corrections.value }
        : {}),
      previewHash: result.value.previewHash,
      idempotencyKey: idempotencyKey.value,
    });
    completed.value = true;
    emit('imported');
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    importing.value = false;
  }
}
async function downloadTemplate() {
  if (downloading.value) return;
  downloading.value = true;
  panelError.value = '';
  try {
    const source = await downloadProductImportTemplate(props.companyId);
    downloadFileFromBlobPart({ source, fileName: '产品信息导入模板.xlsx' });
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    title="Excel 导入产品"
    width="min(1180px, 96vw)"
    :style="{ top: '24px' }"
    :body-style="{
      maxHeight: 'calc(100dvh - 200px)',
      overflowY: 'auto',
      paddingRight: '4px',
    }"
    :closable="!busy && !editing"
    :mask-closable="false"
    :keyboard="!busy && !editing"
    @cancel="!busy && !editing && emit('close')"
  >
    <div class="import-stack">
      <div v-if="!result" class="import-guide">
        <div><strong>1. 准备文件</strong><span>按模板填写产品资料</span></div>
        <div :class="{ 'step-active': file && !completed }">
          <strong>2. 校验预览</strong><span>核对并在线修正问题行</span>
        </div>
        <div :class="{ 'step-active': completed }">
          <strong>3. 导入产品</strong><span>新增或复用已核实 SKU</span>
        </div>
      </div>
      <div v-if="!result" class="import-template-row">
        <div>
          <strong>产品信息导入模板</strong>
          <p>兼容「产品信息导入模版0226.xlsx」，每次最多 200 行、10 MB。</p>
        </div>
        <Button :loading="downloading" @click="downloadTemplate">
          下载 Excel 模板
        </Button>
      </div>
      <Dragger
        :class="{ 'import-upload-compact': result }"
        :before-upload="chooseFile"
        :show-upload-list="false"
        :multiple="false"
        :disabled="busy"
        accept=".xls,.xlsx"
      >
        <div v-if="!result" class="import-upload-mark" aria-hidden="true">
          XLSX
        </div>
        <p class="import-upload-title">
          {{ file ? file.name : '点击选择或拖入 Excel 文件' }}
        </p>
        <p class="import-muted">
          {{
            file
              ? `${(file.size / 1024).toFixed(1)} KB · 更换文件将清除本次在线修正`
              : '支持 .xlsx / .xls，选择文件后自动校验并显示预览'
          }}
        </p>
      </Dragger>
      <div v-if="file" class="import-file-actions">
        <span class="import-muted">{{
          completed
            ? '本次导入已完成，选择新文件可继续导入。'
            : '长宽厚填写成品毫米数；单色只填正面颜色，反面自动同色；正反纹路分别填写，开片厚度自动计算。'
        }}</span>
        <Space>
          <Button
            v-if="result"
            size="small"
            type="link"
            :loading="downloading"
            @click="downloadTemplate"
          >
            下载模板
          </Button>
          <Button size="small" type="link" :disabled="busy" @click="clearFile">
            移除文件
          </Button>
        </Space>
      </div>
      <Alert v-if="panelError" type="error" show-icon :message="panelError" />
      <Alert
        v-if="previewing && !result"
        type="info"
        show-icon
        message="正在读取并校验产品数据…"
      />
      <Alert
        v-if="!result"
        type="info"
        show-icon
        message="使用一张产品档案表，每行填写一个具体 SKU 的名称、长宽厚、单双色、正反颜色、正反纹路和雕刻图案生产版本。完整配置相同会复用已有 SKU，配置不同则新增。"
        description="只填写成品厚度，无需填写两面层厚。单色正面选一种颜色，反面可空并自动同色；双色填写两种不同颜色。正反纹路独立填写，无纹路明确选择无纹路；不雕刻明确选择无雕刻。旧表缺失配置保持待核实。"
      />
      <template v-if="result">
        <Alert
          v-if="completed"
          type="success"
          show-icon
          :message="`导入完成：新增 ${result.createdCount} 个产品，复用 ${result.reusedCount ?? reusableCount} 个 SKU，导入失败 ${result.errorCount} 行。`"
        />
        <Alert
          v-for="(warning, index) in result.warnings"
          :key="index"
          type="warning"
          show-icon
          :message="warning"
        />
        <div class="import-results">
          <div>
            <span>数据总行数</span><strong>{{ result.totalCount }}</strong>
          </div>
          <div class="result-ready">
            <span>{{ completed ? '已新增' : '可导入' }}</span><strong>{{
              completed ? result.createdCount : result.readyCount
            }}</strong>
          </div>
          <div class="result-error">
            <span>{{ completed ? '导入失败' : '待修正' }}</span><strong>{{ result.errorCount }}</strong>
          </div>
          <div>
            <span>复用已有 SKU</span><strong>{{ reuseDisplayCount }}</strong>
          </div>
          <div>
            <span>资料待补齐</span><strong>{{ incompleteCount }}</strong>
          </div>
        </div>
        <div class="import-preview-heading">
          <strong>{{ completed ? '导入结果' : '数据预览' }}</strong>
          <span>
            <Checkbox v-model:checked="onlyIssues">仅看问题行</Checkbox>
            <Button
              v-if="failedRows.length > 0"
              size="small"
              :disabled="busy || needsValidation"
              @click="downloadFailures"
            >
              下载失败清单（{{ failedRows.length }} 行）
            </Button>
          </span>
        </div>
        <Alert
          v-if="needsValidation"
          type="warning"
          show-icon
          :message="`已修改 ${dirtyRows.size} 行，请重新校验后再确认导入。`"
        />
        <Table
          :data-source="rows"
          :columns="columns"
          row-key="rowNumber"
          size="small"
          :loading="previewing"
          :scroll="{ x: completed ? 1395 : 1471, y: 310 }"
          :pagination="{
            pageSize: 10,
            showSizeChanger: false,
            showTotal: (count: number) => `共 ${count} 行`,
          }"
        >
          <template #bodyCell="{ column, record }">
            <div v-if="column.key === 'product'" class="import-product">
              <strong>{{ record.name || '未填名称' }}</strong><span>{{ record.code || '未填编号' }}</span>
            </div>
            <div v-else-if="column.key === 'specification'">
              <div v-if="record.values?.model" class="import-muted">
                型号：{{ record.values.model }}
              </div>
              {{ record.values?.specification || '—' }}
              <div class="import-muted">
                单位：{{ record.values?.unit || '—' }}
              </div>
            </div>
            <div v-else-if="column.key === 'production'">
              {{ productProcessText(record.values ?? {}) || '未填写' }}
            </div>
            <ProductColorSummary
              v-else-if="column.key === 'colors'"
              :value="record.values ?? {}"
              construction
            />
            <div v-else-if="column.key === 'configuration'">
              <div>
                {{
                  productDimensionsText(record.values ?? {}) || '长宽厚待补齐'
                }}
              </div>
              <div>{{ productPatternText(record.values ?? {}) }}</div>
              <div
                v-if="productSliceThicknessText(record.values ?? {})"
                class="import-muted"
              >
                开片厚度：{{ productSliceThicknessText(record.values ?? {}) }}
              </div>
              <div
                v-if="productThicknessProcessText(record.values ?? {})"
                class="import-muted"
              >
                {{ productThicknessProcessText(record.values ?? {}) }}
              </div>
              <Tag
                v-if="configurationMissingFields(record.values ?? {}).length"
                color="orange"
              >
                资料待补齐
              </Tag>
              <div
                v-if="configurationMissingFields(record.values ?? {}).length"
                class="import-muted"
              >
                {{ configurationMissingFields(record.values ?? {}).join('、') }}
              </div>
            </div>
            <div v-else-if="column.key === 'category'">
              {{ record.values?.category || '未分类' }}
              <div class="import-muted">
                {{ record.values?.active === false ? '未启用' : '已启用' }}
              </div>
            </div>
            <template v-else-if="column.key === 'status'">
              <Tag v-if="dirtyRows.has(record.rowNumber)" color="orange">
                待重新校验
              </Tag>
              <template v-else>
                <Tag
                  :color="
                    statusColor[record.status as ProductImportRow['status']]
                  "
                >
                  {{
                    completed && record.status === 'ERROR'
                      ? '导入失败'
                      : statusText[record.status as ProductImportRow['status']]
                  }}
                </Tag>
                <div v-if="record.message" class="import-row-message">
                  {{ record.message }}
                </div>
              </template>
            </template>
            <Button
              v-else-if="column.key === 'action' && record.rawCells"
              type="link"
              size="small"
              :aria-label="`修改 Excel 第 ${record.rowNumber} 行`"
              :disabled="busy"
              @click="editing = record as ProductImportRow"
            >
              修改
            </Button>
          </template>
        </Table>
        <p v-if="!completed" class="import-muted">
          点击对应行的「修改」可直接修正原表字段。重新校验后可确认导入，仍有问题的行会跳过。
        </p>
      </template>
    </div>
    <template #footer>
      <Space wrap>
        <Button :disabled="busy || Boolean(editing)" @click="emit('close')">
          {{ completed ? '完成' : '关闭' }}
        </Button>
        <Button
          v-if="!completed"
          :disabled="!file || busy || Boolean(editing)"
          :loading="previewing"
          :type="needsValidation || !result ? 'primary' : 'default'"
          @click="preview"
        >
          {{ result ? '重新校验' : '校验并预览' }}
        </Button>
        <Button
          v-if="result && !completed"
          type="primary"
          :disabled="
            importableCount < 1 || busy || needsValidation || Boolean(editing)
          "
          :loading="importing"
          @click="submit"
        >
          导入 {{ importableCount }} 个有效产品
        </Button>
      </Space>
    </template>
  </Modal>
  <ProductImportRowEditor
    :open="open && Boolean(editing)"
    :company-id="companyId"
    :row-number="editing?.rowNumber"
    :cells="editingCells"
    :row-message="editing?.status === 'ERROR' ? editing.message : undefined"
    @close="editing = undefined"
    @save="saveRowChanges"
  />
</template>

<style scoped>
.import-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 10px;
}

.import-guide {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.import-guide > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px;
  background: hsl(var(--muted));
  border-radius: 8px;
}

.import-guide span,
.import-muted,
.import-template-row p {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.import-guide .step-active {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 8%);
}

.import-template-row,
.import-file-actions,
.import-preview-heading {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.import-template-row p {
  margin: 4px 0 0;
}

.import-upload-mark {
  display: inline-flex;
  align-items: center;
  height: 44px;
  padding: 0 10px;
  margin: 5px 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: #15803d;
  background: #dcfce7;
  border-radius: 8px;
}

.import-upload-title {
  margin: 5px 0;
  font-size: 15px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.import-upload-compact :deep(.ant-upload-btn) {
  padding: 8px 12px;
}

.import-upload-compact .import-upload-title {
  margin: 0;
  font-size: 13px;
}

.import-upload-compact .import-muted {
  margin: 2px 0 0;
}

.import-file-actions {
  margin-top: -10px;
}

.import-results {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.import-results > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 16px;
  background: hsl(var(--muted));
  border-radius: 8px;
}

.import-results span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.import-results strong {
  font-size: 24px;
  font-weight: 600;
}

.result-ready strong {
  color: #16a34a;
}

.result-error strong {
  color: #dc2626;
}

.import-product {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-wrap: anywhere;
}

.import-product strong {
  font-weight: 500;
}

.import-product span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.import-row-message {
  margin-top: 5px;
  font-size: 12px;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .import-guide {
    gap: 5px;
  }

  .import-guide > div {
    padding: 8px;
  }

  .import-guide span {
    display: none;
  }

  .import-template-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .import-results {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
