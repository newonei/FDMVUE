<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmAiApi } from '#/api/fdmai';

import { computed, onMounted, reactive, ref } from 'vue';

import {
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
  Tooltip,
} from 'ant-design-vue';

import {
  createFdmAiProvider,
  deleteFdmAiProvider,
  getFdmAiAdapters,
  getFdmAiProviders,
  testFdmAiProvider,
  updateFdmAiProvider,
} from '#/api/fdmai';

import AiCenterShell from '../shared/AiCenterShell.vue';

defineOptions({ name: 'FdmAiProviders' });

const loading = ref(false);
const saving = ref(false);
const modalOpen = ref(false);
const testingId = ref<number>();
const rows = ref<FdmAiApi.ProviderAccount[]>([]);
const adapters = ref<FdmAiApi.AdapterDescriptor[]>([]);
const editingId = ref<number>();
const configurationJson = ref('{}');
const form = reactive<FdmAiApi.ProviderSaveReq>({
  adapterCode: '',
  baseUrl: '',
  configuration: {},
  credential: '',
  enabled: true,
  name: '',
  platform: false,
});

const columns: TableColumnsType = [
  { dataIndex: 'name', title: '账号名称', width: 180 },
  { dataIndex: 'adapterCode', title: '适配器', width: 190 },
  { dataIndex: 'baseUrl', title: '服务地址' },
  { dataIndex: 'credentialMask', title: '凭证', width: 150 },
  { dataIndex: 'platform', title: '范围', width: 90 },
  { dataIndex: 'enabled', title: '状态', width: 90 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 220 },
];

const adapterOptions = computed(() =>
  adapters.value.map((item) => ({
    label: `${item.name} (${item.code})`,
    value: item.code,
  })),
);
const activeAdapter = computed(() =>
  adapters.value.find((item) => item.code === form.adapterCode),
);

async function load() {
  loading.value = true;
  try {
    [rows.value, adapters.value] = await Promise.all([
      getFdmAiProviders(true),
      getFdmAiAdapters(),
    ]);
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  editingId.value = undefined;
  configurationJson.value = '{}';
  Object.assign(form, {
    adapterCode: adapters.value[0]?.code ?? '',
    baseUrl: '',
    configuration: {},
    credential: '',
    enabled: true,
    name: '',
    platform: false,
  });
}

function openCreate() {
  resetForm();
  modalOpen.value = true;
}

function openEdit(record: Record<string, unknown>) {
  const row = record as unknown as FdmAiApi.ProviderAccount;
  editingId.value = row.id;
  configurationJson.value = JSON.stringify(row.configuration ?? {}, null, 2);
  Object.assign(form, {
    adapterCode: row.adapterCode,
    baseUrl: row.baseUrl,
    configuration: row.configuration,
    credential: '',
    enabled: row.enabled,
    name: row.name,
    platform: row.platform,
  });
  modalOpen.value = true;
}

async function save() {
  if (!form.name.trim() || !form.adapterCode || !form.baseUrl.trim()) {
    message.warning('请填写账号名称、适配器和服务地址');
    return;
  }
  if (!editingId.value && !form.credential?.trim()) {
    message.warning('新账号必须填写凭证');
    return;
  }
  let configuration: Record<string, unknown>;
  try {
    configuration = JSON.parse(configurationJson.value || '{}');
  } catch {
    message.error('扩展配置不是有效 JSON');
    return;
  }
  saving.value = true;
  try {
    const payload = { ...form, configuration };
    await (editingId.value
      ? updateFdmAiProvider(editingId.value, payload)
      : createFdmAiProvider(payload));
    modalOpen.value = false;
    message.success('服务商账号已保存，凭证不会在查询接口中返回');
    await load();
  } finally {
    saving.value = false;
  }
}

async function test(record: Record<string, unknown>) {
  const row = record as unknown as FdmAiApi.ProviderAccount;
  testingId.value = row.id;
  try {
    const result = await testFdmAiProvider(row.id);
    const detail = `${result.message || '无详情'} · ${result.latencyMillis}ms`;
    result.valid ? message.success(detail) : message.error(detail);
  } finally {
    testingId.value = undefined;
  }
}

async function remove(record: Record<string, unknown>) {
  const row = record as unknown as FdmAiApi.ProviderAccount;
  await deleteFdmAiProvider(row.id, row.platform);
  message.success('服务商账号已下线');
  await load();
}

onMounted(load);
</script>

<template>
  <AiCenterShell
    description="集中管理平台或租户模型凭证；密钥只写入、不可读回"
    title="服务商接入"
  >
    <template #actions>
      <Button
        v-access:code="['fdmai:provider:create']"
        type="primary"
        @click="openCreate"
      >
        新增服务商账号
      </Button>
    </template>
    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'adapterCode'">
          <Tag color="blue">{{ record.adapterCode }}</Tag>
        </template>
        <template v-else-if="column.dataIndex === 'baseUrl'">
          <Tooltip :title="record.baseUrl">
            <span class="base-url">{{ record.baseUrl }}</span>
          </Tooltip>
        </template>
        <template v-else-if="column.dataIndex === 'credentialMask'">
          <Tag color="green">{{ record.credentialMask || '已配置' }}</Tag>
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
              v-access:code="['fdmai:provider:test']"
              :loading="testingId === record.id"
              size="small"
              type="link"
              @click="test(record)"
            >
              连接测试
            </Button>
            <Button
              v-access:code="['fdmai:provider:update']"
              size="small"
              type="link"
              @click="openEdit(record)"
            >
              编辑
            </Button>
            <Popconfirm
              title="确认下线该服务商账号？历史调用仍会保留。"
              @confirm="remove(record)"
            >
              <Button
                v-access:code="['fdmai:provider:delete']"
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
      :title="editingId ? '编辑服务商账号' : '新增服务商账号'"
      :width="680"
      @ok="save"
    >
      <Form layout="vertical">
        <div class="two-columns">
          <Form.Item label="账号名称" required>
            <Input v-model:value="form.name" />
          </Form.Item>
          <Form.Item label="适配器" required>
            <Select
              v-model:value="form.adapterCode"
              :disabled="Boolean(editingId)"
              :options="adapterOptions"
            />
          </Form.Item>
        </div>
        <Form.Item label="服务地址" required>
          <Input
            v-model:value="form.baseUrl"
            placeholder="https://api.example.com"
          />
        </Form.Item>
        <Form.Item :label="editingId ? '轮换凭证' : '访问凭证'" required>
          <Input.Password
            v-model:value="form.credential"
            :placeholder="editingId ? '留空则保留现有凭证' : '凭证仅可写入一次'"
          />
        </Form.Item>
        <Form.Item label="扩展配置（JSON）">
          <Textarea v-model:value="configurationJson" :rows="6" />
          <small v-if="activeAdapter?.configurationSchema" class="schema-hint">
            该适配器提供配置 Schema，保存时由后端再次校验。
          </small>
        </Form.Item>
        <div class="switches">
          <label><Switch v-model:checked="form.enabled" /> 启用账号</label>
          <label v-access:code="['fdmai:platform:manage']">
            <Switch v-model:checked="form.platform" /> 平台共享账号
          </label>
        </div>
      </Form>
    </Modal>
  </AiCenterShell>
</template>

<style scoped>
.base-url {
  display: inline-block;
  max-width: 460px;
  overflow: hidden;
  color: #475569;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.schema-hint {
  display: block;
  margin-top: 5px;
  color: #64748b;
}
</style>
