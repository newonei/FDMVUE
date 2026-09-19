<script setup lang="ts">
import type {
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
const busy = computed(() => previewing.value || importing.value);
const rows = computed(() =>
  (result.value?.rows ?? []).filter(
    (row) =>
      !onlyIssues.value || row.status === 'ERROR' || row.status === 'SKIPPED',
  ),
);
const columns = [
  { title: 'Excel 行', dataIndex: 'rowNumber', width: 80 },
  { title: '产品编号 / 名称', key: 'product', width: 215 },
  { title: '规格 / 单位', key: 'specification', width: 160 },
  { title: '分类 / 状态', key: 'category', width: 125 },
  { title: '处理结果', key: 'status', width: 105 },
  { title: '说明', dataIndex: 'message', key: 'message', width: 235 },
];
const statusText: Record<ProductImportRow['status'], string> = {
  ERROR: '需修改',
  IMPORTED: '已导入',
  READY: '可导入',
  SKIPPED: '已跳过',
};
const statusColor: Record<ProductImportRow['status'], string> = {
  ERROR: 'red',
  IMPORTED: 'green',
  READY: 'blue',
  SKIPPED: 'default',
};

function clearFile() {
  if (busy.value) return;
  file.value = undefined;
  result.value = undefined;
  completed.value = false;
  panelError.value = '';
  onlyIssues.value = false;
  idempotencyKey.value = '';
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
  return false;
}
async function preview() {
  if (!file.value || busy.value || completed.value) return;
  previewing.value = true;
  panelError.value = '';
  result.value = undefined;
  try {
    result.value = await previewProductImport(file.value, props.companyId);
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    previewing.value = false;
  }
}
async function submit() {
  if (
    !file.value ||
    !result.value?.previewHash ||
    result.value.readyCount < 1 ||
    busy.value ||
    completed.value
  )
    return;
  importing.value = true;
  panelError.value = '';
  try {
    result.value = await importProducts({
      file: file.value,
      companyId: props.companyId,
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
    width="min(1060px, 96vw)"
    :style="{ top: '24px' }"
    :body-style="{
      maxHeight: 'calc(100dvh - 200px)',
      overflowY: 'auto',
      paddingRight: '4px',
    }"
    :closable="!busy"
    :mask-closable="false"
    :keyboard="!busy"
    @cancel="!busy && emit('close')"
  >
    <div class="import-stack">
      <div v-if="!result" class="import-guide">
        <div><strong>1. 准备文件</strong><span>按模板填写产品资料</span></div>
        <div :class="{ 'step-active': file && !completed }">
          <strong>2. 校验预览</strong><span>核对有效行与问题行</span>
        </div>
        <div :class="{ 'step-active': completed }">
          <strong>3. 导入产品</strong><span>仅新增有效产品</span>
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
              ? `${(file.size / 1024).toFixed(1)} KB · 点击此处更换文件并重新校验`
              : '支持 .xlsx / .xls，上传后先校验，再确认导入'
          }}
        </p>
      </Dragger>
      <div v-if="file" class="import-file-actions">
        <span class="import-muted">{{
          completed
            ? '本次导入已完成，选择新文件可继续导入。'
            : '必填：产品编号、产品名称；启用产品还需规格和单位。'
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
        v-if="!result"
        type="info"
        show-icon
        message="已有产品编号会跳过；有效行将新增为产品档案。"
        description="产品状态为空或正常时启用，停售或下架时停用。型号、克重、纹路、条码等补充信息保存在备注中；库存设置仅保留说明。请先删除模板中的示例行。"
      />
      <template v-if="result">
        <Alert
          v-if="completed"
          type="success"
          show-icon
          :message="`导入完成：新增 ${result.createdCount} 个产品，跳过 ${result.skippedCount} 行，需修改 ${result.errorCount} 行。`"
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
          <div>
            <span>重复 / 已跳过</span><strong>{{ result.skippedCount }}</strong>
          </div>
          <div class="result-error">
            <span>需修改</span><strong>{{ result.errorCount }}</strong>
          </div>
        </div>
        <div class="import-preview-heading">
          <strong>{{ completed ? '导入结果' : '数据预览' }}</strong>
          <Checkbox v-model:checked="onlyIssues">仅看跳过与问题行</Checkbox>
        </div>
        <Table
          :data-source="rows"
          :columns="columns"
          row-key="rowNumber"
          size="small"
          :scroll="{ x: 920, y: 310 }"
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
              {{ record.values?.specification || '—' }}
              <div class="import-muted">
                单位：{{ record.values?.unit || '—' }}
              </div>
            </div>
            <div v-else-if="column.key === 'category'">
              {{ record.values?.category || '未分类' }}
              <div class="import-muted">
                {{ record.values?.active === false ? '未启用' : '已启用' }}
              </div>
            </div>
            <Tag
              v-else-if="column.key === 'status'"
              :color="statusColor[record.status as ProductImportRow['status']]"
            >
              {{ statusText[record.status as ProductImportRow['status']] }}
            </Tag>
            <span
              v-else-if="column.key === 'message'"
              class="import-row-message"
              >{{ record.message || '—' }}</span>
          </template>
        </Table>
        <p class="import-muted">
          行号对应原 Excel，修改问题后可再次上传；已导入的产品会自动跳过。
        </p>
      </template>
    </div>
    <template #footer>
      <Space wrap>
        <Button :disabled="busy" @click="emit('close')">
          {{ completed ? '完成' : '关闭' }}
        </Button>
        <Button
          v-if="!completed"
          :disabled="!file || busy"
          :loading="previewing"
          :type="result ? 'default' : 'primary'"
          @click="preview"
        >
          {{ result ? '重新校验' : '校验并预览' }}
        </Button>
        <Button
          v-if="result && !completed"
          type="primary"
          :disabled="result.readyCount < 1 || busy"
          :loading="importing"
          @click="submit"
        >
          导入 {{ result.readyCount }} 个有效产品
        </Button>
      </Space>
    </template>
  </Modal>
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
  grid-template-columns: repeat(4, 1fr);
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
