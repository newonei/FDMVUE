<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmAiApi } from '#/api/fdmai';

import { computed, onMounted, reactive, ref } from 'vue';

import {
  Alert,
  AutoComplete,
  Button,
  Form,
  Input,
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
  createFdmAiRoute,
  deleteFdmAiRoute,
  getFdmAiModels,
  getFdmAiProviders,
  getFdmAiRoutes,
  updateFdmAiRoute,
} from '#/api/fdmai';

import AiCenterShell from '../shared/AiCenterShell.vue';

defineOptions({ name: 'FdmAiRoutes' });

const DEFAULT_KEYS = [
  'creative.planner.default',
  'creative.prompt.refine',
  'creative.image.generate.default',
  'creative.image.edit.default',
  'creative.video.generate.default',
];
const loading = ref(false);
const saving = ref(false);
const modalOpen = ref(false);
const editingId = ref<number>();
const rows = ref<FdmAiApi.RouteDefinition[]>([]);
const models = ref<FdmAiApi.ModelDefinition[]>([]);
const providers = ref<FdmAiApi.ProviderAccount[]>([]);
const providerOptionsJson = ref('{}');
const form = reactive<FdmAiApi.RouteSaveReq>({
  enabled: true,
  modelId: 0,
  platform: false,
  providerAccountId: 0,
  providerModel: '',
  providerOptions: {},
  routeKey: 'creative.planner.default',
});

const columns: TableColumnsType = [
  { dataIndex: 'routeKey', title: '场景路由', width: 270 },
  { dataIndex: 'modelId', title: '逻辑模型', width: 180 },
  { dataIndex: 'providerAccountId', title: '服务商账号', width: 180 },
  { dataIndex: 'providerModel', title: '供应商模型', width: 190 },
  { dataIndex: 'platform', title: '范围', width: 90 },
  { dataIndex: 'enabled', title: '状态', width: 90 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 130 },
];
const modelOptions = computed(() =>
  models.value.map((item) => ({
    label: `${item.name} · ${item.modality}`,
    value: item.id,
  })),
);
const providerOptions = computed(() =>
  providers.value.map((item) => ({
    label: `${item.name} · ${item.adapterCode}`,
    value: item.id,
  })),
);

function modelName(id: number) {
  return models.value.find((item) => item.id === id)?.name ?? `#${id}`;
}

function providerName(id: number) {
  return providers.value.find((item) => item.id === id)?.name ?? `#${id}`;
}

