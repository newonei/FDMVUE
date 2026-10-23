<script setup lang="ts">
import type { ContractFileFilter } from './contract-files';

import type { Directory } from '#/api/fdmplatform';
import type {
  ContractFile,
  ContractFileListing,
} from '#/api/fdmplatform/contract-files';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import { Upload } from '@vben/icons';

import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Input,
  message,
  Radio,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { newIdempotencyKey, uploadAttachment } from '#/api/fdmplatform';
import {
  contractFileRenamable,
  downloadContractFile,
  renameContractFile,
} from '#/api/fdmplatform/contract-files';
import { attachmentSize } from '#/api/fdmplatform/submission-files';

import { errorText } from '../data';
import { attachmentTime, previewMimeType } from './attachment-preview';
import AttachmentPreview from './AttachmentPreview.vue';
import {
  contractAttachmentCategories,
  contractFileCounts,
  contractFileGroups,
  filterContractFiles,
} from './contract-files';
import RenameFileDialog from './RenameFileDialog.vue';

const props = defineProps<{
  contractId: string;
  directory?: Directory;
  error: string;
  listing?: ContractFileListing;
  loading: boolean;
  /** 合同详情可上传合同资料；单据详情里仅查看 */
  uploadable?: boolean;
}>();
const emit = defineEmits<{ busy: [value: boolean]; refresh: [] }>();

const filter = reactive<ContractFileFilter>({
  group: 'ALL',
  keyword: '',
  showSuperseded: false,
});
watch(
  () => props.contractId,
  () => {
    filter.group = 'ALL';
    filter.keyword = '';
    filter.showSuperseded = false;
  },
);
const items = computed(() => props.listing?.items ?? []);
const counts = computed(() =>
  contractFileCounts(items.value, filter.showSuperseded),
);
const groups = computed(() =>
  contractFileGroups.filter(
    (group) => counts.value[group.key] > 0 || filter.group === group.key,
  ),
);
const hasSuperseded = computed(() =>
  items.value.some((item) => item.superseded),
);
const visible = computed(() => filterContractFiles(items.value, filter));
const groupColors: Record<string, string> = {
  CONTRACT: 'blue',
  PRODUCT: 'cyan',
  PURCHASE: 'orange',
  CUSTOMS: 'purple',
  LOGISTICS: 'green',
  FINANCE: 'gold',
};
const categories = computed(() =>
  props.uploadable && props.listing?.enabled
    ? props.listing.uploadCategories
    : [],
);

const category = ref<string>();
const selectedFile = ref<File>();
const fileInput = ref<HTMLInputElement>();
const uploading = ref(false);
const uploadKey = ref('');
const downloading = ref('');
const operationError = ref('');
watch(uploading, (value) => emit('busy', value), { flush: 'sync' });
onBeforeUnmount(() => emit('busy', false));

