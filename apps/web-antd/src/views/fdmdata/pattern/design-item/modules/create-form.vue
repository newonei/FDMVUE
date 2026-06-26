<script lang="ts" setup>
import type { FdmdataPatternDesignItemApi } from '#/api/fdmdata/pattern/design-item';

import { nextTick, ref, watch } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Empty, Image, Input, InputNumber, message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { createFdmdataPatternDesignItemBatch } from '#/api/fdmdata/pattern/design-item';
import ImageUpload from '#/components/upload/image-upload.vue';
import { $t } from '#/locales';

import {
  getPatternDesignImagePreviewUrl,
  PATTERN_DESIGN_ITEM_DEFAULTS,
  useBatchFormSchema,
} from '../data';
import {
  extractPatternDesignImageUrls,
  SOURCE_IMAGE_MAX_SIZE_MB,
  usePatternDesignImageUpload,
} from './image-fields';
import { usePatternDesignItemShopOptions } from './shop-options';

defineOptions({ name: 'FdmdataPatternDesignItemCreateForm' });

const emit = defineEmits<{ success: [] }>();

interface BatchRow {
  designImageUrl: string;
  previewImageUrl?: string;
  productSpec?: string;
  quantity: number;
  remark?: string;
  rowKey: number;
}

let rowSeq = 0;
let resettingBatchRows = false;
const batchUploadUrls = ref<string[]>([]);
const batchRows = ref<BatchRow[]>([]);
const previewUrlByDesignImageUrl = ref<Record<string, string>>({});
const { uploadDesignImageWithPreview } = usePatternDesignImageUpload();
const {
  fetchShopNameOptions,
  handleShopNameSearch,
  resetShopNameOptions,
  shopNameOptions,
  shopNameOptionsLoading,
} = usePatternDesignItemShopOptions();

const [BatchForm, batchFormApi] = useVbenForm({
  schema: useBatchFormSchema({
    onShopNameSearch: handleShopNameSearch,
    shopNameOptions,
    shopNameOptionsLoading,
  }),
  showDefaultActions: false,
  layout: 'horizontal',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  commonConfig: { labelWidth: 110, colon: true },
});

function setImageUrlsForDesign(
  designUrl: string,
  previewUrl?: string,
) {
  const normalizedDesignUrl = designUrl.trim();
  if (!normalizedDesignUrl) return;
  const normalizedPreviewUrl = String(previewUrl ?? '').trim();
  if (normalizedPreviewUrl) {
    previewUrlByDesignImageUrl.value = {
      ...previewUrlByDesignImageUrl.value,
      [normalizedDesignUrl]: normalizedPreviewUrl,
    };
  }
}

function getStoredPreviewUrl(designUrl?: string, previewUrl?: string) {
  const directPreviewUrl = String(previewUrl ?? '').trim();
  if (directPreviewUrl) return directPreviewUrl;
  const normalizedDesignUrl = String(designUrl ?? '').trim();
  return normalizedDesignUrl
    ? previewUrlByDesignImageUrl.value[normalizedDesignUrl] || ''
    : '';
}

function getUploadPreviewUrl(url: string) {
  return getPatternDesignImagePreviewUrl(getStoredPreviewUrl(url));
}

function getRowPreviewUrl(row: BatchRow) {
  return getPatternDesignImagePreviewUrl(
    getStoredPreviewUrl(row.designImageUrl, row.previewImageUrl),
  );
}

function applyUploadPayload(row: BatchRow | undefined, payload: unknown) {
  const { designImageUrl, previewImageUrl } =
    extractPatternDesignImageUrls(payload);
  if (!designImageUrl) return;
  setImageUrlsForDesign(designImageUrl, previewImageUrl);
  if (row) {
    row.designImageUrl = designImageUrl;
    row.previewImageUrl = previewImageUrl;
    return;
  }
  const currentRow = batchRows.value.find(
    (item) => item.designImageUrl === designImageUrl,
  );
  if (currentRow) {
    currentRow.previewImageUrl = previewImageUrl;
  }
}

