<script lang="ts" setup>
import type { FdmdataPatternDesignItemApi } from '#/api/fdmdata/pattern/design-item';
import type { AxiosProgressEvent } from '#/api/infra/file';

import { nextTick, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Image, Input, message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  getFdmdataPatternDesignItem,
  updateFdmdataPatternDesignItem,
  uploadFdmdataPatternDesignItemDesignImage,
} from '#/api/fdmdata/pattern/design-item';
import ImageUpload from '#/components/upload/image-upload.vue';
import { $t } from '#/locales';

import {
  getPatternDesignImagePreviewUrl,
  PATTERN_DESIGN_ITEM_DEFAULTS,
  useFormSchema,
} from '../data';
import { usePatternDesignItemShopOptions } from './shop-options';

defineOptions({ name: 'FdmdataPatternDesignItemEditForm' });

const emit = defineEmits<{ success: [] }>();

interface UploadSuccessPayload {
  designImageUrl?: string;
  previewUrl?: string;
  previewImageUrl?: string;
  response?: unknown;
  url?: string;
}

const SOURCE_IMAGE_MAX_SIZE_MB = 1024;

let openSeq = 0;
const formData = ref<
  FdmdataPatternDesignItemApi.PatternDesignItem | undefined
>();
const designImageUrl = ref('');
const previewImageUrl = ref('');
const previewUrlByDesignImageUrl = ref<Record<string, string>>({});
const {
  ensureShopNameOption,
  fetchShopNameOptions,
  handleShopNameSearch,
  resetShopNameOptions,
  shopNameOptions,
  shopNameOptionsLoading,
} = usePatternDesignItemShopOptions();

const [EditForm, editFormApi] = useVbenForm({
  schema: useFormSchema({
    onShopNameSearch: handleShopNameSearch,
    shopNameOptions,
    shopNameOptionsLoading,
  }),
  showDefaultActions: false,
  layout: 'horizontal',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  commonConfig: { labelWidth: 110, colon: true },
});

function extractUploadUrl(res: unknown): string {
  if (typeof res === 'string') return res;
  if (!res || typeof res !== 'object') return '';
  const record = res as Record<string, any>;
  if (typeof record.url === 'string') return record.url;
  if (typeof record.designImageUrl === 'string') return record.designImageUrl;
  if (typeof record.data === 'string') return record.data;
  if (record.data && typeof record.data === 'object') {
    if (typeof record.data.url === 'string') return record.data.url;
    return typeof record.data.designImageUrl === 'string'
      ? record.data.designImageUrl
      : '';
  }
  return '';
}

function extractUploadPreviewUrl(res: unknown): string {
  if (!res || typeof res !== 'object') return '';
  const record = res as Record<string, any>;
  if (typeof record.previewUrl === 'string') return record.previewUrl;
  if (typeof record.previewImageUrl === 'string') return record.previewImageUrl;
  if (record.data && typeof record.data === 'object') {
    if (typeof record.data.previewUrl === 'string') {
      return record.data.previewUrl;
    }
    return typeof record.data.previewImageUrl === 'string'
      ? record.data.previewImageUrl
      : '';
  }
  return '';
}

function extractPatternDesignImageUrls(
  payload: unknown | UploadSuccessPayload,
) {
  const record = (payload ?? {}) as UploadSuccessPayload;
  const response = record.response;
  return {
    designImageUrl: extractUploadUrl(payload) || extractUploadUrl(response),
    previewImageUrl:
      extractUploadPreviewUrl(payload) || extractUploadPreviewUrl(response),
  };
}

async function uploadDesignImageWithPreview(
  file: File,
  onUploadProgress?: AxiosProgressEvent,
) {
  const uploadRes = await uploadFdmdataPatternDesignItemDesignImage(
    file,
    onUploadProgress,
  );

  return {
    previewUrl: uploadRes.previewImageUrl,
    response: uploadRes,
    url: uploadRes.designImageUrl,
  };
}

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

function getSinglePreviewUrl() {
  return getPatternDesignImagePreviewUrl(
    getStoredPreviewUrl(designImageUrl.value, previewImageUrl.value),
  );
}