async function load() {
  loading.value = true;
  try {
    [rows.value, models.value, providers.value] = await Promise.all([
      getFdmAiRoutes(true),
      getFdmAiModels(),
      getFdmAiProviders(true),
    ]);
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  editingId.value = undefined;
  providerOptionsJson.value = '{}';
  Object.assign(form, {
    enabled: true,
    modelId: models.value[0]?.id ?? 0,
    platform: false,
    providerAccountId: providers.value[0]?.id ?? 0,
    providerModel: '',
    providerOptions: {},
    routeKey: 'creative.planner.default',
  });
}

function openCreate() {
  resetForm();
  modalOpen.value = true;
}

function openEdit(record: Record<string, unknown>) {
  const row = record as unknown as FdmAiApi.RouteDefinition;
  editingId.value = row.id;
  providerOptionsJson.value = JSON.stringify(
    row.providerOptions ?? {},
    null,
    2,
  );
  Object.assign(form, {
    enabled: row.enabled,
    modelId: row.modelId,
    platform: row.platform,
    providerAccountId: row.providerAccountId,
    providerModel: row.providerModel,
    providerOptions: row.providerOptions,
    routeKey: row.routeKey,
  });
  modalOpen.value = true;
}

async function save() {
  if (!form.routeKey.trim() || !form.providerModel.trim()) {
    message.warning('请填写场景路由和供应商模型标识');
    return;
  }
  let providerOptions: Record<string, unknown>;
  try {
    providerOptions = JSON.parse(providerOptionsJson.value || '{}');
  } catch {
    message.error('供应商参数不是有效 JSON');
    return;
  }
  saving.value = true;
  try {
    const payload = { ...form, providerOptions };
    await (editingId.value
      ? updateFdmAiRoute(editingId.value, payload)
      : createFdmAiRoute(payload));
    modalOpen.value = false;
    message.success('调用路由已保存');
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(record: Record<string, unknown>) {
  const row = record as unknown as FdmAiApi.RouteDefinition;
  await deleteFdmAiRoute(row.id, row.platform);
  message.success('调用路由已下线');
  await load();
}

onMounted(load);
</script>

<template>
  <AiCenterShell
    description="租户路由完整覆盖平台路由；配置损坏时默认失败，不静默消费平台凭证"
    title="调用路由"
  >
    <template #actions>
      <Button
        v-access:code="['fdmai:route:create']"
        type="primary"
        @click="openCreate"
      >
        新增路由
      </Button>
    </template>
    <Alert
      message="付费媒体生成默认不自动切换备用供应商，避免未知重复计费。"
      show-icon
      type="info"
    />
    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'routeKey'">
          <code>{{ record.routeKey }}</code>
        </template>
        <template v-else-if="column.dataIndex === 'modelId'">
          {{ modelName(record.modelId) }}
        </template>
        <template v-else-if="column.dataIndex === 'providerAccountId'">
          {{ providerName(record.providerAccountId) }}
        </template>
        <template v-else-if="column.dataIndex === 'platform'">
          <Tag :color="record.platform ? 'purple' : 'cyan'">
            {{ record.platform ? '平台' : '租户' }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'enabled'">
          <Tag :color="record.enabled ? 'green' : 'default'">
            {{ record.enabled ? '启用' : '停用' }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <Space>
            <Button
              v-access:code="['fdmai:route:update']"
              size="small"
              type="link"
              @click="openEdit(record)"
            >
              编辑
            </Button>
            <Popconfirm
              title="确认下线该路由？历史调用仍会保留。"
              @confirm="remove(record)"
            >
              <Button
                v-access:code="['fdmai:route:delete']"
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
      :title="editingId ? '编辑调用路由' : '新增调用路由'"
      :width="680"
      @ok="save"
    >
      <Form layout="vertical">
        <Form.Item label="场景路由" required>
          <AutoComplete
            v-model:value="form.routeKey"
            :options="DEFAULT_KEYS.map((value) => ({ label: value, value }))"
            placeholder="选择默认场景或输入自定义场景键"
          />
        </Form.Item>
        <div class="two-columns">
          <Form.Item label="逻辑模型" required>
            <Select v-model:value="form.modelId" :options="modelOptions" />
          </Form.Item>
          <Form.Item label="服务商账号" required>
            <Select
              v-model:value="form.providerAccountId"
              :options="providerOptions"
            />
          </Form.Item>
        </div>
        <Form.Item label="供应商模型标识" required>
          <Input
            v-model:value="form.providerModel"
            placeholder="例如 gpt-4.1-mini 或供应商工作流 ID"
          />
        </Form.Item>
        <Form.Item label="供应商默认参数（JSON）">
          <Textarea v-model:value="providerOptionsJson" :rows="7" />
        </Form.Item>
        <div class="switches">
          <label><Switch v-model:checked="form.enabled" /> 启用路由</label>
          <label v-access:code="['fdmai:platform:manage']">
            <Switch v-model:checked="form.platform" /> 平台默认路由
          </label>
        </div>
      </Form>
    </Modal>
  </AiCenterShell>
</template>

<style scoped>
code {
  padding: 3px 6px;
  color: #1d4ed8;
  background: #eff6ff;
  border-radius: 5px;
}

.two-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.switches {
  display: flex;
  gap: 28px;
}
</style>
