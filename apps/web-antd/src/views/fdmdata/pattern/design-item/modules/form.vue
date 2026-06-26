<script lang="ts" setup>
import type { PatternDesignItemShopOption } from '../data';

import type { FdmdataPatternDesignItemApi } from '#/api/fdmdata/pattern/design-item';
import type { AxiosProgressEvent } from '#/api/infra/file';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Empty,
  Image,
  Input,
  InputNumber,
  message,
} from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createFdmdataPatternDesignItemBatch,
  getFdmdataPatternDesignItem,
  getFdmdataPatternDesignItemShopNameOptions,
  updateFdmdataPatternDesignItem,
} from '#/api/fdmdata/pattern/design-item';
import ImageUpload from '#/components/upload/image-upload.vue';
import { useUpload } from '#/components/upload/use-upload';
import { $t } from '#/locales';

import {
  getPatternDesignImagePreviewUrl,
  PATTERN_DESIGN_ITEM_DEFAULTS,
  useBatchFormSchema,
  useFormSchema,
} from '../data';

defineOptions({ name: 'FdmdataPatternDesignItemForm' });

const emit = defineEmits<{ success: [] }>();

interface BatchRow {
  designImageUrl: string;
  previewImageUrl?: string;
  productSpec?: string;
  quantity: number;
  remark?: string;
  rowKey: number;
}

interface UploadSuccessPayload {
  previewUrl?: string;
  response?: unknown;
  url?: string;
}

const SOURCE_IMAGE_MAX_SIZE_MB = 256;
const PREVIEW_IMAGE_MAX_SIDE = 1200;
const PREVIEW_IMAGE_QUALITY = 0.82;

let openSeq = 0;
let rowSeq = 0;
let resettingBatchRows = false;
const formData = ref<
  FdmdataPatternDesignItemApi.PatternDesignItem | undefined
>();
const modalMode = ref<'create' | 'edit'>('create');
const designImageUrl = ref('');
const designPreviewImageUrl = ref('');
const batchUploadUrls = ref<string[]>([]);
const batchRows = ref<BatchRow[]>([]);
const previewUrlByDesignImageUrl = ref<Record<string, string>>({});
const shopNameOptions = ref<PatternDesignItemShopOption[]>([]);
const shopNameOptionsLoading = ref(false);
const { httpRequest: uploadDesignImage } = useUpload(
  'fdmdata/pattern/design-item',
);
const { httpRequest: uploadDesignPreviewImage } = useUpload(
  'fdmdata/pattern/design-item/preview',
);

const isEdit = computed(() => modalMode.value === 'edit');
let shopNameFetchSeq = 0;
let shopNameSearchTimer: ReturnType<typeof setTimeout> | undefined;

function toShopNameOptions(names: string[]): PatternDesignItemShopOption[] {
  return names
    .map((name) => String(name ?? '').trim())
    .filter(Boolean)
    .map((name) => ({ label: name, value: name }));
}

function mergeCurrentShopNameOption(
  options: PatternDesignItemShopOption[],
  shopName: unknown,
) {
  const value = String(shopName ?? '').trim();
  if (!value || options.some((item) => item.value === value)) return options;
  return [{ label: value, value }, ...options];
}

function ensureShopNameOption(shopName: unknown) {
  shopNameOptions.value = mergeCurrentShopNameOption(
    shopNameOptions.value,
    shopName,
  );
}

async function getCurrentShopName() {
  try {
    const values = isEdit.value
      ? await editFormApi.getValues()
      : await batchFormApi.getValues();
    return values.shopName;
  } catch {
    return undefined;
  }
}

async function fetchShopNameOptions(keyword = '') {
  const seq = ++shopNameFetchSeq;
  shopNameOptionsLoading.value = true;
  try {
    const names = await getFdmdataPatternDesignItemShopNameOptions({
      keyword: keyword.trim() || undefined,
      limit: 50,
    });
    if (seq !== shopNameFetchSeq) return;
    shopNameOptions.value = mergeCurrentShopNameOption(
      toShopNameOptions(names),
      await getCurrentShopName(),
    );
  } catch (error) {
    if (seq !== shopNameFetchSeq) return;
    console.error('Load pattern design item shop options failed', error);
    shopNameOptions.value = [];
  } finally {
    if (seq === shopNameFetchSeq) {
      shopNameOptionsLoading.value = false;
    }
  }
}

function handleShopNameSearch(keyword = '') {
  if (shopNameSearchTimer) {
    clearTimeout(shopNameSearchTimer);
  }
  shopNameSearchTimer = setTimeout(() => {
    void fetchShopNameOptions(keyword);
  }, 250);
}