watch(
  batchUploadUrls,
  (urls) => {
    if (resettingBatchRows) {
      resettingBatchRows = false;
      return;
    }
    const normalizedUrls = normalizeUploadUrls(urls);
    if (normalizedUrls.length === 0) {
      batchRows.value = [];
      return;
    }
    const currentRows = new Map(
      batchRows.value
        .filter((row) => row.designImageUrl)
        .map((row) => [row.designImageUrl, row]),
    );
    batchRows.value = normalizedUrls.map((url) => {
      const currentRow = currentRows.get(url);
      if (currentRow) {
        currentRow.previewImageUrl = getStoredPreviewUrl(
          url,
          currentRow.previewImageUrl,
        );
        return currentRow;
      }
      return {
        designImageUrl: url,
        previewImageUrl: getStoredPreviewUrl(url),
        quantity: 1,
        rowKey: ++rowSeq,
      };
    });
  },
  { deep: true },
);

function normalizeUploadUrls(value: string | string[] | undefined) {
  const urls = Array.isArray(value)
    ? value
    : String(value ?? '')
        .split(',')
        .map((item) => item.trim());
  return [...new Set(urls.map((item) => item.trim()).filter(Boolean))];
}

function resetBatchRows() {
  resettingBatchRows = true;
  batchUploadUrls.value = [];
  batchRows.value = [];
  addBatchRow();
}

function addBatchRow() {
  batchRows.value.push({
    designImageUrl: '',
    previewImageUrl: '',
    quantity: 1,
    rowKey: ++rowSeq,
  });
}

function removeBatchRow(index: number) {
  const row = batchRows.value[index];
  batchRows.value.splice(index, 1);
  if (row?.designImageUrl) {
    batchUploadUrls.value = batchUploadUrls.value.filter(
      (url) => url !== row.designImageUrl,
    );
  }
}

function normalizeBatchItems() {
  return batchRows.value
    .map((row) => ({
      designImageUrl: row.designImageUrl.trim(),
      previewImageUrl:
        getStoredPreviewUrl(row.designImageUrl, row.previewImageUrl) ||
        undefined,
      productSpec: row.productSpec?.trim() || '',
      quantity: Number(row.quantity || 1),
      remark: row.remark?.trim() || undefined,
    }))
    .filter((row) => row.designImageUrl);
}

function validateBatchRows() {
  const invalidSpecIndex = batchRows.value.findIndex(
    (row) => row.designImageUrl.trim() && !row.productSpec?.trim(),
  );
  if (invalidSpecIndex !== -1) {
    message.warning(`第 ${invalidSpecIndex + 1} 行请输入产品规格`);
    return false;
  }
  return true;
}

function findDuplicatedUrl(items: FdmdataPatternDesignItemApi.BatchCreateItem[]) {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.designImageUrl)) {
      return item.designImageUrl;
    }
    seen.add(item.designImageUrl);
  }
  return '';
}

async function submitBatchCreate() {
  const { valid } = await batchFormApi.validate();
  if (!valid) return false;
  const items = normalizeBatchItems();
  if (items.length === 0) {
    message.warning('请至少上传一张设计图');
    return false;
  }
  if (!validateBatchRows()) return false;
  const duplicatedUrl = findDuplicatedUrl(items);
  if (duplicatedUrl) {
    message.warning(`设计图重复：${duplicatedUrl}`);
    return false;
  }
  const data = await batchFormApi.getValues();
  await createFdmdataPatternDesignItemBatch({
    ...(data as FdmdataPatternDesignItemApi.BatchCreateReq),
    items,
    productionSent: Number(data.productionSent ?? 0),
    status: 0,
  });
  message.success($t('ui.actionMessage.createSuccess'));
  return true;
}

async function resetModalState() {
  previewUrlByDesignImageUrl.value = {};
  await batchFormApi.resetForm();
  await batchFormApi.setValues(PATTERN_DESIGN_ITEM_DEFAULTS as any, false);
  resetBatchRows();
}

async function applyCreateDefaults() {
  await nextTick();
  await batchFormApi.setValues(
    {
      ...PATTERN_DESIGN_ITEM_DEFAULTS,
      productionSent: 0,
    } as any,
    false,
  );
}

const [Modal, modalApi] = useVbenModal({
  destroyOnClose: true,
  async onConfirm() {
    modalApi.lock();
    try {
      const success = await submitBatchCreate();
      if (!success) return;
      emit('success');
      await modalApi.close();
    } finally {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      modalApi.unlock();
      resetShopNameOptions();
      await resetModalState();
      return;
    }
    resetShopNameOptions();
    await resetModalState();
    void fetchShopNameOptions();
    await applyCreateDefaults();
  },
});

