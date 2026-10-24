<script lang="ts" setup>
import type { UploadFile } from 'ant-design-vue/es/upload/interface';

import type { FdmdataEcFloorPriceApi } from '#/api/fdmdata/ecfloorprice';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import { Alert, Button, message, Table, Tag, Upload } from 'ant-design-vue';

import {
  downloadEcFloorPriceTemplate,
  importEcFloorPriceExcel,
  previewEcFloorPriceImport,
} from '#/api/fdmdata/ecfloorprice';

import { materialLabel, matKindLabel, seriesLabel } from '../data';
import { formatPrice } from '../model';

defineOptions({ name: 'EcFloorPriceImportModal' });

const emit = defineEmits<{ success: [] }>();

type ImportRow = FdmdataEcFloorPriceApi.ImportRow;

const ACTION_TEXT: Record<ImportRow['action'], { color: string; text: string }> = {
  CREATE: { color: 'green', text: '新增' },
  UPDATE: { color: 'blue', text: '更新' },
  SAME: { color: 'default', text: '不变' },
  ERROR: { color: 'red', text: '有错误' },
};

const fileList = ref<UploadFile[]>([]);
const selectedFile = computed<File | null>(
  () => (fileList.value[0]?.originFileObj as File | undefined) ?? null,
);
const preview = ref<FdmdataEcFloorPriceApi.ImportResult>();
const previewing = ref(false);
const onlyChanges = ref(true);

const writable = computed(
  () => (preview.value?.created ?? 0) + (preview.value?.updated ?? 0),
);
const visibleRows = computed(() =>
  (preview.value?.rows ?? []).filter(
    (r) => !onlyChanges.value || r.action !== 'SAME',
  ),
);

const columns = [
  { title: '行', dataIndex: 'rowNo', width: 56 },
  { title: '结果', key: 'action', width: 80 },
  { title: '产品系列', key: 'series', width: 120 },
  { title: '材质', key: 'material', width: 80 },
  { title: '规格', dataIndex: 'specText', width: 150, ellipsis: true },
  { title: '垫子类型', key: 'matKind', width: 80 },
  { title: '公司底价', key: 'floorPrice', width: 130 },
  { title: '参考价', key: 'refPrice', width: 130 },
  { title: '说明', dataIndex: 'message', width: 240 },
];

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const file = selectedFile.value;
    if (!file || !preview.value) return;
    if (writable.value === 0) {
      message.info('没有需要写入的行');
      return;
    }
    modalApi.lock();
    try {
      const res = await importEcFloorPriceExcel(file);
      const skipped = res.failed ? `，${res.failed} 行有错误已跳过` : '';
      message.success(`导入完成：新增 ${res.created} 行，更新 ${res.updated} 行${skipped}`);
      emit('success');
      await modalApi.close();
    } finally {
      modalApi.unlock();
    }
  },
  onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      fileList.value = [];
      preview.value = undefined;
      onlyChanges.value = true;
    }
  },
});

async function handlePreview(file: File) {
  previewing.value = true;
  try {
    preview.value = await previewEcFloorPriceImport(file);
  } finally {
    previewing.value = false;
  }
}

function beforeUpload(file: File) {
  preview.value = undefined;
  // 选好文件就先预览，不等确认
  void handlePreview(file);
  return false;
}

function handleRemove() {
  preview.value = undefined;
}

async function handleDownloadTemplate() {
  const data = await downloadEcFloorPriceTemplate();
  downloadFileFromBlobPart({ fileName: '公司底价导入模板.xlsx', source: data });
}

function priceChange(oldValue: unknown, newValue: unknown, action: string) {
  if (action !== 'UPDATE' || formatPrice(oldValue) === formatPrice(newValue)) {
    return formatPrice(newValue);
  }
  return `${formatPrice(oldValue)} → ${formatPrice(newValue)}`;
}
</script>

<template>
  <Modal
    title="导入公司底价"
    class="w-[1000px] max-w-[calc(100vw-2rem)]"
    :confirm-disabled="!preview || previewing || writable === 0"
    :confirm-text="preview ? `导入 ${writable} 行` : '导入'"
  >
    <div class="space-y-3 px-1">
      <Alert type="info" show-icon>
        <template #message>
          <div class="space-y-1 text-xs">
            <div>
              按模板填写：<b>产品系列、规格</b>必填；材质不填表示不区分材质；配件的规格填品名，如「瑜伽砖粉色」。
            </div>
            <div>
              平台参考价不填就按底价×1.2；和×1.2 不同时直接填。底价不填或填「未定价」表示还没定价。
            </div>
            <div>
              同一个系列 + 材质 + 规格已存在时会更新那一行；导出的文件改完价可以直接导回来。
            </div>
          </div>
        </template>
      </Alert>

      <div class="flex flex-wrap items-center gap-3">
        <Upload
          v-model:file-list="fileList"
          :before-upload="beforeUpload"
          :max-count="1"
          accept=".xls,.xlsx"
          @remove="handleRemove"
        >
          <Button type="primary" :loading="previewing">
            <template #icon>
              <IconifyIcon icon="lucide:upload" />
            </template>
            选择 Excel
          </Button>
        </Upload>
        <Button type="link" @click="handleDownloadTemplate">
          <template #icon>
            <IconifyIcon icon="lucide:download" />
          </template>
          下载导入模板
        </Button>
      </div>

      <template v-if="preview">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span>共 {{ preview.total }} 行：</span>
          <Tag color="green">新增 {{ preview.created }}</Tag>
          <Tag color="blue">更新 {{ preview.updated }}</Tag>
          <Tag>不变 {{ preview.unchanged }}</Tag>
          <Tag v-if="preview.failed" color="red">
            有错误 {{ preview.failed }}（不导入）
          </Tag>
          <a class="ml-auto text-xs" @click="onlyChanges = !onlyChanges">
            {{ onlyChanges ? '显示全部行' : '只看有变化的行' }}
          </a>
        </div>
        <Table
          :columns="columns"
          :data-source="visibleRows"
          :pagination="{ pageSize: 50, hideOnSinglePage: true }"
          :scroll="{ y: 360 }"
          row-key="rowNo"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'action'">
              <Tag :color="ACTION_TEXT[(record as ImportRow).action].color">
                {{ ACTION_TEXT[(record as ImportRow).action].text }}
              </Tag>
            </template>
            <template v-else-if="column.key === 'series'">
              {{ record.seriesCode ? seriesLabel(record.seriesCode) : record.seriesText }}
            </template>
            <template v-else-if="column.key === 'material'">
              {{ materialLabel(record.materialKey) }}
            </template>
            <template v-else-if="column.key === 'matKind'">
              {{ matKindLabel(record.matKind) }}
            </template>
            <template v-else-if="column.key === 'floorPrice'">
              {{ priceChange(record.oldFloorPrice, record.floorPrice, record.action) }}
            </template>
            <template v-else-if="column.key === 'refPrice'">
              {{ priceChange(record.oldRefPrice, record.refPrice, record.action) }}
              <span v-if="record.refPriceManual" class="text-xs text-muted-foreground">
                （手填）
              </span>
            </template>
          </template>
        </Table>
      </template>
    </div>
  </Modal>
</template>
