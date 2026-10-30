<script lang="ts" setup>
import type { DesignRow } from './create-draft';

import type { FdmNeixiaoPatternDesignItemApi } from '#/api/fdmneixiao/pattern/design-item';

import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';
import { defaultImageAccepts, formatDateTime } from '@vben/utils';

import {
  Alert,
  Modal as AntModal,
  Button,
  Image,
  Input,
  InputNumber,
  message,
  Popover,
  Tooltip,
} from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { createFdmNeixiaoPatternDesignItemBatch } from '#/api/fdmneixiao/pattern/design-item';
import {
  describeRejectedFiles,
  FileDropZone,
  formatBytes,
  pickFiles,
  UploadTaskProgress,
  useFileDrop,
  validateFiles,
} from '#/components/upload-task';
import { $t } from '#/locales';

import { PATTERN_DESIGN_ITEM_DEFAULTS, useBatchFormSchema } from '../data';
import { usePatternDesignItemCreateDraft } from './create-draft';
import { usePatternDesignItemShopOptions } from './shop-options';

defineOptions({ name: 'FdmNeixiaoPatternDesignItemCreateForm' });

const emit = defineEmits<{ success: [] }>();

const SOURCE_IMAGE_MAX_SIZE_MB = 1024;
const MAX_DESIGN_ROWS = 50;
const DESIGN_IMAGE_ACCEPT = defaultImageAccepts;
/** antd 确认框默认层级低于 vben 弹窗（2000），在弹窗内弹出时需要抬高 */
const CONFIRM_Z_INDEX = 2100;

const route = useRoute();
const userStore = useUserStore();
// 上传面板里点「查看」回到本页，再由列表页打开草稿
const draftLink = { path: route.path };

const {
  addFiles,
  addUrlRow,
  clear: clearDraft,
  draft,
  getRowState,
  getRowTask,
  hasContent,
  removeRow,
  replaceFile,
  retryRow,
  stats,
} = usePatternDesignItemCreateDraft();

const restoredDraft = ref(false);
const submitAttempted = ref(false);
let closeIntent: 'discard' | 'submit' | undefined;

const {
  ensureShopNameOption,
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
  wrapperClass: 'grid-cols-1 md:grid-cols-3',
  commonConfig: { labelWidth: 100, colon: true },
});

const statsText = computed(() => {
  const { done, failed, total, uploading } = stats.value;
  if (total === 0) return '';
  const parts = [`共 ${total} 个`, `已上传 ${done}`];
  if (uploading > 0) parts.push(`上传中 ${uploading}`);
  if (failed > 0) parts.push(`失败 ${failed}`);
  return parts.join(' · ');
});

function fileKey(file: { name?: string; size?: number }) {
  return `${file.name}:${file.size}`;
}

function handleFiles(files: File[]) {
  const existing = new Set(
    draft.rows.filter((row) => row.file).map((row) =>
      fileKey({ name: row.fileName, size: row.fileSize }),
    ),
  );
  const fresh = files.filter((file) => !existing.has(fileKey(file)));
  if (fresh.length < files.length) {
    message.info(`已跳过 ${files.length - fresh.length} 个重复文件`);
  }
  const room = MAX_DESIGN_ROWS - draft.rows.length;
  if (fresh.length > room) {
    message.warning(
      `一次最多添加 ${MAX_DESIGN_ROWS} 个设计图，已忽略 ${fresh.length - Math.max(room, 0)} 个`,
    );
  }
  if (room > 0) addFiles(fresh.slice(0, room), draftLink);
}

function acceptFiles(files: File[]) {
  const { accepted, rejected } = validateFiles(files, {
    accept: DESIGN_IMAGE_ACCEPT,
    maxSizeMb: SOURCE_IMAGE_MAX_SIZE_MB,
  });
  if (rejected.length > 0) message.warning(describeRejectedFiles(rejected));
  return accepted;
}

// 整个弹窗内容区都可以拖入文件
const { dragging, handlers: dropHandlers } = useFileDrop({
  onDrop(files) {
    const accepted = acceptFiles(files);
    if (accepted.length > 0) handleFiles(accepted);
  },
});

async function handleReplace(row: DesignRow) {
  const [file] = acceptFiles(await pickFiles({ accept: DESIGN_IMAGE_ACCEPT }));
  if (file) replaceFile(row, file, draftLink);
}

function getRowThumb(row: DesignRow) {
  return row.previewImageUrl || row.localThumbUrl || '';
}

