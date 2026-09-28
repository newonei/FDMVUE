<script lang="ts" setup>
import type { FdmNeixiaoPatternDesignItemApi } from '#/api/fdmneixiao/pattern/design-item';

import { computed, nextTick, ref, shallowRef, watch } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { defaultImageAccepts, getFileNameFromUrl } from '@vben/utils';

import {
  Modal as AntModal,
  Button,
  Image,
  Input,
  message,
  Tooltip,
} from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  getFdmNeixiaoPatternDesignItem,
  updateFdmNeixiaoPatternDesignItem,
} from '#/api/fdmneixiao/pattern/design-item';
import {
  createLocalThumbnail,
  FileDropZone,
  UploadTaskProgress,
} from '#/components/upload-task';
import { $t } from '#/locales';
import { isUploadTaskActive, useUploadTaskStore } from '#/store/upload-task';

import { PATTERN_DESIGN_ITEM_DEFAULTS, useFormSchema } from '../data';
import {
  DESIGN_IMAGE_UPLOAD_SOURCE,
  uploadDesignImageTask,
} from './create-draft';
import { usePatternDesignItemShopOptions } from './shop-options';

defineOptions({ name: 'FdmNeixiaoPatternDesignItemEditForm' });

const emit = defineEmits<{ success: [] }>();

const SOURCE_IMAGE_MAX_SIZE_MB = 1024;
const DESIGN_IMAGE_ACCEPT = defaultImageAccepts;
/** antd 确认框默认层级低于 vben 弹窗（2000），在弹窗内弹出时需要抬高 */
const CONFIRM_Z_INDEX = 2100;

let openSeq = 0;
const formData = ref<
  FdmNeixiaoPatternDesignItemApi.PatternDesignItem | undefined
>();
const designImageUrl = ref('');
const previewImageUrl = ref('');
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

// ---------- 替换设计图 ----------
const uploadStore = useUploadTaskStore();
const uploadTaskId = ref<string>();
const selectedFile = shallowRef<File>();
const localThumbUrl = ref('');

const uploadTask = computed(() => uploadStore.getTask(uploadTaskId.value));
const uploading = computed(() => isUploadTaskActive(uploadTask.value));
const uploadFailed = computed(
  () =>
    uploadTask.value?.status === 'error' ||
    uploadTask.value?.status === 'canceled',
);

const displayThumbUrl = computed(
  () => previewImageUrl.value.trim() || localThumbUrl.value,
);
const displayFileName = computed(() => {
  if (selectedFile.value) return selectedFile.value.name;
  const url = designImageUrl.value.trim();
  return url ? getFileNameFromUrl(url) : '尚未上传设计图';
});

function revokeLocalThumb() {
  if (localThumbUrl.value) URL.revokeObjectURL(localThumbUrl.value);
  localThumbUrl.value = '';
}

function discardUpload() {
  if (uploadTaskId.value) uploadStore.remove(uploadTaskId.value);
  uploadTaskId.value = undefined;
  selectedFile.value = undefined;
  revokeLocalThumb();
}

function handleSelectDesignImage([file]: File[]) {
  if (!file) return;
  discardUpload();
  selectedFile.value = file;
  const taskId = uploadStore.add({
    file,
    onSuccess(result) {
      if (uploadTaskId.value !== taskId) return;
      designImageUrl.value = result.designImageUrl ?? '';
      previewImageUrl.value = result.previewImageUrl ?? '';
    },
    source: `${DESIGN_IMAGE_UPLOAD_SOURCE} · 修改`,
    upload: uploadDesignImageTask,
  });
  uploadTaskId.value = taskId;
  void createLocalThumbnail(file).then((url) => {
    if (!url) return;
    if (selectedFile.value === file) {
      localThumbUrl.value = url;
    } else {
      URL.revokeObjectURL(url);
    }
  });
}

function handleRetryUpload() {
  if (uploadTaskId.value) uploadStore.retry(uploadTaskId.value);
}

function handleCancelUpload() {
  if (uploadTaskId.value) uploadStore.cancel(uploadTaskId.value);
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
  return (
    [
      date.getFullYear(),
      padDatePart(date.getMonth() + 1),
      padDatePart(date.getDate()),
    ].join('-') +
    ` ${[
      padDatePart(date.getHours()),
      padDatePart(date.getMinutes()),
      padDatePart(date.getSeconds()),
    ].join(':')}`
  );
}

function buildEditFormValues(
  record: FdmNeixiaoPatternDesignItemApi.PatternDesignItem,
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
  record: FdmNeixiaoPatternDesignItemApi.PatternDesignItem,
) {
  formData.value = record;
  designImageUrl.value = record.designImageUrl ?? '';
  previewImageUrl.value = record.previewImageUrl ?? '';
  ensureShopNameOption(record.shopName);
  await nextTick();
  await editFormApi.setValues(buildEditFormValues(record) as any, false);
}