function handleUploadSuccess(payload: unknown) {
  const urls = extractPatternDesignImageUrls(payload);
  if (!urls.designImageUrl) return;
  designImageUrl.value = urls.designImageUrl;
  previewImageUrl.value = urls.previewImageUrl ?? '';
  setImageUrlsForDesign(urls.designImageUrl, urls.previewImageUrl);
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
  previewImageUrl.value = record.previewImageUrl ?? '';
  setImageUrlsForDesign(record.designImageUrl ?? '', record.previewImageUrl);
  ensureShopNameOption(record.shopName);
  await nextTick();
  await editFormApi.setValues(buildEditFormValues(record) as any, false);
}

async function submitEdit() {
  const { valid } = await editFormApi.validate();
  if (!valid) return false;
  const imageUrl = designImageUrl.value.trim();
  if (!imageUrl) {
    message.warning('请上传原图');
    return false;
  }
  const formValues = await editFormApi.getValues();
  const data = {
    ...formValues,
    designImageUrl: imageUrl,
    previewImageUrl:
      getStoredPreviewUrl(imageUrl, previewImageUrl.value) || undefined,
    productionSent: Number(formValues.productionSent ?? 0),
    status: 0,
  } as FdmdataPatternDesignItemApi.PatternDesignItem;
  await updateFdmdataPatternDesignItem(data);
  message.success($t('ui.actionMessage.updateSuccess', [data.id]));
  return true;
}

async function resetModalState() {
  formData.value = undefined;
  designImageUrl.value = '';
  previewImageUrl.value = '';
  previewUrlByDesignImageUrl.value = {};
  await editFormApi.resetForm();
  await editFormApi.setValues(PATTERN_DESIGN_ITEM_DEFAULTS as any, false);
}

const [Modal, modalApi] = useVbenModal({
  destroyOnClose: true,
  async onConfirm() {
    modalApi.lock();
    try {
      const success = await submitEdit();
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
      resetShopNameOptions();
      await resetModalState();
      return;
    }
    const mySeq = ++openSeq;
    const row = modalApi.getData<FdmdataPatternDesignItemApi.PatternDesignItem>();
    const rowId = row?.id;
    resetShopNameOptions();
    await resetModalState();
    void fetchShopNameOptions();
    if (!rowId) {
      message.error('请选择要修改的图案明细');
      await modalApi.close();
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
</script>

<template>
  <Modal title="修改图案识别订单设计图" class="w-[1080px] max-w-[calc(100vw-2rem)]">
    <EditForm />

    <div class="design-image-panel">
      <div class="design-image-label">
        <span class="required">*</span>
        原图 URL / 上传
      </div>
      <div class="design-image-content">
        <Input
          v-model:value="designImageUrl"
          allow-clear
          placeholder="上传图片后自动回填原图 URL"
        />
        <div class="mt-3">
          <ImageUpload
            v-model:value="designImageUrl"
            :api="uploadDesignImageWithPreview"
            :max-number="1"
            :max-size="SOURCE_IMAGE_MAX_SIZE_MB"
            :preview-url-transform="getUploadPreviewUrl"
            :show-description="false"
            @success="handleUploadSuccess"
          />
        </div>
        <div v-if="designImageUrl" class="mt-3 flex items-center gap-3">
          <Image
            :preview="{ src: getSinglePreviewUrl() }"
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

    <div class="design-image-panel">
      <div class="design-image-label">预览图 URL</div>
      <div class="design-image-content">
        <Input
          v-model:value="previewImageUrl"
          allow-clear
          placeholder="上传原图后自动生成，仅用于页面展示"
        />
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.design-image-panel {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 8px;
  margin-top: 4px;
}

.design-image-label {
  padding-top: 5px;
  color: hsl(var(--foreground));
  text-align: right;
}

.design-image-label .required {
  margin-right: 4px;
  color: hsl(var(--destructive));
}

.design-image-content {
  min-width: 0;
}

@media (max-width: 768px) {
  .design-image-panel {
    grid-template-columns: 1fr;
  }

  .design-image-label {
    text-align: left;
  }
}
</style>