function getActiveRowTask(row: DesignRow) {
  const task = getRowTask(row);
  return task && task.status !== 'success' ? task : undefined;
}

// ---------- 批量设置 ----------
const batchOpen = ref(false);
const batchValues = reactive<{
  packagingMethod?: string;
  productSpec?: string;
  purchasePrice?: number;
  quantity?: number;
  salePrice?: number;
}>({});

function applyBatchValues(onlyEmpty: boolean) {
  const patch: Partial<DesignRow> = {};
  if (batchValues.productSpec?.trim()) {
    patch.productSpec = batchValues.productSpec.trim();
  }
  if (batchValues.packagingMethod?.trim()) {
    patch.packagingMethod = batchValues.packagingMethod.trim();
  }
  if (typeof batchValues.salePrice === 'number') {
    patch.salePrice = batchValues.salePrice;
  }
  if (typeof batchValues.purchasePrice === 'number') {
    patch.purchasePrice = batchValues.purchasePrice;
  }
  if (typeof batchValues.quantity === 'number') {
    patch.quantity = batchValues.quantity;
  }
  const keys = Object.keys(patch) as (keyof DesignRow)[];
  if (keys.length === 0) {
    message.warning('请至少填写一项');
    return;
  }
  for (const row of draft.rows) {
    for (const key of keys) {
      const current = row[key];
      const isEmpty =
        current === undefined ||
        current === '' ||
        (key === 'quantity' && Number(current) === 1);
      if (!onlyEmpty || isEmpty) {
        (row as Record<string, unknown>)[key] = patch[key];
      }
    }
  }
  message.success(
    `已${onlyEmpty ? '填充' : '应用到'} ${draft.rows.length} 行`,
  );
  batchOpen.value = false;
}

// ---------- 提交 ----------
function validateRows() {
  submitAttempted.value = true;
  if (draft.rows.length === 0) {
    message.warning('请至少添加一张设计图');
    return false;
  }
  for (const [index, row] of draft.rows.entries()) {
    const line = `第 ${index + 1} 行`;
    const state = getRowState(row);
    if (state === 'uploading') {
      message.warning(`${line}还在上传，请稍候`);
      return false;
    }
    if (state === 'failed') {
      message.warning(`${line}上传失败，请重试或删除该行`);
      return false;
    }
    if (!row.designImageUrl.trim()) {
      message.warning(`${line}缺少设计图`);
      return false;
    }
    if (!row.productSpec?.trim()) {
      message.warning(`${line}请输入产品规格`);
      return false;
    }
  }
  const seen = new Set<string>();
  for (const [index, row] of draft.rows.entries()) {
    const url = row.designImageUrl.trim();
    if (seen.has(url)) {
      message.warning(`第 ${index + 1} 行的设计图与前面的行重复`);
      return false;
    }
    seen.add(url);
  }
  return true;
}

function normalizeBatchItems(): FdmNeixiaoPatternDesignItemApi.BatchCreateItem[] {
  return draft.rows.map((row) => ({
    designImageUrl: row.designImageUrl.trim(),
    previewImageUrl: row.previewImageUrl?.trim() || undefined,
    productSpec: row.productSpec?.trim() || '',
    packagingMethod: row.packagingMethod?.trim() || undefined,
    salePrice:
      typeof row.salePrice === 'number' && Number.isFinite(row.salePrice)
        ? row.salePrice
        : undefined,
    purchasePrice:
      typeof row.purchasePrice === 'number' &&
      Number.isFinite(row.purchasePrice)
        ? row.purchasePrice
        : undefined,
    quantity: Number(row.quantity || 1),
    remark: row.remark?.trim() || undefined,
  }));
}

async function submitBatchCreate() {
  const { valid } = await batchFormApi.validate();
  if (!valid) return false;
  if (!validateRows()) return false;
  const data = await batchFormApi.getValues();
  await createFdmNeixiaoPatternDesignItemBatch({
    ...(data as FdmNeixiaoPatternDesignItemApi.BatchCreateReq),
    items: normalizeBatchItems(),
    productionSent: Number(data.productionSent ?? 0),
    recognitionStatus: 0,
    status: 0,
  });
  message.success($t('ui.actionMessage.createSuccess'));
  return true;
}

async function applyCreateDefaults() {
  await batchFormApi.resetForm();
  await batchFormApi.setValues(
    {
      ...PATTERN_DESIGN_ITEM_DEFAULTS,
      followUser:
        String(userStore.userInfo?.nickname ?? '').trim() || undefined,
      orderDate: formatDateTime(new Date()),
      productionSent: 0,
    } as any,
    false,
  );
}