resetBatchRows();
</script>

<template>
  <Modal title="新增订单图案明细" class="w-[1180px] max-w-[calc(100vw-2rem)]">
    <BatchForm />

    <div class="batch-upload-panel">
      <div class="batch-upload-label">
        <span class="required">*</span>
        设计图列表
      </div>
      <div class="batch-upload-content">
        <ImageUpload
          v-model:value="batchUploadUrls"
          :api="uploadDesignImageWithPreview"
          :max-number="50"
          :max-size="SOURCE_IMAGE_MAX_SIZE_MB"
          multiple
          :preview-url-transform="getUploadPreviewUrl"
          :show-description="false"
          @success="applyUploadPayload(undefined, $event)"
        />

        <div class="mt-4 overflow-x-auto rounded border border-border">
          <table class="batch-table">
            <thead>
              <tr>
                <th class="w-[76px]">预览</th>
                <th>原图 URL</th>
                <th class="w-[180px]">
                  <span class="required">*</span>
                  产品规格
                </th>
                <th class="w-[120px]">数量</th>
                <th class="w-[180px]">备注</th>
                <th class="w-[80px]">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in batchRows" :key="row.rowKey">
                <td>
                  <Image
                    v-if="row.previewImageUrl"
                    :preview="{ src: getRowPreviewUrl(row) }"
                    :src="getRowPreviewUrl(row)"
                    :width="52"
                    :height="52"
                    class="rounded object-cover"
                  />
                  <div v-else class="image-placeholder"></div>
                </td>
                <td>
                  <div class="flex min-w-[280px] items-center gap-2">
                    <Input
                      v-model:value="row.designImageUrl"
                      allow-clear
                      placeholder="上传后自动回填原图 URL"
                    />
                    <ImageUpload
                      v-model:value="row.designImageUrl"
                      :api="uploadDesignImageWithPreview"
                      :max-number="1"
                      :max-size="SOURCE_IMAGE_MAX_SIZE_MB"
                      list-type="picture"
                      :preview-url-transform="getUploadPreviewUrl"
                      :show-description="false"
                      @success="applyUploadPayload(row, $event)"
                    />
                  </div>
                </td>
                <td>
                  <Input
                    v-model:value="row.productSpec"
                    allow-clear
                    placeholder="必填"
                  />
                </td>
                <td>
                  <InputNumber
                    v-model:value="row.quantity"
                    class="w-full"
                    :min="1"
                    :precision="0"
                  />
                </td>
                <td>
                  <Input
                    v-model:value="row.remark"
                    allow-clear
                    placeholder="可选"
                  />
                </td>
                <td>
                  <Button
                    danger
                    type="link"
                    :disabled="batchRows.length <= 1"
                    @click="removeBatchRow(index)"
                  >
                    删除
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
          <Empty v-if="batchRows.length === 0" class="py-8" />
        </div>

        <div class="mt-3 flex justify-end">
          <Button @click="addBatchRow">
            <template #icon>
              <IconifyIcon icon="lucide:plus" />
            </template>
            添加行
          </Button>
        </div>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.batch-upload-panel {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 8px;
  margin-top: 4px;
}

.batch-upload-label {
  padding-top: 5px;
  color: hsl(var(--foreground));
  text-align: right;
}

.batch-upload-label .required,
.batch-table .required {
  margin-right: 4px;
  color: hsl(var(--destructive));
}

.batch-upload-content {
  min-width: 0;
}

.batch-table {
  width: 100%;
  min-width: 1220px;
  border-collapse: collapse;
}

.batch-table th,
.batch-table td {
  padding: 10px;
  vertical-align: middle;
  text-align: left;
  border-bottom: 1px solid hsl(var(--border));
}

.batch-table th {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 35%);
}

.batch-table tr:last-child td {
  border-bottom: 0;
}

.image-placeholder {
  width: 52px;
  height: 52px;
  background: hsl(var(--muted) / 35%);
  border: 1px dashed hsl(var(--border));
  border-radius: 6px;
}

.batch-table :deep(.ant-upload-list) {
  display: none;
}

@media (max-width: 768px) {
  .batch-upload-panel {
    grid-template-columns: 1fr;
  }

  .batch-upload-label {
    text-align: left;
  }
}
</style>
