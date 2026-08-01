<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmAiApi } from '#/api/fdmai';

import { computed, onMounted, reactive, ref } from 'vue';

import {
  Button,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  createFdmAiModel,
  deleteFdmAiModel,
  getFdmAiModels,
  updateFdmAiModel,
} from '#/api/fdmai';

import AiCenterShell from '../shared/AiCenterShell.vue';

defineOptions({ name: 'FdmAiModels' });

const MODALITIES: FdmAiApi.Modality[] = [
  'TEXT',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'EMBEDDING',
  'RERANK',
  'MUSIC',
];
const CAPABILITIES: FdmAiApi.Capability[] = [
  'CHAT',
  'STRUCTURED_OUTPUT',
  'IMAGE_INPUT',
  'TEXT_TO_IMAGE',
  'IMAGE_TO_IMAGE',
  'MULTI_REFERENCE',
  'IMAGE_EDIT',
  'TEXT_TO_VIDEO',
  'FIRST_FRAME_TO_VIDEO',
  'FIRST_LAST_FRAME_TO_VIDEO',
  'TEXT_TO_AUDIO',
  'EMBEDDING',
  'RERANK',
  'TEXT_TO_MUSIC',
];

const loading = ref(false);
const saving = ref(false);
const modalOpen = ref(false);
const editingId = ref<number>();
const rows = ref<FdmAiApi.ModelDefinition[]>([]);
const filterModality = ref<FdmAiApi.Modality>();
const form = reactive<FdmAiApi.ModelSaveReq>({
  capabilities: ['CHAT'],
  code: '',
  currency: 'CNY',
  enabled: true,
  modality: 'TEXT',
  name: '',
  parameterSchema: '{\n  "type": "object",\n  "properties": {}\n}',
  unitPrice: 0,
});

const filteredRows = computed(() =>
  filterModality.value
    ? rows.value.filter((row) => row.modality === filterModality.value)
    : rows.value,
);
const columns: TableColumnsType = [
  { dataIndex: 'name', title: '逻辑模型', width: 190 },
  { dataIndex: 'code', title: '模型编码', width: 190 },
  { dataIndex: 'modality', title: '模态', width: 100 },
  { dataIndex: 'capabilities', title: '能力' },
  { dataIndex: 'unitPrice', title: '参考单价', width: 120 },
  { dataIndex: 'enabled', title: '状态', width: 90 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 130 },
];

async function load() {
  loading.value = true;
  try {
    rows.value = await getFdmAiModels();
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  editingId.value = undefined;
  Object.assign(form, {
    capabilities: ['CHAT'],
    code: '',
    currency: 'CNY',
    enabled: true,
    modality: 'TEXT',
    name: '',
    parameterSchema: '{\n  "type": "object",\n  "properties": {}\n}',
    unitPrice: 0,
  });
}

function openCreate() {
  resetForm();
  modalOpen.value = true;
}

function openEdit(record: Record<string, unknown>) {
  const row = record as unknown as FdmAiApi.ModelDefinition;
  editingId.value = row.id;
  Object.assign(form, {
    capabilities: [...row.capabilities],
    code: row.code,
    currency: row.currency || 'CNY',
    enabled: row.enabled,
    modality: row.modality,
    name: row.name,
    parameterSchema: row.parameterSchema || '{}',
    unitPrice: row.unitPrice || 0,
  });
  modalOpen.value = true;
}

async function save() {
  if (
    !form.name.trim() ||
    !form.code.trim() ||
    form.capabilities.length === 0
  ) {
    message.warning('请填写模型名称、编码并至少选择一项能力');
    return;
  }
  try {
    JSON.parse(form.parameterSchema || '{}');
  } catch {
    message.error('参数 Schema 不是有效 JSON');
    return;
  }
  saving.value = true;
  try {
    await (editingId.value
      ? updateFdmAiModel(editingId.value, form)
      : createFdmAiModel(form));
    modalOpen.value = false;
    message.success('逻辑模型已保存');
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(id: number) {
  await deleteFdmAiModel(id);
  message.success('逻辑模型已下线');
  await load();
}

onMounted(load);
</script>

<template>
  <AiCenterShell
    description="模型只声明稳定能力和参数 Schema，不绑定供应商密钥"
    title="模型管理"
  >
    <template #actions>
      <Button
        v-access:code="['fdmai:model:create']"
        type="primary"
        @click="openCreate"
      >
        新增逻辑模型
      </Button>
    </template>
    <div class="filter-bar">
      <Select
        v-model:value="filterModality"
        allow-clear
        :options="MODALITIES.map((value) => ({ label: value, value }))"
        placeholder="筛选模态"
      />
      <span>共 {{ filteredRows.length }} 个逻辑模型</span>
    </div>
    <Table
      :columns="columns"
      :data-source="filteredRows"
      :loading="loading"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'modality'">
          <Tag color="geekblue">{{ record.modality }}</Tag>
        </template>
        <template v-else-if="column.dataIndex === 'capabilities'">
          <Space :size="4" wrap>
            <Tag v-for="capability in record.capabilities" :key="capability">
              {{ capability }}
            </Tag>
          </Space>
        </template>
        <template v-else-if="column.dataIndex === 'unitPrice'">
          {{ record.unitPrice ?? 0 }} {{ record.currency || 'CNY' }}
        </template>
        <template v-else-if="column.dataIndex === 'enabled'">
          <Tag :color="record.enabled ? 'green' : 'default'">
            {{ record.enabled ? '启用' : '停用' }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <Space>
            <Button
              v-access:code="['fdmai:model:update']"
              size="small"
              type="link"
              @click="openEdit(record)"
            >
              编辑
            </Button>
            <Popconfirm
              title="确认下线该模型？历史调用仍会保留。"
              @confirm="remove(record.id)"
            >
              <Button
                v-access:code="['fdmai:model:delete']"
                danger
                size="small"
                type="link"
              >
                下线
              </Button>
            </Popconfirm>
          </Space>
        </template>
      </template>
    </Table>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      :title="editingId ? '编辑逻辑模型' : '新增逻辑模型'"
      :width="720"
      @ok="save"
    >
      <Form layout="vertical">
        <div class="two-columns">
          <Form.Item label="模型名称" required>
            <Input v-model:value="form.name" />
          </Form.Item>
          <Form.Item label="模型编码" required>
            <Input v-model:value="form.code" placeholder="creative-image-v1" />
          </Form.Item>
          <Form.Item label="模态" required>
            <Select
              v-model:value="form.modality"
              :options="MODALITIES.map((value) => ({ label: value, value }))"
            />
          </Form.Item>
          <Form.Item label="能力" required>
            <Select
              v-model:value="form.capabilities"
              mode="multiple"
              :options="CAPABILITIES.map((value) => ({ label: value, value }))"
            />
          </Form.Item>
          <Form.Item label="参考单价">
            <InputNumber v-model:value="form.unitPrice" :min="0" class="full" />
          </Form.Item>
          <Form.Item label="币种">
            <Input v-model:value="form.currency" />
          </Form.Item>
        </div>
        <Form.Item label="参数 JSON Schema">
          <Textarea v-model:value="form.parameterSchema" :rows="10" />
        </Form.Item>
        <label><Switch v-model:checked="form.enabled" /> 启用模型</label>
      </Form>
    </Modal>
  </AiCenterShell>
</template>

<style scoped>
.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  color: #64748b;
  background: white;
  border: 1px solid #e7edf5;
  border-radius: 10px;
}

.filter-bar :deep(.ant-select) {
  width: 180px;
}

.two-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}

.full {
  width: 100%;
}
</style>