function chooseFile(event: Event) {
  selectedFile.value = (event.target as HTMLInputElement).files?.[0];
  uploadKey.value = newIdempotencyKey();
}
/** 也可把文件直接拖到上传区，效果同「选择文件」 */
const dragging = ref(false);
function dropFile(event: DragEvent) {
  dragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (!file || uploading.value) return;
  selectedFile.value = file;
  uploadKey.value = newIdempotencyKey();
}
async function upload() {
  if (!selectedFile.value || !category.value) return;
  uploading.value = true;
  operationError.value = '';
  try {
    await uploadAttachment(
      props.contractId,
      selectedFile.value,
      category.value,
      uploadKey.value || newIdempotencyKey(),
    );
    selectedFile.value = undefined;
    if (fileInput.value) fileInput.value.value = '';
    message.success('合同资料已上传');
    emit('refresh');
  } catch (error) {
    operationError.value = errorText(error);
  } finally {
    uploading.value = false;
  }
}
const preview = ref<InstanceType<typeof AttachmentPreview>>();
const previewing = ref<ContractFile>();
async function fetchFile(file: ContractFile) {
  downloading.value = `${file.source}:${file.id}`;
  operationError.value = '';
  try {
    return await downloadContractFile(props.contractId, file);
  } catch (error) {
    operationError.value = errorText(error);
  } finally {
    downloading.value = '';
  }
}
async function show(file: ContractFile) {
  const blob = await fetchFile(file);
  if (!blob) return;
  previewing.value = file;
  preview.value?.show(blob, file.name);
}
async function download(file: ContractFile) {
  const blob = await fetchFile(file);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
const renaming = ref<ContractFile>();
const renameOpen = ref(false);
const renameKey = ref('');
function startRename(file: ContractFile) {
  renaming.value = file;
  renameKey.value = newIdempotencyKey();
  renameOpen.value = true;
}
async function saveRename(name: string) {
  if (!renaming.value) return;
  await renameContractFile(
    props.contractId,
    renaming.value,
    name,
    renameKey.value,
  );
  message.success('文件名称已修改');
  emit('refresh');
}
function uploader(id?: null | number) {
  if (!id) return '—';
  return (
    props.directory?.users.find((user) => user.id === id)?.nickname ??
    `用户 #${id}`
  );
}
const columns = [
  { title: '附件名称', key: 'name', ellipsis: true },
  { title: '来源单据', key: 'source', width: 260 },
  { title: '资料分类', dataIndex: 'categoryLabel', width: 140 },
  { title: '大小', key: 'size', width: 90 },
  { title: '上传人', key: 'uploadedBy', width: 100 },
  { title: '上传时间', key: 'createdAt', width: 140 },
  { title: '操作', key: 'action', width: 160, fixed: 'right' as const },
];
</script>

<template>
  <div class="contract-files">
    <Alert
      v-if="error || operationError"
      type="error"
      show-icon
      :message="error || operationError"
    />
    <div
      v-if="uploadable && categories.length"
      class="upload-row"
      :class="{ dragging: dragging && !uploading }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="dropFile"
    >
      <input
        ref="fileInput"
        type="file"
        hidden
        aria-label="选择合同资料"
        :disabled="uploading"
        @change="chooseFile"
      />
      <Space wrap>
        <strong>上传合同资料</strong>
        <Select
          v-model:value="category"
          :options="
            categories.map((value) => ({
              value,
              label: contractAttachmentCategories[value] ?? value,
            }))
          "
          placeholder="资料分类"
          style="width: 150px"
          :disabled="uploading"
          @change="uploadKey = newIdempotencyKey()"
        />
        <Button :disabled="uploading" @click="fileInput?.click()">
          <template #icon>
            <Upload class="mr-1 inline-block size-4" aria-hidden="true" />
          </template>
          {{ selectedFile ? '重新选择' : '选择文件' }}
        </Button>
        <span
          class="inline-block max-w-60 truncate align-middle"
          :class="{ 'text-muted-foreground': !selectedFile }"
          :title="selectedFile?.name"
          role="status"
        >
          {{ selectedFile?.name ?? '尚未选择文件，也可将文件拖到这里' }}
        </span>
        <Button
          type="primary"
          :loading="uploading"
          :disabled="!selectedFile || !category"
          @click="upload"
        >
          上传
        </Button>
      </Space>
      <p class="text-muted-foreground text-sm">
        这里上传的资料归属合同本身。报关、采购单、请款付款、报销等单据的附件在对应单据中上传，会自动汇总到下方列表。
      </p>
    </div>
    <Alert
      v-else-if="uploadable && listing && !listing.enabled"
      type="warning"
      show-icon
      message="系统文件存储暂不可用，请检查基础设施中的文件配置。"
    />
    <div class="toolbar">
      <Radio.Group
        v-model:value="filter.group"
        button-style="solid"
        size="small"
      >
        <Radio.Button value="ALL">全部 {{ counts.ALL }}</Radio.Button>
        <Radio.Button
          v-for="group in groups"
          :key="group.key"
          :value="group.key"
        >
          {{ group.label }} {{ counts[group.key] }}
        </Radio.Button>
      </Radio.Group>
      <Space wrap>
        <Checkbox v-if="hasSuperseded" v-model:checked="filter.showSuperseded">
          显示已替换的旧版本
        </Checkbox>
        <Input.Search
          v-model:value="filter.keyword"
          placeholder="文件名 / 单号 / 分类"
          allow-clear
          style="width: 200px"
        />
        <Button :loading="loading" @click="emit('refresh')">刷新</Button>
      </Space>
    </div>
    <Table
      :data-source="visible"
      :row-key="(record: ContractFile) => `${record.source}:${record.id}`"
      :loading="loading"
      :columns="columns"
      :pagination="{ pageSize: 20, hideOnSinglePage: true, size: 'small' }"
      :scroll="{ x: 980 }"
      size="small"
    >
      <template #emptyText>
        <Empty
          :description="
            items.length ? '没有符合筛选条件的附件' : '该合同及关联单据暂无附件'
          "
        />
      </template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <span :title="record.name">{{ record.name }}</span>
          <Tag v-if="record.revision" class="ml-2">
            第 {{ record.revision }} 版
          </Tag>
          <Tag v-if="record.superseded" color="default">已替换</Tag>
        </template>
        <span
          v-else-if="column.key === 'source'"
          class="source-cell"
          :title="record.sourceCode ?? undefined"
        >
          <Tag :color="groupColors[record.group]">{{ record.sourceTitle }}</Tag>
          {{ record.sourceCode }}
        </span>
        <span v-else-if="column.key === 'size'">
          {{ attachmentSize(Number(record.size)) }}
        </span>
        <span v-else-if="column.key === 'uploadedBy'">
          {{ uploader(record.uploadedBy) }}
        </span>
        <span v-else-if="column.key === 'createdAt'">
          {{ attachmentTime(record.createdAt) }}
        </span>
        <Space v-else-if="column.key === 'action'" :size="0">
          <Button
            v-if="previewMimeType(record.name)"
            type="link"
            size="small"
            :disabled="downloading === `${record.source}:${record.id}`"
            @click="show(record as ContractFile)"
          >
            预览
          </Button>
          <Button
            v-if="contractFileRenamable(record as ContractFile)"
            type="link"
            size="small"
            @click="startRename(record as ContractFile)"
          >
            改名
          </Button>
          <Button
            type="link"
            size="small"
            :disabled="downloading === `${record.source}:${record.id}`"
            @click="download(record as ContractFile)"
          >
            下载
          </Button>
        </Space>
      </template>
    </Table>
    <AttachmentPreview
      ref="preview"
      @download="previewing && download(previewing)"
    />
    <RenameFileDialog
      v-model:open="renameOpen"
      :name="renaming?.name"
      :save="saveRename"
    />
  </div>
</template>

<style scoped>
.contract-files {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.upload-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: hsl(var(--accent));
  border-radius: 6px;
}

.upload-row p {
  margin: 0;
}

.source-cell {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.upload-row.dragging {
  outline: 1px dashed #1677ff;
  outline-offset: 2px;
  background: #e6f4ff;
}
</style>
