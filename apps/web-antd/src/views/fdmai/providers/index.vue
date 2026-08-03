<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmAiApi } from '#/api/fdmai';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';

import {
  Alert,
  Button,
  Checkbox,
  Collapse,
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
  Tooltip,
} from 'ant-design-vue';

import {
  createFdmAiProvider,
  deleteFdmAiProvider,
  discoverFdmAiProviderModels,
  getFdmAiAdapters,
  getFdmAiProviders,
  probeFdmAiProvider,
  testFdmAiProvider,
  updateFdmAiProvider,
} from '#/api/fdmai';

import AiCenterShell from '../shared/AiCenterShell.vue';

defineOptions({ name: 'FdmAiProviders' });

interface ProviderPreset {
  adapterCode: string;
  baseUrl: string;
  configuration?: Record<string, unknown>;
  description: string;
  key: string;
  name: string;
  placeholder: string;
}

const PRESETS: ProviderPreset[] = [
  {
    adapterCode: 'openai-compatible-text',
    baseUrl: 'https://api.openai.com/v1',
    description: 'OpenAI 官方 Chat Completions 与模型目录',
    key: 'openai',
    name: 'OpenAI',
    placeholder: 'https://api.openai.com/v1',
  },
  {
    adapterCode: 'openai-compatible-text',
    baseUrl: '',
    description: 'New API 自部署或托管中转站',
    key: 'new-api',
    name: 'New API',
    placeholder: 'https://new-api.example.com/v1',
  },
  {
    adapterCode: 'openai-compatible-text',
    baseUrl: '',
    description: 'Sub2API OpenAI 兼容网关',
    key: 'sub2api',
    name: 'Sub2API',
    placeholder: 'https://sub2api.example.com/v1',
  },
  {
    adapterCode: 'volcengine-visual',
    baseUrl: 'https://ark.cn-beijing.volces.com',
    configuration: { apiFamily: 'ARK' },
    description: '火山引擎 Ark 图片与视频生成接口',
    key: 'volcengine-ark',
    name: 'Volcengine Ark',
    placeholder: 'https://ark.cn-beijing.volces.com',
  },
  {
    adapterCode: 'openai-compatible-text',
    baseUrl: '',
    description: '任意实现 OpenAI 协议的服务地址',
    key: 'custom-openai',
    name: '自定义 OpenAI 兼容',
    placeholder: 'https://gateway.example.com/v1',
  },
];

const { hasAccessByCodes } = useAccess();
const canManagePlatform = hasAccessByCodes(['fdmai:platform:manage']);
const loading = ref(false);
const saving = ref(false);
const probing = ref(false);
const modalOpen = ref(false);
const discoveryOpen = ref(false);
const testingId = ref<number>();
const syncingId = ref<number>();
const rows = ref<FdmAiApi.ProviderAccount[]>([]);
const adapters = ref<FdmAiApi.AdapterDescriptor[]>([]);
const editingId = ref<number>();
const presetKey = ref('openai');
const configurationJson = ref('{}');
const probeResult = ref<FdmAiApi.ProviderProbeResult>();
const discoveredModels = ref<FdmAiApi.ProviderModelInfo[]>([]);
const discoveredProvider = ref<FdmAiApi.ProviderAccount>();
const advanced = reactive({
  allowInsecureHttp: false,
  internalNetwork: false,
  requestTimeoutSeconds: 120,
});
const form = reactive<FdmAiApi.ProviderSaveReq>({
  adapterCode: '',
  baseUrl: '',
  configuration: {},
  credential: '',
  enabled: true,
  name: '',
  platform: false,
});

