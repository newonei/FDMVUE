<script setup lang="ts">
import type { FdmAiCheckApi } from '#/api/fdmaicheck';

import { computed, ref } from 'vue';

import { downloadFileFromBlobPart } from '@vben/utils';

import { Alert, Button, Modal, Table, Upload } from 'ant-design-vue';

import {
  downloadAiCheckItemTemplate,
  previewAiCheckItemImport,
} from '#/api/fdmaicheck';

import { ITEM_SEVERITY_LABELS } from './model';

const props = defineProps<{
  docTypeName: string;
  existingItems: FdmAiCheckApi.Item[];
}>();
const emit = defineEmits<{
  apply: [items: FdmAiCheckApi.Item[]];
  close: [];
}>();

const fileName = ref('');
const fileError = ref('');
const previewing = ref(false);
const downloading = ref(false);
const preview = ref<FdmAiCheckApi.ItemImportPreview>();

const rows = computed(() => {
  const existingNames = new Set(
    props.existingItems.map((item) => item.name.trim()),
  );
  return (preview.value?.rows ?? []).map((row) => ({
    ...row,
    error:
      row.error ||
      (row.item && existingNames.has(row.item.name)
        ? '与现有检查点重名'
        : undefined),
  }));
});
const invalidCount = computed(
  () => rows.value.filter((row) => row.error).length,
);
const itemLimit = computed(() => preview.value?.maxItems ?? 0);
const exceedsLimit = computed(
  () =>
    !!preview.value &&
    props.existingItems.length + rows.value.length > itemLimit.value,
);
const canApply = computed(
  () =>
    !previewing.value &&
    rows.value.length > 0 &&
    invalidCount.value === 0 &&
    !exceedsLimit.value,
);

const columns = [
  { title: 'Excel 行', dataIndex: 'rowNumber', width: 75 },
  { title: '检查点名称', dataIndex: ['item', 'name'], width: 150 },
  { title: '分组', dataIndex: ['item', 'group'], width: 85 },
  { title: '不通过时', key: 'severity', width: 90 },
  { title: '检查什么', dataIndex: ['item', 'description'], width: 220 },
  { title: '不通过的情况', dataIndex: ['item', 'failWhen'], width: 200 },
  { title: '只提醒的情况', dataIndex: ['item', 'warnWhen'], width: 200 },
  { title: '启用', key: 'enabled', width: 65 },
  { title: '校验结果', key: 'result', width: 180 },
];

async function downloadTemplate() {
  downloading.value = true;
  try {
    const source = await downloadAiCheckItemTemplate();
    downloadFileFromBlobPart({ fileName: 'AI检查点导入模板.xlsx', source });
  } catch {
    // 下载失败由请求层提示。
  } finally {
    downloading.value = false;
  }
}

function beforeUpload(file: File) {
  void checkFile(file);
  return false;
}

async function checkFile(file: File) {
  fileName.value = file.name;
  fileError.value = '';
  preview.value = undefined;
  previewing.value = true;
  try {
    preview.value = await previewAiCheckItemImport(file);
  } catch (error) {
    fileError.value =
      error &&
      typeof error === 'object' &&
      'msg' in error &&
      typeof error.msg === 'string'
        ? error.msg
        : '读取 Excel 失败，请检查文件后重试';
  } finally {
    previewing.value = false;
  }
}

function apply() {
  if (!canApply.value) return;
  emit(
    'apply',
    rows.value.flatMap(({ item }) => (item ? [item] : [])),
  );
}
</script>

<template>
  <Modal
    :open="true"
    :title="`Excel 导入检查点 · ${docTypeName}`"
    width="min(1180px, calc(100vw - 32px))"
    ok-text="添加到编辑草稿"
    cancel-text="取消"
    :ok-button-props="{ disabled: !canApply }"
    @ok="apply"
    @cancel="emit('close')"
  >
    <div class="space-y-3">
      <Alert
        show-icon
        type="info"
        message="按填写示例整理规则，在「检查点」工作表每行填写一条。确认预览后可追加到当前单据类型，保存草稿并发布后生效。"
      />
      <div class="flex flex-wrap items-center gap-2">
        <Button :loading="downloading" @click="downloadTemplate">
          下载模板（含一行示例）
        </Button>
        <Upload
          accept=".xls,.xlsx"
          :before-upload="beforeUpload"
          :disabled="previewing"
          :show-upload-list="false"
        >
          <Button type="primary" :loading="previewing">选择 Excel</Button>
        </Upload>
        <span v-if="fileName" class="break-all text-sm">{{ fileName }}</span>
      </div>
      <Alert v-if="fileError" :message="fileError" type="error" show-icon />
      <template v-if="preview">
        <Alert
          v-if="exceedsLimit"
          :message="`当前已有 ${existingItems.length} 条，加上本次共 ${existingItems.length + rows.length} 条，每类单据最多 ${itemLimit} 条。`"
          show-icon
          type="warning"
        />
        <div class="text-sm" role="status">
          共 {{ rows.length }} 条，{{ rows.length - invalidCount }} 条通过校验
          <span v-if="invalidCount">
            ，{{ invalidCount }} 条需修正。修正后请重新上传。
          </span>
        </div>
        <Table
          :columns="columns"
          :data-source="rows"
          :pagination="{ pageSize: 10, hideOnSinglePage: true }"
          :scroll="{ x: 1265 }"
          row-key="rowNumber"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'severity'">
              {{
                record.item ? ITEM_SEVERITY_LABELS[record.item.severity] : '—'
              }}
            </template>
            <template v-else-if="column.key === 'enabled'">
              {{ record.item ? (record.item.enabled ? '是' : '否') : '—' }}
            </template>
            <template v-else-if="column.key === 'result'">
              <span v-if="record.error" class="text-destructive">{{
                record.error
              }}</span>
              <span v-else>可添加</span>
            </template>
          </template>
        </Table>
      </template>
    </div>
  </Modal>
</template>