const shopNameSelectOptions = {
  onShopNameSearch: handleShopNameSearch,
  shopNameOptions,
  shopNameOptionsLoading,
};

function extractUploadUrl(res: unknown): string {
  if (typeof res === 'string') return res;
  if (!res || typeof res !== 'object') return '';
  const record = res as Record<string, any>;
  if (typeof record.url === 'string') return record.url;
  if (typeof record.data === 'string') return record.data;
  if (record.data && typeof record.data === 'object') {
    return typeof record.data.url === 'string' ? record.data.url : '';
  }
  return '';
}

function extractUploadPreviewUrl(res: unknown): string {
  if (!res || typeof res !== 'object') return '';
  const record = res as Record<string, any>;
  if (typeof record.previewUrl === 'string') return record.previewUrl;
  if (record.data && typeof record.data === 'object') {
    return typeof record.data.previewUrl === 'string'
      ? record.data.previewUrl
      : '';
  }
  return '';
}

function setPreviewUrlForDesignImage(designUrl: string, previewUrl?: string) {
  const normalizedDesignUrl = designUrl.trim();
  const normalizedPreviewUrl = String(previewUrl ?? '').trim();
  if (!normalizedDesignUrl || !normalizedPreviewUrl) return;
  previewUrlByDesignImageUrl.value = {
    ...previewUrlByDesignImageUrl.value,
    [normalizedDesignUrl]: normalizedPreviewUrl,
  };
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

function getSinglePreviewUrl() {
  return getPatternDesignImagePreviewUrl(
    getStoredPreviewUrl(designImageUrl.value, designPreviewImageUrl.value),
  );
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error('预览图生成失败'));
      },
      type,
      quality,
    );
  });
}

async function buildPreviewFile(file: File) {
  if (!file.type.startsWith('image/')) return undefined;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(
      1,
      PREVIEW_IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('预览图生成失败');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvasToBlob(
      canvas,
      'image/jpeg',
      PREVIEW_IMAGE_QUALITY,
    );
    const basename = file.name.replace(/\.[^.]+$/, '') || 'design-image';
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new File([blob], `${basename}-${suffix}-preview.jpg`, {
      lastModified: Date.now(),
      type: 'image/jpeg',
    });
  } finally {
    bitmap.close();
  }
}

async function uploadDesignImageWithPreview(
  file: File,
  onUploadProgress?: AxiosProgressEvent,
) {
  const originalRes = await uploadDesignImage(file, onUploadProgress);
  const designUrl = extractUploadUrl(originalRes);
  let previewUrl = extractUploadPreviewUrl(originalRes);
  if (designUrl && !previewUrl) {
    try {
      const previewFile = await buildPreviewFile(file);
      if (previewFile) {
        previewUrl = extractUploadUrl(
          await uploadDesignPreviewImage(previewFile),
        );
      }
    } catch (error) {
      console.error('Create pattern design preview image failed', error);
      message.warning('预览图生成失败，已保留原图 URL');
    }
  }
  if (designUrl) {
    setPreviewUrlForDesignImage(designUrl, previewUrl);
  }
  return { previewUrl, response: originalRes, url: designUrl };
}

function handleSingleUploadSuccess(payload: UploadSuccessPayload) {
  const url = extractUploadUrl(payload) || extractUploadUrl(payload.response);
  const previewUrl =
    extractUploadPreviewUrl(payload) ||
    extractUploadPreviewUrl(payload.response);
  if (!url) return;
  designImageUrl.value = url;
  designPreviewImageUrl.value = previewUrl;
  setPreviewUrlForDesignImage(url, previewUrl);
}

function handleBatchUploadSuccess(payload: UploadSuccessPayload) {
  const url = extractUploadUrl(payload) || extractUploadUrl(payload.response);
  const previewUrl =
    extractUploadPreviewUrl(payload) ||
    extractUploadPreviewUrl(payload.response);
  if (!url) return;
  setPreviewUrlForDesignImage(url, previewUrl);
  const row = batchRows.value.find((item) => item.designImageUrl === url);
  if (row) {
    row.previewImageUrl = previewUrl;
  }
}

function handleRowUploadSuccess(row: BatchRow, payload: UploadSuccessPayload) {
  const url = extractUploadUrl(payload) || extractUploadUrl(payload.response);
  const previewUrl =
    extractUploadPreviewUrl(payload) ||
    extractUploadPreviewUrl(payload.response);
  if (!url) return;
  row.designImageUrl = url;
  row.previewImageUrl = previewUrl;
  setPreviewUrlForDesignImage(url, previewUrl);
}