const columns: TableColumnsType<FdmAiApi.ProviderAccount> = [
  { dataIndex: 'name', title: '账号名称', width: 180 },
  { dataIndex: 'adapterCode', title: '接入协议', width: 190 },
  { dataIndex: 'baseUrl', title: '服务地址' },
  { dataIndex: 'credentialMask', title: 'API Key', width: 150 },
  { dataIndex: 'platform', title: '范围', width: 90 },
  { dataIndex: 'enabled', title: '状态', width: 90 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 280 },
];
const discoveryColumns: TableColumnsType<FdmAiApi.ProviderModelInfo> = [
  { dataIndex: 'id', title: '模型标识' },
  { dataIndex: 'name', title: '模型名称', width: 220 },
  { dataIndex: 'ownedBy', title: '归属', width: 150 },
];

const presetOptions = computed(() =>
  PRESETS.map((preset) => ({
    disabled:
      adapters.value.length > 0 &&
      !adapters.value.some((item) => item.code === preset.adapterCode),
    label: preset.name,
    value: preset.key,
  })),
);
const activePreset = computed(
  () => PRESETS.find((item) => item.key === presetKey.value) ?? PRESETS[0]!,
);
const activeAdapter = computed(() =>
  adapters.value.find((item) => item.code === form.adapterCode),
);
const isHttpBaseUrl = computed(() =>
  form.baseUrl.trim().toLowerCase().startsWith('http://'),
);
const trustedHttp = computed({
  get: () =>
    form.platform && advanced.allowInsecureHttp && advanced.internalNetwork,
  set: (value: boolean) => {
    if (value && !canManagePlatform) {
      message.error('只有平台管理员可以接入可信内网 HTTP 地址');
      return;
    }
    form.platform = value;
    advanced.allowInsecureHttp = value;
    advanced.internalNetwork = value;
  },
});

function compactConfiguration(configuration: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(configuration).filter(([, value]) => value !== undefined),
  );
}

function providerPreset(row: FdmAiApi.ProviderAccount) {
  if (row.adapterCode === 'volcengine-visual') return 'volcengine-ark';
  const value = `${row.name} ${row.baseUrl}`.toLowerCase();
  if (value.includes('api.openai.com')) return 'openai';
  if (value.includes('sub2api')) return 'sub2api';
  if (value.includes('new api') || value.includes('new-api')) return 'new-api';
  return 'custom-openai';
}

function selectPreset(key: string, resetValues = true) {
  const preset = PRESETS.find((item) => item.key === key) ?? PRESETS[0]!;
  presetKey.value = preset.key;
  form.adapterCode = preset.adapterCode;
  probeResult.value = undefined;
  if (!resetValues) return;
  form.name = preset.name;
  form.baseUrl = preset.baseUrl;
  configurationJson.value = '{}';
  Object.assign(advanced, {
    allowInsecureHttp: false,
    internalNetwork: false,
    requestTimeoutSeconds: 120,
  });
}

function handlePresetChange(value: unknown) {
  if (typeof value === 'string') selectPreset(value);
}