async function submitEdit() {
  const { valid } = await editFormApi.validate();
  if (!valid) return false;
  if (uploading.value) {
    message.warning('设计图还在上传，请稍候');
    return false;
  }
  const imageUrl = designImageUrl.value.trim();
  if (!imageUrl) {
    message.warning('请上传原图');
    return false;
  }
  const formValues = await editFormApi.getValues();
  const data = {
    ...formValues,
    designImageUrl: imageUrl,
    previewImageUrl: previewImageUrl.value.trim() || undefined,
    productionSent: Number(formValues.productionSent ?? 0),
    status: 0,
  } as FdmNeixiaoPatternDesignItemApi.PatternDesignItem;
  delete data.recognitionStatus;
  await updateFdmNeixiaoPatternDesignItem(data);
  message.success($t('ui.actionMessage.updateSuccess', [data.id]));
  return true;
}

async function resetModalState() {
  discardUpload();
  formData.value = undefined;
  designImageUrl.value = '';
  previewImageUrl.value = '';
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
  onBeforeClose() {
    if (!uploading.value) return true;
    return new Promise<boolean>((resolve) => {
      AntModal.confirm({
        title: '设计图还在上传，确定关闭吗？',
        content: '关闭后会取消本次上传，记录保持原来的设计图。',
        okText: '关闭并取消上传',
        okButtonProps: { danger: true },
        cancelText: '继续上传',
        zIndex: CONFIRM_Z_INDEX,
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
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
    const row =
      modalApi.getData<FdmNeixiaoPatternDesignItemApi.PatternDesignItem>();
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
      const detail = await getFdmNeixiaoPatternDesignItem(rowId);
      if (mySeq !== openSeq) return;
      if (!detail) {
        message.error('内销定制订单不存在或已被删除');
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

watch(
  uploading,
  (active) => {
    modalApi.setState({
      confirmDisabled: active,
      confirmText: active ? '设计图上传中…' : '确定',
    });
  },
  { immediate: true },
);
</script>

<template>
  <Modal title="修改内销定制订单" class="w-[1080px] max-w-[calc(100vw-2rem)]">
    <EditForm />

    <div class="design-image-panel">
      <div class="design-image-label">
        <span class="required">*</span>
        设计图
      </div>
      <div class="design-image-content">
        <div class="design-image-card">
          <div class="design-image-card__thumb">
            <Image
              v-if="displayThumbUrl"
              :height="72"
              :preview="{ src: displayThumbUrl }"
              :src="displayThumbUrl"
              :width="72"
            />
            <IconifyIcon v-else icon="lucide:image" />
          </div>
          <div class="design-image-card__body">
            <div class="design-image-card__name" :title="displayFileName">
              {{ displayFileName }}
            </div>
            <UploadTaskProgress
              v-if="uploadTask && uploadTask.status !== 'success'"
              :task="uploadTask"
            />
            <div
              v-else-if="uploadTask?.status === 'success'"
              class="design-image-card__meta is-done"
            >
              <IconifyIcon icon="lucide:circle-check" />
              新图已上传，保存后生效
            </div>
            <div v-else class="design-image-card__meta">当前设计图</div>
          </div>
          <div class="design-image-card__actions">
            <Tooltip v-if="uploading" title="取消上传">
              <Button size="small" type="text" @click="handleCancelUpload">
                <template #icon>
                  <IconifyIcon icon="lucide:circle-x" />
                </template>
              </Button>
            </Tooltip>
            <Tooltip v-if="uploadFailed" title="重试">
              <Button size="small" type="text" @click="handleRetryUpload">
                <template #icon>
                  <IconifyIcon icon="lucide:rotate-cw" />
                </template>
              </Button>
            </Tooltip>
          </div>
        </div>

        <FileDropZone
          class="mt-3"
          :accept="DESIGN_IMAGE_ACCEPT"
          compact
          :max-size-mb="SOURCE_IMAGE_MAX_SIZE_MB"
          :multiple="false"
          title="拖入新图片替换当前设计图，或"
          @select="handleSelectDesignImage"
        />
      </div>
    </div>

    <div class="design-image-panel">
      <div class="design-image-label">原图 URL</div>
      <div class="design-image-content">
        <Input
          v-model:value="designImageUrl"
          allow-clear
          :disabled="uploading"
          placeholder="上传图片后自动回填，也可以直接粘贴"
        />
      </div>
    </div>

    <div class="design-image-panel">
      <div class="design-image-label">预览图 URL</div>
      <div class="design-image-content">
        <Input
          v-model:value="previewImageUrl"
          allow-clear
          :disabled="uploading"
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
  margin-top: 12px;
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

.design-image-card {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.design-image-card__thumb {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  overflow: hidden;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 50%);
  border-radius: 6px;
}

.design-image-card__thumb :deep(.ant-image-img) {
  object-fit: cover;
}

.design-image-card__body {
  flex: 1;
  min-width: 0;
}

.design-image-card__name {
  margin-bottom: 4px;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.design-image-card__meta {
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.design-image-card__meta.is-done {
  color: hsl(var(--success));
}

.design-image-card__actions {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
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