const [EditForm, editFormApi] = useVbenForm({
  schema: useFormSchema(shopNameSelectOptions),
  showDefaultActions: false,
  layout: 'horizontal',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  commonConfig: { labelWidth: 110, colon: true },
});

const [BatchForm, batchFormApi] = useVbenForm({
  schema: useBatchFormSchema(shopNameSelectOptions),
  showDefaultActions: false,
  layout: 'horizontal',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  commonConfig: { labelWidth: 110, colon: true },
});

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
    batchRows.value = normalizedUrls.map(
      (url) => {
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
      },
    );
  },
  { deep: true },
);

watch(designImageUrl, (url) => {
  const normalizedUrl = String(url ?? '').trim();
  if (!normalizedUrl) {
    designPreviewImageUrl.value = '';
    return;
  }
  const previewUrl = previewUrlByDesignImageUrl.value[normalizedUrl];
  if (previewUrl) {
    designPreviewImageUrl.value = previewUrl;
    return;
  }
  if (formData.value?.designImageUrl !== normalizedUrl) {
    designPreviewImageUrl.value = '';
  }
});

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

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function normalizeOrderDateForForm(value: number | string | undefined) {
  if (value === undefined || value === '') return undefined;
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-') + ` ${[
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ].join(':')}`;
}

function buildEditFormValues(
  record: FdmdataPatternDesignItemApi.PatternDesignItem,
) {
  return {
    ...PATTERN_DESIGN_ITEM_DEFAULTS,
    ...record,
    orderDate: normalizeOrderDateForForm(record.orderDate),
    productionSent: Number(record.productionSent ?? 0),
    quantity: Number(record.quantity ?? 1),
    status: Number(record.status ?? 0),
  };
}

async function applyEditValues(
  record: FdmdataPatternDesignItemApi.PatternDesignItem,
) {
  formData.value = record;
  designImageUrl.value = record.designImageUrl ?? '';
  designPreviewImageUrl.value = record.previewImageUrl ?? '';
  setPreviewUrlForDesignImage(
    record.designImageUrl ?? '',
    record.previewImageUrl,
  );
  ensureShopNameOption(record.shopName);
  await nextTick();
  await editFormApi.setValues(buildEditFormValues(record) as any, false);
}

async function submitEdit() {
  const { valid } = await editFormApi.validate();
  if (!valid) return false;
  const imageUrl = designImageUrl.value.trim();
  if (!imageUrl) {
    message.warning('请上传或填写设计图 URL');
    return false;
  }
  const formValues = await editFormApi.getValues();
  const data = {
    ...formValues,
    designImageUrl: imageUrl,
    previewImageUrl:
      getStoredPreviewUrl(imageUrl, designPreviewImageUrl.value) || undefined,
    productionSent: Number(formValues.productionSent ?? 0),
    status: 0,
  } as FdmdataPatternDesignItemApi.PatternDesignItem;
  await updateFdmdataPatternDesignItem(data);
  message.success($t('ui.actionMessage.updateSuccess', [data.id]));
  return true;
}

async function submitBatchCreate() {
  const { valid } = await batchFormApi.validate();
  if (!valid) return false;
  const items = normalizeBatchItems();
  if (items.length === 0) {
    message.warning('请至少上传一张设计图');
    return false;
  }
  if (!validateBatchRows()) {
    return false;
  }
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

async function resetModalState() {
  formData.value = undefined;
  designImageUrl.value = '';
  designPreviewImageUrl.value = '';
  previewUrlByDesignImageUrl.value = {};
  await editFormApi.resetForm();
  await batchFormApi.resetForm();
  await editFormApi.setValues(PATTERN_DESIGN_ITEM_DEFAULTS as any, false);
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
  async onConfirm() {
    modalApi.lock();
    try {
      const success = isEdit.value
        ? await submitEdit()
        : await submitBatchCreate();
      if (!success) return;
      emit('success');
      await modalApi.close();
    } finally {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      openSeq++;
      modalApi.unlock();
      shopNameFetchSeq++;
      shopNameOptions.value = [];
      shopNameOptionsLoading.value = false;
      await resetModalState();
      modalMode.value = 'create';
      return;
    }
    const mySeq = ++openSeq;
    const row = modalApi.getData<FdmdataPatternDesignItemApi.PatternDesignItem>();
    const rowId = row?.id;
    modalMode.value = rowId ? 'edit' : 'create';
    shopNameFetchSeq++;
    shopNameOptions.value = [];
    shopNameOptionsLoading.value = false;
    await resetModalState();
    modalMode.value = rowId ? 'edit' : 'create';
    void fetchShopNameOptions();
    if (!rowId) {
      await applyCreateDefaults();
      return;
    }
    await applyEditValues(row);
    modalApi.lock();
    try {
      const detail = await getFdmdataPatternDesignItem(rowId);
      if (mySeq !== openSeq) return;
      if (!detail) {
        message.error('图案识别订单设计图不存在或已被删除');
        await modalApi.close();
        return;
      }
      await applyEditValues(detail);
      void fetchShopNameOptions(detail.shopName ?? '');
    } catch (error) {
      if (mySeq === openSeq) {
        console.error('Load pattern design item detail failed', error);
        message.warning('详情加载失败，已显示列表中的记录信息');
      }
    } finally {
      if (mySeq === openSeq) modalApi.unlock();
    }
  },
});

resetBatchRows();

onBeforeUnmount(() => {
  if (shopNameSearchTimer) {
    clearTimeout(shopNameSearchTimer);
  }
});

const title = computed(() =>
  isEdit.value ? '修改图案识别订单设计图' : '新增订单图案明细',
);
</script>

<template>
  <Modal :title="title" class="w-[1080px] max-w-[calc(100vw-2rem)]">
    <div v-show="isEdit">
      <EditForm />

      <div class="design-image-panel">
        <div class="design-image-label">
          <span class="required">*</span>
          设计图 URL / 上传
        </div>
        <div class="design-image-content">
          <Input
            v-model:value="designImageUrl"
            allow-clear
            placeholder="可直接填写图片 URL，或上传图片后自动回填"
          />
          <div class="mt-3">
            <ImageUpload
              v-model:value="designImageUrl"
              :api="uploadDesignImageWithPreview"
              :max-number="1"
              :max-size="SOURCE_IMAGE_MAX_SIZE_MB"
              :preview-url-transform="getUploadPreviewUrl"
              :show-description="false"
              @success="handleSingleUploadSuccess"
            />
          </div>
          <div v-if="designImageUrl" class="mt-3 flex items-center gap-3">
            <Image
              :preview="{ src: designImageUrl }"
              :src="getSinglePreviewUrl()"
              :width="96"
              :height="96"
              class="rounded object-cover"
            />
            <span class="min-w-0 flex-1 break-all text-xs text-muted-foreground">
              {{ designImageUrl }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-show="!isEdit">
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
            @success="handleBatchUploadSuccess"
          />

          <div class="mt-4 overflow-x-auto rounded border border-border">
            <table class="batch-table">
              <thead>
                <tr>
                  <th class="w-[76px]">预览</th>
                  <th>设计图 URL</th>
                  <th class="w-[180px]">
                    <span class="required">*</span>
                    产品规格
                  </th>
                  <th class="w-[140px]">数量</th>
                  <th class="w-[180px]">备注</th>
                  <th class="w-[80px]">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in batchRows" :key="row.rowKey">
                  <td>
                    <Image
                      v-if="row.designImageUrl"
                      :preview="{ src: row.designImageUrl }"
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
                        placeholder="上传后自动回填，也可粘贴图片 URL"
                      />
                      <ImageUpload
                        v-model:value="row.designImageUrl"
                        :api="uploadDesignImageWithPreview"
                        :max-number="1"
                        :max-size="SOURCE_IMAGE_MAX_SIZE_MB"
                        list-type="picture"
                        :preview-url-transform="getUploadPreviewUrl"
                        :show-description="false"
                        @success="handleRowUploadSuccess(row, $event)"
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
    </div>
  </Modal>
</template>

<style scoped>
.design-image-panel,
.batch-upload-panel {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 8px;
  margin-top: 4px;
}

.design-image-label,
.batch-upload-label {
  padding-top: 5px;
  color: hsl(var(--foreground));
  text-align: right;
}

.design-image-label .required,
.batch-upload-label .required {
  margin-right: 4px;
  color: hsl(var(--destructive));
}

.batch-table .required {
  margin-right: 4px;
  color: hsl(var(--destructive));
}

.design-image-content,
.batch-upload-content {
  min-width: 0;
}

.batch-table {
  width: 100%;
  min-width: 1060px;
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
  .design-image-panel,
  .batch-upload-panel {
    grid-template-columns: 1fr;
  }

  .design-image-label,
  .batch-upload-label {
    text-align: left;
  }
}
</style>