async function load() {
  loading.value = true;
  try {
    [rows.value, adapters.value] = await Promise.all([
      getFdmAiProviders(canManagePlatform),
      getFdmAiAdapters(),
    ]);
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  editingId.value = undefined;
  probeResult.value = undefined;
  Object.assign(form, {
    adapterCode: '',
    baseUrl: '',
    configuration: {},
    credential: '',
    enabled: true,
    name: '',
    platform: false,
  });
  selectPreset('openai');
}

function openCreate() {
  resetForm();
  modalOpen.value = true;
}

function openEdit(record: unknown) {
  const provider = record as FdmAiApi.ProviderAccount;
  const configuration = { ...provider.configuration };
  editingId.value = provider.id;
  probeResult.value = undefined;
  presetKey.value = providerPreset(provider);
  Object.assign(advanced, {
    allowInsecureHttp: Boolean(configuration.allowInsecureHttp),
    internalNetwork: Boolean(configuration.internalNetwork),
    requestTimeoutSeconds: Number(configuration.requestTimeoutSeconds || 120),
  });
  delete configuration.allowInsecureHttp;
  delete configuration.internalNetwork;
  delete configuration.requestTimeoutSeconds;
  configurationJson.value = JSON.stringify(configuration, null, 2);
  Object.assign(form, {
    adapterCode: provider.adapterCode,
    baseUrl: provider.baseUrl,
    configuration: provider.configuration,
    credential: '',
    enabled: provider.enabled,
    name: provider.name,
    platform: provider.platform,
  });
  modalOpen.value = true;
}

function buildPayload(showWarning = true) {
  if (!form.name.trim() || !form.adapterCode || !form.baseUrl.trim()) {
    if (showWarning) message.warning('请填写接入平台、账号名称和 Base URL');
    return undefined;
  }
  if (!editingId.value && !form.credential?.trim()) {
    if (showWarning) message.warning('新账号必须填写 API Key');
    return undefined;
  }
  if (isHttpBaseUrl.value && !trustedHttp.value) {
    if (showWarning) {
      message.error('HTTP 地址必须确认是可信内网，并由平台管理员启用内网 HTTP');
    }
    return undefined;
  }
  let extra: Record<string, unknown>;
  try {
    extra = JSON.parse(configurationJson.value || '{}');
  } catch {
    if (showWarning) message.error('高级配置不是有效 JSON');
    return undefined;
  }
  const configuration = compactConfiguration({
    ...activePreset.value.configuration,
    ...extra,
    allowInsecureHttp: advanced.allowInsecureHttp,
    internalNetwork: advanced.internalNetwork,
    requestTimeoutSeconds: advanced.requestTimeoutSeconds,
  });
  return {
    ...form,
    baseUrl: form.baseUrl.trim(),
    configuration,
    credential: form.credential?.trim() || undefined,
    name: form.name.trim(),
  } satisfies FdmAiApi.ProviderSaveReq;
}

async function probeCurrent() {
  const payload = buildPayload();
  if (!payload) return undefined;
  if (editingId.value && !payload.credential) {
    message.info('编辑时未填写新 API Key，请保存后使用列表中的连接测试');
    return undefined;
  }
  probing.value = true;
  try {
    const result = await probeFdmAiProvider({
      discoverModels: true,
      provider: payload,
    });
    probeResult.value = result;
    if (result.normalizedBaseUrl) form.baseUrl = result.normalizedBaseUrl;
    if (!result.check.valid) {
      message.error(result.check.message || '连接测试失败');
      return result;
    }
    const suffix =
      result.models.length > 0 ? `，发现 ${result.models.length} 个模型` : '';
    message.success(`连接成功 · ${result.check.latencyMillis}ms${suffix}`);
    return result;
  } finally {
    probing.value = false;
  }
}

function showDiscoveredModels(
  provider: FdmAiApi.ProviderAccount,
  models: FdmAiApi.ProviderModelInfo[],
) {
  discoveredProvider.value = provider;
  discoveredModels.value = models;
  discoveryOpen.value = true;
}

async function testSavedProvider(
  record: unknown,
  discoverAfterSuccess = false,
) {
  const provider = record as FdmAiApi.ProviderAccount;
  testingId.value = provider.id;
  try {
    const result = await testFdmAiProvider(provider.id);
    const detail = `${result.message || '无详情'} · ${result.latencyMillis}ms`;
    if (!result.valid) {
      message.error(detail);
      return false;
    }
    message.success(detail);
    if (discoverAfterSuccess) await syncModels(provider, false);
    return true;
  } finally {
    testingId.value = undefined;
  }
}

async function save() {
  const payload = buildPayload();
  if (!payload) return;
  saving.value = true;
  try {
    let checked = probeResult.value;
    if (!editingId.value || payload.credential) {
      checked = await probeCurrent();
      if (!checked?.check.valid) return;
    }
    const saved = editingId.value
      ? await updateFdmAiProvider(editingId.value, payload)
      : await createFdmAiProvider(payload);
    modalOpen.value = false;
    form.credential = '';
    message.success('服务商账号已保存，API Key 不会在查询接口中返回');
    await load();
    if (checked?.check.valid) {
      if (checked.warning) message.warning(checked.warning);
      showDiscoveredModels(saved, checked.models ?? []);
    } else {
      await testSavedProvider(saved, true);
    }
  } finally {
    saving.value = false;
  }
}

async function syncModels(record: unknown, showSuccess = true) {
  const provider = record as FdmAiApi.ProviderAccount;
  syncingId.value = provider.id;
  try {
    const models = await discoverFdmAiProviderModels(provider.id);
    showDiscoveredModels(provider, models);
    if (showSuccess) message.success(`已同步 ${models.length} 个模型`);
  } finally {
    syncingId.value = undefined;
  }
}

async function remove(record: unknown) {
  const provider = record as FdmAiApi.ProviderAccount;
  await deleteFdmAiProvider(provider.id, provider.platform);
  message.success('服务商账号已下线');
  await load();
}

onMounted(load);
</script>

<template>
  <AiCenterShell
    description="选择常用平台，只需填写 Base URL 与 API Key；连接验证通过后自动获取模型目录"
    title="服务商接入"
  >
    <template #actions>
      <Button
        v-access:code="['fdmai:provider:create']"
        type="primary"
        @click="openCreate"
      >
        快速接入平台
      </Button>
    </template>

    <Alert
      message="API Key 只在创建或轮换时传输，保存后仅显示掩码，无法从系统中读回。"
      show-icon
      type="info"
    />

    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      row-key="id"
      :scroll="{ x: 1180 }"
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
          <Tag :color="record.credentialConfigured ? 'green' : 'red'">
            {{
              record.credentialMask ||
              (record.credentialConfigured ? '已配置' : '未配置')
            }}
          </Tag>
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
          <Space :size="4">
            <Button
              v-access:code="['fdmai:provider:test']"
              :loading="testingId === record.id"
              size="small"
              type="link"
              @click="testSavedProvider(record)"
            >
              测试
            </Button>
            <Button
              v-access:code="['fdmai:provider:query']"
              :loading="syncingId === record.id"
              size="small"
              type="link"
              @click="syncModels(record)"
            >
              拉取模型
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
      :title="editingId ? '编辑服务商账号' : '快速接入平台'"
      :width="720"
      @ok="save"
    >
      <Form layout="vertical">
        <div class="two-columns">
          <Form.Item label="接入平台" required>
            <Select
              v-model:value="presetKey"
              :disabled="Boolean(editingId)"
              :options="presetOptions"
              @change="handlePresetChange"
            />
            <small class="field-hint">{{ activePreset.description }}</small>
          </Form.Item>
          <Form.Item label="账号名称" required>
            <Input v-model:value="form.name" placeholder="用于后台识别该账号" />
          </Form.Item>
        </div>
        <Form.Item label="Base URL" required>
          <Input
            v-model:value="form.baseUrl"
            :placeholder="activePreset.placeholder"
            @change="probeResult = undefined"
          />
        </Form.Item>
        <Alert
          v-if="isHttpBaseUrl"
          class="http-alert"
          message="检测到未加密的 HTTP 地址"
          show-icon
          type="warning"
        >
          <template #description>
            <Checkbox
              v-model:checked="trustedHttp"
              :disabled="!canManagePlatform"
            >
              这是可信内网 HTTP 地址
            </Checkbox>
            <div v-if="!canManagePlatform" class="field-hint">
              请联系平台管理员完成接入；普通租户不能开启内网 HTTP。
            </div>
            <div v-else class="field-hint">
              确认后将同时启用平台共享、内网访问与允许 HTTP。
            </div>
          </template>
        </Alert>
        <Form.Item
          :label="editingId ? '轮换 API Key' : 'API Key'"
          :required="!editingId"
        >
          <Input.Password
            v-model:value="form.credential"
            autocomplete="new-password"
            :placeholder="
              editingId ? '留空则保留现有 API Key' : '请输入平台 API Key'
            "
            @change="probeResult = undefined"
          />
        </Form.Item>

        <Alert
          v-if="probeResult"
          class="probe-result"
          :message="
            probeResult.check.valid
              ? `连接成功 · ${probeResult.check.latencyMillis}ms · 发现 ${probeResult.models.length} 个模型`
              : probeResult.check.message || '连接失败'
          "
          show-icon
          :type="probeResult.check.valid ? 'success' : 'error'"
        />

        <Collapse ghost>
          <Collapse.Panel key="advanced" header="高级设置">
            <Alert
              class="advanced-alert"
              message="仅内网且确认可信时才允许 HTTP；自定义 JSON 不能填写 API Key。"
              show-icon
              type="warning"
            />
            <div class="two-columns">
              <Form.Item label="适配器">
                <Input :value="form.adapterCode" disabled />
              </Form.Item>
              <Form.Item label="请求超时（秒）">
                <InputNumber
                  v-model:value="advanced.requestTimeoutSeconds"
                  class="full"
                  :max="600"
                  :min="1"
                />
              </Form.Item>
            </div>
            <Form.Item label="适配器扩展配置（JSON）">
              <Textarea v-model:value="configurationJson" :rows="5" />
              <small
                v-if="activeAdapter?.configurationSchema"
                class="field-hint"
              >
                保存前和保存时都会按适配器 Schema 校验。
              </small>
            </Form.Item>
            <div class="switches">
              <label><Switch v-model:checked="form.enabled" /> 启用账号</label>
              <label>
                <Switch v-model:checked="advanced.internalNetwork" /> 内网地址
              </label>
              <label>
                <Switch v-model:checked="advanced.allowInsecureHttp" /> 允许
                HTTP
              </label>
              <label v-if="canManagePlatform">
                <Switch v-model:checked="form.platform" /> 平台共享账号
              </label>
            </div>
          </Collapse.Panel>
        </Collapse>
      </Form>
      <template #footer>
        <Button @click="modalOpen = false">取消</Button>
        <Button
          v-access:code="['fdmai:provider:test']"
          :disabled="Boolean(editingId && !form.credential)"
          :loading="probing"
          @click="probeCurrent"
        >
          测试并拉取模型
        </Button>
        <Button :loading="saving" type="primary" @click="save">
          保存账号
        </Button>
      </template>
    </Modal>

    <Modal
      v-model:open="discoveryOpen"
      :footer="null"
      :title="`${discoveredProvider?.name || '服务商'} · 模型目录`"
      :width="760"
    >
      <Alert
        class="discovery-alert"
        :message="
          discoveredModels.length
            ? `已发现 ${discoveredModels.length} 个模型，可前往“模型管理”选择并导入。`
            : '连接正常，但该服务商没有返回可发现的模型；可以在模型管理中手动填写模型 ID。'
        "
        show-icon
        :type="discoveredModels.length ? 'success' : 'warning'"
      />
      <Table
        :columns="discoveryColumns"
        :data-source="discoveredModels"
        :pagination="{ pageSize: 8 }"
        row-key="id"
        size="small"
      />
    </Modal>
  </AiCenterShell>
</template>

<style scoped>
.base-url {
  display: inline-block;
  max-width: 420px;
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
  flex-wrap: wrap;
  gap: 16px 28px;
}

.field-hint {
  display: block;
  margin-top: 5px;
  color: #64748b;
}

.probe-result,
.http-alert,
.advanced-alert,
.discovery-alert {
  margin-bottom: 12px;
}

.full {
  width: 100%;
}

@media (max-width: 720px) {
  .two-columns {
    grid-template-columns: 1fr;
  }
}
</style>
