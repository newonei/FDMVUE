import type { FdmAiApi } from '#/api/fdmai';

export type ProviderImageTransport = 'sub2api-async' | 'xai-native';

export function parseProviderConfiguration(value: string): Record<string, unknown> {
  const configuration: unknown = JSON.parse(value || '{}');
  if (!configuration || Array.isArray(configuration) || typeof configuration !== 'object') {
    throw new Error('高级配置必须是 JSON 对象');
  }
  return configuration as Record<string, unknown>;
}

export function getProviderImageTransport(configurationJson: string): ProviderImageTransport {
  return parseProviderConfiguration(configurationJson).imageTransport === 'sub2api-async'
    ? 'sub2api-async'
    : 'xai-native';
}

export function setProviderImageTransport(
  configurationJson: string,
  imageTransport: ProviderImageTransport,
) {
  return JSON.stringify({ ...parseProviderConfiguration(configurationJson), imageTransport }, null, 2);
}

export interface ProviderPreset {
  adapterCode: string;
  baseUrl: string;
  configuration?: Record<string, unknown>;
  description: string;
  key: string;
  name: string;
  placeholder: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    adapterCode: 'openai-compatible-text',
    baseUrl: 'https://api.openai.com/v1',
    description: 'OpenAI 官方 Chat Completions 与模型目录',
    key: 'openai',
    name: 'OpenAI',
    placeholder: 'https://api.openai.com/v1',
  },
  {
    adapterCode: 'xai-grok',
    baseUrl: 'https://api.x.ai/v1',
    description: 'Grok 文本、图片生成与编辑、异步视频生成；支持官方或兼容此协议的中转站',
    key: 'xai-grok',
    name: 'Grok / xAI',
    placeholder: 'https://api.x.ai/v1 或中转站的 /v1 地址',
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
    description: 'Sub2API OpenAI 兼容网关；使用 Grok 图片或视频接口时请选择 Grok / xAI',
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

export function getProviderPreset(key: string) {
  return PROVIDER_PRESETS.find((preset) => preset.key === key) ?? PROVIDER_PRESETS[0]!;
}

export function inferProviderPreset(row: Pick<FdmAiApi.ProviderAccount, 'adapterCode' | 'baseUrl' | 'name'>) {
  if (row.adapterCode === 'xai-grok') return 'xai-grok';
  if (row.adapterCode === 'volcengine-visual') return 'volcengine-ark';
  const value = `${row.name} ${row.baseUrl}`.toLowerCase();
  if (value.includes('api.openai.com')) return 'openai';
  if (value.includes('sub2api')) return 'sub2api';
  if (value.includes('new api') || value.includes('new-api')) return 'new-api';
  return 'custom-openai';
}

export function applyProviderPreset(
  form: FdmAiApi.ProviderSaveReq,
  key: string,
  editing: boolean,
) {
  const preset = getProviderPreset(key);
  form.adapterCode = preset.adapterCode;
  // Switching an existing account's protocol must never redirect its saved key.
  if (!editing) {
    form.name = preset.name;
    form.baseUrl = preset.baseUrl;
  }
  return preset;
}