function describeDraftLoss() {
  const { total, uploading } = stats.value;
  return uploading > 0
    ? `已添加的 ${total} 个设计图（其中 ${uploading} 个正在上传）将被丢弃。`
    : `已添加的 ${total} 个设计图将被丢弃。`;
}

function handleResetDraft() {
  AntModal.confirm({
    title: '清空并重新填写？',
    content: describeDraftLoss(),
    okText: '清空',
    okButtonProps: { danger: true },
    zIndex: CONFIRM_Z_INDEX,
    async onOk() {
      clearDraft();
      restoredDraft.value = false;
      submitAttempted.value = false;
      await applyCreateDefaults();
    },
  });
}

const [Modal, modalApi] = useVbenModal({
  destroyOnClose: true,
  async onConfirm() {
    modalApi.lock();
    try {
      const success = await submitBatchCreate();
      if (!success) return;
      emit('success');
      closeIntent = 'submit';
      await modalApi.close();
    } finally {
      modalApi.unlock();
    }
  },
  onCancel() {
    if (!hasContent.value) {
      closeIntent = 'discard';
      void modalApi.close();
      return;
    }
    AntModal.confirm({
      title: '放弃本次新增？',
      content: describeDraftLoss(),
      okText: '放弃',
      okButtonProps: { danger: true },
      cancelText: '继续编辑',
      zIndex: CONFIRM_Z_INDEX,
      async onOk() {
        closeIntent = 'discard';
        await modalApi.close();
      },
    });
  },
  // 右上角关闭 / Esc / 「后台上传」：有设计图时保留草稿，上传在后台继续
  async onBeforeClose() {
    if (closeIntent || !hasContent.value) return true;
    draft.formValues = await batchFormApi.getValues();
    message.info(
      stats.value.uploading > 0
        ? '已转为后台上传，可在右下角查看进度；再次点击「新增」继续填写'
        : '未提交的内容已保留，再次点击「新增」继续填写',
    );
    return true;
  },
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      modalApi.unlock();
      resetShopNameOptions();
      if (closeIntent) clearDraft();
      closeIntent = undefined;
      return;
    }
    closeIntent = undefined;
    submitAttempted.value = false;
    resetShopNameOptions();
    void fetchShopNameOptions();
    await nextTick();
    if (hasContent.value) {
      restoredDraft.value = true;
      await batchFormApi.resetForm();
      await batchFormApi.setValues({ ...draft.formValues } as any, false);
      ensureShopNameOption(draft.formValues?.shopName);
      return;
    }
    restoredDraft.value = false;
    clearDraft();
    await applyCreateDefaults();
  },
});

watch(
  () => [stats.value, hasContent.value] as const,
  ([{ done, total, uploading }, content]) => {
    modalApi.setState({
      cancelText: content ? '放弃' : '取消',
      confirmDisabled: uploading > 0,
      confirmText: uploading > 0 ? `上传中（${done}/${total}）` : '提交',
    });
  },
  { immediate: true },
);
</script>

<template>
  <Modal
    title="新增内销定制订单"
    class="w-[1200px] max-w-[calc(100vw-2rem)]"
  >
    <div class="create-form" v-on="dropHandlers">
      <Alert
        v-if="restoredDraft"
        class="mb-4"
        show-icon
        type="info"
        message="已恢复上次未提交的内容，未完成的文件会继续上传"
      >
        <template #action>
          <Button size="small" type="link" @click="handleResetDraft">
            清空重填
          </Button>
        </template>
      </Alert>

      <section class="create-form__section">
        <div class="create-form__section-header">
          <div class="create-form__section-title">订单信息</div>
        </div>
        <BatchForm />
      </section>

      <section class="create-form__section">
        <div class="create-form__section-header">
          <div class="create-form__section-title">
            <span class="required">*</span>设计图明细
            <span v-if="statsText" class="create-form__stats">
              {{ statsText }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <Popover
              v-model:open="batchOpen"
              placement="bottomRight"
              title="批量设置明细"
              trigger="click"
              :z-index="CONFIRM_Z_INDEX"
            >
              <template #content>
                <div class="batch-popover">
                  <label>产品规格</label>
                  <Input
                    v-model:value="batchValues.productSpec"
                    allow-clear
                    :maxlength="255"
                    placeholder="不填则不修改"
                  />
                  <label>包装方式</label>
                  <Input
                    v-model:value="batchValues.packagingMethod"
                    allow-clear
                    :maxlength="128"
                    placeholder="不填则不修改"
                  />
                  <label>售价</label>
                  <InputNumber
                    v-model:value="batchValues.salePrice"
                    style="width: 100%"
                    :min="0"
                    :precision="6"
                    :step="0.01"
                    placeholder="不填则不修改"
                  />
                  <label>采购价</label>
                  <InputNumber
                    v-model:value="batchValues.purchasePrice"
                    style="width: 100%"
                    :min="0"
                    :precision="6"
                    :step="0.01"
                    placeholder="不填则不修改"
                  />
                  <label>数量</label>
                  <InputNumber
                    v-model:value="batchValues.quantity"
                    style="width: 100%"
                    :min="1"
                    :precision="0"
                    placeholder="不填则不修改"
                  />
                  <div class="batch-popover__actions">
                    <Button size="small" @click="applyBatchValues(true)">
                      只填空白项
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      @click="applyBatchValues(false)"
                    >
                      应用到全部行
                    </Button>
                  </div>
                </div>
              </template>
              <Button size="small" :disabled="draft.rows.length === 0">
                <template #icon>
                  <IconifyIcon icon="lucide:list-checks" />
                </template>
                批量设置
              </Button>
            </Popover>
            <Tooltip title="已有七牛原图地址时，直接粘贴 URL 添加一行">
              <Button size="small" @click="addUrlRow">
                <template #icon>
                  <IconifyIcon icon="lucide:link" />
                </template>
                按 URL 添加
              </Button>
            </Tooltip>
          </div>
        </div>

        <FileDropZone
          :accept="DESIGN_IMAGE_ACCEPT"
          :compact="draft.rows.length > 0"
          :droppable="false"
          :highlight="dragging"
          :max-size-mb="SOURCE_IMAGE_MAX_SIZE_MB"
          multiple
          title="把设计图拖到窗口任意位置，或"
          @select="handleFiles"
        />

        <div v-if="draft.rows.length > 0" class="create-form__table-wrap">
          <table class="create-form__table">
            <thead>
              <tr>
                <th class="w-[44px] text-center">#</th>
                <th>设计图</th>
                <th class="w-[180px]">
                  <span class="required">*</span>产品规格
                </th>
                <th class="w-[140px]">包装方式</th>
                <th class="w-[124px]">售价</th>
                <th class="w-[124px]">采购价</th>
                <th class="w-[92px]">数量</th>
                <th class="w-[160px]">备注</th>
                <th class="w-[108px] text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in draft.rows"
                :key="row.rowKey"
                :class="`is-${getRowState(row)}`"
              >
                <td class="text-center text-muted-foreground">
                  {{ index + 1 }}
                </td>
                <td>
                  <div class="design-cell">
                    <div class="design-cell__thumb">
                      <Image
                        v-if="getRowThumb(row)"
                        :height="52"
                        :preview="{ src: getRowThumb(row) }"
                        :src="getRowThumb(row)"
                        :width="52"
                      />
                      <IconifyIcon v-else icon="lucide:image" />
                    </div>
                    <div class="design-cell__body">
                      <Input
                        v-if="row.sourceType === 'url'"
                        v-model:value="row.designImageUrl"
                        allow-clear
                        placeholder="粘贴原图 URL"
                        :status="
                          submitAttempted && !row.designImageUrl.trim()
                            ? 'error'
                            : ''
                        "
                      />
                      <template v-else>
                        <div class="design-cell__name" :title="row.fileName">
                          {{ row.fileName }}
                        </div>
                        <UploadTaskProgress
                          v-if="getActiveRowTask(row)"
                          :task="getActiveRowTask(row)!"
                        />
                        <div
                          v-else-if="getRowState(row) === 'done'"
                          class="design-cell__meta is-done"
                        >
                          <IconifyIcon icon="lucide:circle-check" />
                          已上传 · {{ formatBytes(row.fileSize ?? 0) }}
                        </div>
                        <div v-else class="design-cell__meta is-failed">
                          未上传，点击右侧重试
                        </div>
                      </template>
                    </div>
                  </div>
                </td>
                <td>
                  <Input
                    v-model:value="row.productSpec"
                    allow-clear
                    :maxlength="255"
                    placeholder="必填"
                    :status="
                      submitAttempted && !row.productSpec?.trim() ? 'error' : ''
                    "
                  />
                </td>
                <td>
                  <Input
                    v-model:value="row.packagingMethod"
                    allow-clear
                    :maxlength="128"
                    placeholder="可选"
                  />
                </td>
                <td>
                  <InputNumber
                    v-model:value="row.salePrice"
                    class="w-full"
                    :min="0"
                    :precision="6"
                    :step="0.01"
                    placeholder="可选"
                  />
                </td>
                <td>
                  <InputNumber
                    v-model:value="row.purchasePrice"
                    class="w-full"
                    :min="0"
                    :precision="6"
                    :step="0.01"
                    placeholder="可选"
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
                    :maxlength="512"
                    placeholder="可选"
                  />
                </td>
                <td>
                  <div class="row-actions">
                    <Tooltip v-if="getRowState(row) === 'failed'" title="重试">
                      <Button
                        size="small"
                        type="text"
                        @click="retryRow(row, draftLink)"
                      >
                        <template #icon>
                          <IconifyIcon icon="lucide:rotate-cw" />
                        </template>
                      </Button>
                    </Tooltip>
                    <Tooltip v-if="row.sourceType === 'upload'" title="换一个文件">
                      <Button size="small" type="text" @click="handleReplace(row)">
                        <template #icon>
                          <IconifyIcon icon="lucide:image-up" />
                        </template>
                      </Button>
                    </Tooltip>
                    <Tooltip title="删除">
                      <Button
                        danger
                        size="small"
                        type="text"
                        @click="removeRow(row)"
                      >
                        <template #icon>
                          <IconifyIcon icon="lucide:trash-2" />
                        </template>
                      </Button>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div v-if="dragging" class="create-form__drop-mask">
        <IconifyIcon icon="lucide:cloud-upload" />
        <div>松开鼠标，添加设计图</div>
      </div>
    </div>

    <template #prepend-footer>
      <Tooltip
        v-if="stats.uploading > 0"
        title="关闭窗口，文件在后台继续上传；再次点击「新增」可继续填写"
      >
        <Button class="mr-2" @click="modalApi.close()">
          <template #icon>
            <IconifyIcon icon="lucide:minimize-2" />
          </template>
          后台上传
        </Button>
      </Tooltip>
    </template>
  </Modal>
</template>

<style scoped>
.create-form {
  position: relative;
}

.create-form__section + .create-form__section {
  padding-top: 16px;
  margin-top: 4px;
  border-top: 1px solid hsl(var(--border));
}

.create-form__section-header {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.create-form__section-title {
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.create-form__stats {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.required {
  margin-right: 4px;
  color: hsl(var(--destructive));
}

.create-form__table-wrap {
  margin-top: 12px;
  overflow-x: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.create-form__table {
  width: 100%;
  min-width: 1060px;
  border-collapse: collapse;
}

.create-form__table th,
.create-form__table td {
  padding: 8px 10px;
  text-align: left;
  vertical-align: middle;
  border-bottom: 1px solid hsl(var(--border));
}

.create-form__table th {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
  background: hsl(var(--muted) / 40%);
}

.create-form__table tbody tr:last-child td {
  border-bottom: 0;
}

.create-form__table tbody tr.is-failed {
  background: hsl(var(--destructive) / 4%);
}

.design-cell {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 260px;
}

.design-cell__thumb {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  overflow: hidden;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 50%);
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.design-cell__thumb :deep(.ant-image-img) {
  object-fit: cover;
}

.design-cell__body {
  flex: 1;
  min-width: 0;
}

.design-cell__name {
  margin-bottom: 4px;
  overflow: hidden;
  font-size: 13px;
  color: hsl(var(--foreground));
  text-overflow: ellipsis;
  white-space: nowrap;
}

.design-cell__meta {
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.design-cell__meta.is-done {
  color: hsl(var(--success));
}

.design-cell__meta.is-failed {
  color: hsl(var(--destructive));
}

.row-actions {
  display: flex;
  gap: 2px;
  justify-content: center;
}

.create-form__drop-mask {
  position: absolute;
  inset: -8px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  color: hsl(var(--primary));
  pointer-events: none;
  background: hsl(var(--background) / 85%);
  border: 2px dashed hsl(var(--primary));
  border-radius: 10px;
}

.create-form__drop-mask :deep(svg) {
  width: 40px;
  height: 40px;
}

.batch-popover {
  display: grid;
  grid-template-columns: 72px 220px;
  gap: 8px 10px;
  align-items: center;
}

.batch-popover label {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  text-align: right;
}

.batch-popover__actions {
  display: flex;
  grid-column: 1 / -1;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}
</style>
