<script lang="ts" setup>
import type {
  FdmAiChatHistoryItem,
  FdmAiConversationIdentity,
  FdmAiPendingQuestionCommand,
  FdmProductAssistantChatRequest,
  FdmWaimaoAssistantChatRequest,
} from '../ai-assistant/types';

import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import {
  Alert,
  Button,
  Drawer,
  Empty,
  Select,
  Spin,
  Tag,
  Textarea,
  Tooltip,
} from 'ant-design-vue';

import {
  chatWithFdmProductAi,
  getFdmProductAiModels,
} from '#/api/fdmproduct/ai';
import {
  chatWithFdmWaimaoAi,
  getFdmWaimaoAiCompanies,
  getFdmWaimaoAiModels,
} from '#/api/fdmwaimao/ai';

import { useCurrentFdmWaimaoAiContext } from '../ai-assistant/context';
import {
  isFdmProductAiPath,
  resolveFdmProductAiSurface,
} from '../ai-assistant/product-surfaces';
import {
  isFdmWaimaoAiPath,
  resolvedFdmWaimaoAiDescription,
  resolvedFdmWaimaoAiQuestions,
  resolveFdmWaimaoAiSurface,
} from '../ai-assistant/surfaces';
import {
  fdmAiPendingQuestionKey,
  isSameFdmAiConversationIdentity,
} from '../ai-assistant/types';

defineOptions({ name: 'FdmWaimaoTradeAiAssistantHost' });

interface AiModelOption {
  capabilities: string[];
  code: string;
  enabled: boolean;
  id: string;
  name: string;
}

interface AiCompanyOption {
  id: string;
  name: string;
}

interface AiModelQuery {
  businessId: string;
  companyId: string;
  pageKey: string;
}

interface AiChatResponse {
  answer: string;
  generatedAt?: number | string;
  invocationId?: string;
  modelId: string;
  modelName?: string;
}

interface AiDomainConfigBase {
  getModels(query: AiModelQuery): Promise<AiModelOption[]>;
  idempotencyPrefix: string;
  launcherTitle: string;
  permission: string;
}

interface FdmProductAiDomainConfig extends AiDomainConfigBase {
  chat(data: FdmProductAssistantChatRequest): Promise<AiChatResponse>;
  key: 'fdmproduct';
}

interface FdmWaimaoAiDomainConfig extends AiDomainConfigBase {
  chat(data: FdmWaimaoAssistantChatRequest): Promise<AiChatResponse>;
  getCompanies(identity: {
    businessId: string;
    pageKey: string;
  }): Promise<AiCompanyOption[]>;
  key: 'fdmwaimao';
}

type AiDomainConfig = FdmProductAiDomainConfig | FdmWaimaoAiDomainConfig;

interface ConversationMessage {
  content: string;
  createdAt: number | string;
  id: string;
  invocationId?: string;
  modelName?: string;
  role: 'assistant' | 'user';
}

const SESSION_STORAGE_PREFIX = 'fdm:waimao-ai:conversation:v1';
const MAX_MESSAGES = 24;
const MAX_HISTORY_MESSAGES = 12;
const MAX_QUESTION_CHARACTERS = 2000;

const route = useRoute();
const userStore = useUserStore();
const { hasAccessByCodes } = useAccess();
const registeredContext = useCurrentFdmWaimaoAiContext();

const open = ref(false);
const input = ref('');
const sending = ref(false);
const loadingModels = ref(false);
const loadingCompanies = ref(false);
const companies = ref<AiCompanyOption[]>([]);
const selectedCompanyId = ref<string>();
const models = ref<AiModelOption[]>([]);
const selectedModelId = ref<string>();
const modelError = ref('');
const companyError = ref('');
const chatError = ref('');
const messages = ref<ConversationMessage[]>([]);
const threadRef = ref<HTMLElement>();
let modelRequestVersion = 0;
let companyRequestVersion = 0;
let chatRequestVersion = 0;
const pendingQuestionCommands = new Map<string, FdmAiPendingQuestionCommand>();

const domain = computed<AiDomainConfig | undefined>(() => {
  if (isFdmProductAiPath(route.path)) {
    return {
      chat: (data: FdmProductAssistantChatRequest) => {
        if (!data.companyId) {
          return Promise.reject(new Error('请先选择公司，再使用产品中心 AI。'));
        }
        return chatWithFdmProductAi({ ...data, companyId: data.companyId });
      },
      getModels: () => getFdmProductAiModels(),
      idempotencyPrefix: 'fdm-product-ai',
      key: 'fdmproduct',
      launcherTitle: '打开产品中心 AI 助手',
      permission: 'fdmproduct:ai:use',
    };
  }
  if (isFdmWaimaoAiPath(route.path)) {
    return {
      chat: (data: FdmWaimaoAssistantChatRequest) => chatWithFdmWaimaoAi(data),
      getCompanies: getFdmWaimaoAiCompanies,
      getModels: getFdmWaimaoAiModels,
      idempotencyPrefix: 'fdm-waimao-ai',
      key: 'fdmwaimao',
      launcherTitle: '打开外贸业务 AI 助手',
      permission: 'fdmwaimao:ai:use',
    };
  }
  // Procurement surfaces remain fail closed until each page has a typed, server-side
  // context provider. Reusing browser snapshots here would bypass object authorization.
  return undefined;
});
const resolved = computed(() => {
  if (domain.value?.key === 'fdmproduct') {
    return resolveFdmProductAiSurface(route.path);
  }
  if (domain.value?.key === 'fdmwaimao') {
    return resolveFdmWaimaoAiSurface(route.path, { ...route.query });
  }
  return undefined;
});
const canUseAi = computed(
  () =>
    Boolean(
      resolved.value &&
      domain.value &&
      resolved.value.surface.availability === 'enabled',
    ) &&
    hasAccessByCodes([domain.value!.permission]) &&
    hasAccessByCodes([resolved.value!.queryPermission]),
);
function pageVariant() {
  const page = resolved.value;
  return page && 'variant' in page ? page.variant : undefined;
}
const currentContext = computed(() => {
  const context = registeredContext.value;
  const page = resolved.value;
  if (!context || !page || context.surfaceKey !== page.surface.key)
    return undefined;
  const variant = pageVariant();
  if (context.variant && variant && context.variant !== variant)
    return undefined;
  return context;
});
const businessId = computed(
  () => currentContext.value?.businessId ?? resolved.value?.businessId,
);
const resolvedBusinessId = computed(() => {
  if (businessId.value) return String(businessId.value);
  return resolved.value?.contextMode === 'list' ? 'list' : undefined;
});
const contextCompanyId = computed(() => currentContext.value?.companyId);
const companyId = computed(
  () => selectedCompanyId.value ?? contextCompanyId.value,
);
const entityKey = computed(() => {
  const entity =
    businessId.value ||
    (resolved.value?.contextMode === 'form' ? 'new-draft' : 'list');
  return companyId.value ? `${companyId.value}:${entity}` : entity;
});
const userIdentity = computed(() =>
  String(
    userStore.userInfo?.id ??
      userStore.userInfo?.userId ??
      userStore.userInfo?.username ??
      'unknown',
  ),
);
const surfaceIdentity = computed(
  () => resolved.value?.sessionSurfaceKey ?? 'unknown',
);
const conversationStorageKey = computed(
  () =>
    `${SESSION_STORAGE_PREFIX}:${domain.value?.key ?? 'unknown'}:${encodeURIComponent(userIdentity.value)}:${encodeURIComponent(surfaceIdentity.value)}:${encodeURIComponent(entityKey.value)}`,
);
const enabledModels = computed(() =>
  models.value.filter((model) => {
    const capabilities = model.capabilities.map((item) => item.toUpperCase());
    return model.enabled && capabilities.includes('CHAT');
  }),
);
const modelOptions = computed(() =>
  enabledModels.value.map((model) => ({
    label: `${model.name} · ${model.code}`,
    value: String(model.id),
  })),
);
const companyOptions = computed(() =>
  companies.value.map((company) => ({
    label: company.name,
    value: String(company.id),
  })),
);
const selectedModel = computed(() =>
  enabledModels.value.find(
    (model) => String(model.id) === selectedModelId.value,
  ),
);
const contextLabel = computed(
  () =>
    currentContext.value?.entityLabel ??
    (resolvedBusinessId.value && resolvedBusinessId.value !== 'list'
      ? `业务对象 ${resolvedBusinessId.value}`
      : '当前公司页面数据'),
);
const inputCount = computed(() => input.value.length);
const currentQuestions = computed(() => {
  const page = resolved.value;
  if (!page) return [];
  return domain.value?.key === 'fdmwaimao'
    ? resolvedFdmWaimaoAiQuestions(page)
    : page.surface.questions;
});
const currentDescription = computed(() => {
  const page = resolved.value;
  if (!page) return '';
  return domain.value?.key === 'fdmwaimao'
    ? resolvedFdmWaimaoAiDescription(page)
    : page.surface.description;
});

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.sessionStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function conversationMessages(key: string): ConversationMessage[] {
  return key === conversationStorageKey.value
    ? messages.value
    : readStorage<ConversationMessage[]>(key, []).slice(-MAX_MESSAGES);
}

function persistMessages(key: string, value: ConversationMessage[]) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify(value.slice(-MAX_MESSAGES)),
    );
  } catch {
    // A disabled or full session store must not block the assistant request.
  }
}

function appendMessage(key: string, message: ConversationMessage) {
  const next = [...conversationMessages(key), message].slice(-MAX_MESSAGES);
  persistMessages(key, next);
  if (key === conversationStorageKey.value) messages.value = next;
}

function randomId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function requestHistory(key: string): FdmAiChatHistoryItem[] {
  return conversationMessages(key)
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      content: message.content,
      role: message.role,
    }));
}

function currentConversationIdentity(
  currentDomain: AiDomainConfig,
  pageKey: string,
  currentBusinessId: string,
  currentCompanyId: string,
  modelId: string,
  storageKey = conversationStorageKey.value,
): FdmAiConversationIdentity {
  return {
    businessId: currentBusinessId,
    companyId: currentCompanyId,
    domainKey: currentDomain.key,
    modelId,
    pageKey,
    storageKey,
    viewKey: `${resolved.value?.contextMode ?? 'unknown'}:${route.path}`,
  };
}

function isChatRequestCurrent(
  version: number,
  identity: FdmAiConversationIdentity,
) {
  const currentDomain = domain.value;
  const page = resolved.value;
  const currentBusinessId = resolvedBusinessId.value;
  const currentCompanyId = companyId.value;
  const modelId = selectedModel.value?.id;
  return (
    version === chatRequestVersion &&
    !!currentDomain &&
    !!page &&
    !!currentBusinessId &&
    !!currentCompanyId &&
    !!modelId &&
    isSameFdmAiConversationIdentity(
      identity,
      currentConversationIdentity(
        currentDomain,
        page.pageKey,
        currentBusinessId,
        currentCompanyId,
        String(modelId),
      ),
    )
  );
}

function rememberPendingQuestion(command: FdmAiPendingQuestionCommand) {
  const key = fdmAiPendingQuestionKey(command.identity, command.question);
  pendingQuestionCommands.delete(key);
  pendingQuestionCommands.set(key, command);
  while (pendingQuestionCommands.size > MAX_MESSAGES) {
    const oldestKey = pendingQuestionCommands.keys().next().value;
    if (!oldestKey) break;
    pendingQuestionCommands.delete(oldestKey);
  }
  return key;
}

function requestContext(): Record<string, unknown> {
  const page = resolved.value;
  const context = currentContext.value;
  return {
    contextMode: context?.contextMode ?? page?.contextMode,
    entityLabel: context?.entityLabel,
    pageData: context?.context ?? {},
    readOnly: true,
    routePath: route.path,
    variant: context?.variant ?? pageVariant(),
  };
}

async function scrollToLatest() {
  await nextTick();
  threadRef.value?.scrollTo({
    behavior: 'smooth',
    top: threadRef.value.scrollHeight,
  });
}

async function loadModels() {
  const currentDomain = domain.value;
  const page = resolved.value;
  const currentBusinessId = resolvedBusinessId.value;
  const currentCompanyId = companyId.value;
  if (!currentDomain || !page || !currentBusinessId || !currentCompanyId) {
    modelRequestVersion += 1;
    loadingModels.value = false;
    models.value = [];
    selectedModelId.value = undefined;
    return;
  }
  const version = ++modelRequestVersion;
  loadingModels.value = true;
  modelError.value = '';
  selectedModelId.value = undefined;
  try {
    const result = await currentDomain.getModels({
      businessId: currentBusinessId,
      companyId: currentCompanyId,
      pageKey: page.pageKey,
    });
    if (version !== modelRequestVersion) return;
    models.value = Array.isArray(result) ? result : [];
    // Model choice is intentionally explicit for every page/object session. Never
    // silently choose the first permitted model or restore a stale cross-policy choice.
    selectedModelId.value = undefined;
  } catch (error) {
    if (version !== modelRequestVersion) return;
    models.value = [];
    selectedModelId.value = undefined;
    modelError.value = errorMessage(
      error,
      '当前页面 AI 未开放，或模型策略校验失败。请联系管理员确认页面 AI 配置后重试。',
    );
  } finally {
    if (version === modelRequestVersion) loadingModels.value = false;
  }
}

async function loadCompanies() {
  const currentDomain = domain.value;
  const page = resolved.value;
  const currentBusinessId = resolvedBusinessId.value;
  const version = ++companyRequestVersion;
  modelRequestVersion += 1;
  loadingModels.value = false;
  companies.value = [];
  selectedCompanyId.value = undefined;
  models.value = [];
  selectedModelId.value = undefined;
  companyError.value = '';
  modelError.value = '';

  if (!currentDomain || !page || !currentBusinessId) return;
  if (currentDomain.key === 'fdmproduct') {
    const currentCompanyId = contextCompanyId.value;
    if (currentCompanyId) {
      companies.value = [
        { id: String(currentCompanyId), name: `公司 ${currentCompanyId}` },
      ];
      selectedCompanyId.value = String(currentCompanyId);
    }
    return;
  }

  loadingCompanies.value = true;
  try {
    const result = await currentDomain.getCompanies({
      businessId: currentBusinessId,
      pageKey: page.pageKey,
    });
    if (version !== companyRequestVersion) return;
    companies.value = Array.isArray(result) ? result : [];
    const contextId = contextCompanyId.value
      ? String(contextCompanyId.value)
      : undefined;
    const exactContextCompany = companies.value.find(
      (company) => String(company.id) === contextId,
    );
    // A detail object has exactly one authoritative company. Lists with more than one
    // company require a deliberate selection before the model catalog can be queried.
    const selected =
      exactContextCompany ??
      (companies.value.length === 1 ? companies.value[0] : undefined);
    selectedCompanyId.value = selected ? String(selected.id) : undefined;
  } catch (error) {
    if (version !== companyRequestVersion) return;
    companies.value = [];
    selectedCompanyId.value = undefined;
    companyError.value = errorMessage(
      error,
      '当前页面 AI 未开放，或授权公司校验失败。请联系管理员确认页面 AI 配置后重试。',
    );
  } finally {
    if (version === companyRequestVersion) loadingCompanies.value = false;
  }
}

async function ask(question: string) {
  const page = resolved.value;
  const model = selectedModel.value;
  const currentDomain = domain.value;
  const currentBusinessId = resolvedBusinessId.value;
  const currentCompanyId = companyId.value;
  const normalized = question.trim();
  if (
    !page ||
    !model ||
    !currentDomain ||
    !currentBusinessId ||
    !currentCompanyId ||
    !normalized ||
    sending.value
  )
    return;
  if (normalized.length > MAX_QUESTION_CHARACTERS) {
    chatError.value = `问题不能超过 ${MAX_QUESTION_CHARACTERS} 个字符。`;
    return;
  }

  const storageKey = conversationStorageKey.value;
  const identity = currentConversationIdentity(
    currentDomain,
    page.pageKey,
    currentBusinessId,
    currentCompanyId,
    String(model.id),
    storageKey,
  );
  const pendingKey = fdmAiPendingQuestionKey(identity, normalized);
  let command = pendingQuestionCommands.get(pendingKey);
  if (command) {
    // Move an uncertain command to the newest position without changing its key,
    // history or request body. A timeout retry must be an exact replay.
    rememberPendingQuestion(command);
  } else {
    command = {
      history: requestHistory(storageKey),
      idempotencyKey: randomId(currentDomain.idempotencyPrefix),
      identity,
      pageTitle:
        currentDomain.key === 'fdmproduct' ? page.pageTitle : undefined,
      productContext:
        currentDomain.key === 'fdmproduct' ? requestContext() : undefined,
      question: normalized,
      userMessageId: randomId('user'),
    };
    rememberPendingQuestion(command);
    appendMessage(storageKey, {
      content: normalized,
      createdAt: Date.now(),
      id: command.userMessageId,
      role: 'user',
    });
  }
  input.value = '';
  chatError.value = '';
  const requestVersion = ++chatRequestVersion;
  sending.value = true;
  await scrollToLatest();

  try {
    const result =
      currentDomain.key === 'fdmwaimao'
        ? await currentDomain.chat({
            businessId: command.identity.businessId,
            companyId: command.identity.companyId,
            history: command.history,
            idempotencyKey: command.idempotencyKey,
            modelId: command.identity.modelId,
            pageKey: command.identity.pageKey,
            question: command.question,
          })
        : await currentDomain.chat({
            businessId: command.identity.businessId,
            companyId: command.identity.companyId,
            context: command.productContext,
            history: command.history,
            idempotencyKey: command.idempotencyKey,
            modelId: command.identity.modelId,
            pageKey: command.identity.pageKey,
            pageTitle: command.pageTitle!,
            question: command.question,
          });
    const answer = result.answer?.trim();
    if (!answer) throw new Error('AI 未返回有效回答，请更换模型后重试。');
    pendingQuestionCommands.delete(pendingKey);
    if (!isChatRequestCurrent(requestVersion, command.identity)) return;
    appendMessage(command.identity.storageKey, {
      content: answer,
      createdAt: result.generatedAt ?? Date.now(),
      id: result.invocationId || randomId('assistant'),
      invocationId: result.invocationId,
      modelName: result.modelName || model.name,
      role: 'assistant',
    });
  } catch (error) {
    if (!isChatRequestCurrent(requestVersion, command.identity)) return;
    chatError.value = errorMessage(error, 'AI 服务暂时不可用，请稍后重试。');
  } finally {
    if (isChatRequestCurrent(requestVersion, command.identity)) {
      sending.value = false;
      await scrollToLatest();
    }
  }
}

function askCommonQuestion(prompt: string) {
  void ask(prompt);
}

function clearConversation() {
  const storageKey = conversationStorageKey.value;
  chatRequestVersion += 1;
  sending.value = false;
  for (const [key, command] of pendingQuestionCommands) {
    if (command.identity.storageKey === storageKey) {
      pendingQuestionCommands.delete(key);
    }
  }
  messages.value = [];
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore unavailable session storage.
  }
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
  event.preventDefault();
  void ask(input.value);
}

function formatGeneratedAt(value: number | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

watch(
  conversationStorageKey,
  (key, previousKey) => {
    if (previousKey && previousKey !== key) {
      chatRequestVersion += 1;
      sending.value = false;
    }
    messages.value = readStorage<ConversationMessage[]>(key, []).slice(
      -MAX_MESSAGES,
    );
    chatError.value = '';
  },
  { immediate: true },
);

watch(
  () => `${resolved.value?.contextMode ?? 'unknown'}:${route.path}`,
  (viewKey, previousViewKey) => {
    if (!previousViewKey || previousViewKey === viewKey) return;
    chatRequestVersion += 1;
    sending.value = false;
  },
);

watch(
  () =>
    canUseAi.value
      ? `${userIdentity.value}:${surfaceIdentity.value}:${resolvedBusinessId.value ?? 'missing'}`
      : '',
  (identity) => {
    if (!identity) {
      chatRequestVersion += 1;
      sending.value = false;
      open.value = false;
      return;
    }
    void loadCompanies();
  },
  { immediate: true },
);

watch(selectedCompanyId, (next, previous) => {
  if (!next || next === previous) return;
  void loadModels();
});
</script>

<template>
  <Tooltip v-if="canUseAi" placement="left" :title="domain?.launcherTitle">
    <Button
      :aria-label="domain?.launcherTitle"
      class="fdm-waimao-ai-launcher"
      type="primary"
      @click="open = true"
    >
      <IconifyIcon icon="lucide:bot" :width="22" />
      <span>AI 助手</span>
    </Button>
  </Tooltip>

  <Drawer
    v-if="canUseAi && resolved"
    :body-style="{ padding: 0 }"
    :open="open"
    placement="right"
    root-class-name="fdm-waimao-ai-drawer"
    width="min(520px, 100vw)"
    @update:open="open = $event"
  >
    <template #title>
      <div class="fdm-waimao-ai-title">
        <span class="fdm-waimao-ai-title__icon">
          <IconifyIcon icon="lucide:sparkles" :width="18" />
        </span>
        <span>
          <strong>{{ resolved.surface.title }}</strong>
          <small>{{ resolved.pageTitle }} · {{ contextLabel }}</small>
        </span>
      </div>
    </template>

    <template #extra>
      <Button
        v-if="messages.length"
        size="small"
        type="link"
        @click="clearConversation"
      >
        清空本对象会话
      </Button>
    </template>

    <div class="fdm-waimao-ai-body">
      <section class="fdm-waimao-ai-context">
        <div>
          <Tag color="green">真实 AI</Tag>
          <Tag>只读分析</Tag>
        </div>
        <p>{{ currentDescription }}</p>
        <small>{{ resolved.surface.readOnlyNotice }}</small>
      </section>

      <Alert
        v-if="!resolvedBusinessId"
        description="新建表单尚未形成服务端业务对象，AI 不能把浏览器草稿当作权威事实。请先保存草稿，再从详情页使用 AI。"
        message="请先保存当前业务单据"
        show-icon
        type="warning"
      />

      <Alert
        v-if="companyError"
        closable
        :message="companyError"
        show-icon
        type="error"
        @close="companyError = ''"
      >
        <template #action>
          <Button size="small" @click="loadCompanies">重试</Button>
        </template>
      </Alert>

      <section v-if="domain?.key === 'fdmwaimao'" class="fdm-waimao-ai-model">
        <label for="fdm-waimao-ai-company-select">分析公司</label>
        <Select
          id="fdm-waimao-ai-company-select"
          v-model:value="selectedCompanyId"
          :disabled="loadingCompanies || sending || !resolvedBusinessId"
          :loading="loadingCompanies"
          :options="companyOptions"
          placeholder="请选择当前页面要分析的授权公司"
        />
      </section>

      <Alert
        v-if="
          domain?.key === 'fdmwaimao' &&
          resolvedBusinessId &&
          !loadingCompanies &&
          !companyError &&
          companies.length === 0
        "
        description="当前业务对象或页面没有可供你使用 AI 的授权公司。"
        message="没有可用公司"
        show-icon
        type="warning"
      />

      <Alert
        v-if="modelError"
        closable
        :message="modelError"
        show-icon
        type="error"
        @close="modelError = ''"
      >
        <template #action>
          <Button size="small" @click="loadModels">重试</Button>
        </template>
      </Alert>

      <section class="fdm-waimao-ai-model">
        <label for="fdm-waimao-ai-model-select">分析模型</label>
        <Select
          id="fdm-waimao-ai-model-select"
          v-model:value="selectedModelId"
          :disabled="
            loadingModels || sending || !companyId || !resolvedBusinessId
          "
          :loading="loadingModels"
          :options="modelOptions"
          placeholder="请选择可用的对话模型"
        />
      </section>

      <Alert
        v-if="
          companyId &&
          resolvedBusinessId &&
          !loadingModels &&
          !modelError &&
          enabledModels.length === 0
        "
        description="请管理员在外贸 AI 配置中启用至少一个具备 CHAT 能力的模型。"
        message="当前没有可用模型"
        show-icon
        type="warning"
      />

      <section class="fdm-waimao-ai-questions" aria-label="常见问题">
        <div class="fdm-waimao-ai-section-title">
          <strong>本页常见问题</strong>
          <small>回答只基于服务端重新读取且你有权查看的业务事实</small>
        </div>
        <div>
          <Button
            v-for="question in currentQuestions"
            :key="question.id"
            :disabled="
              sending || !selectedModel || !companyId || !resolvedBusinessId
            "
            size="small"
            @click="askCommonQuestion(question.prompt)"
          >
            {{ question.label }}
          </Button>
        </div>
      </section>

      <Alert
        v-if="chatError"
        closable
        :message="chatError"
        show-icon
        type="error"
        @close="chatError = ''"
      />

      <section ref="threadRef" class="fdm-waimao-ai-thread" aria-live="polite">
        <div class="fdm-waimao-ai-message fdm-waimao-ai-message--assistant">
          <span class="fdm-waimao-ai-avatar">AI</span>
          <article>
            <p>
              你好，我会让服务端重新读取当前对象中你有权查看的数据后回答问题。
            </p>
            <small>
              高风险业务动作只提供说明和建议，仍需在原业务页面人工确认。
            </small>
          </article>
        </div>

        <div
          v-for="item in messages"
          :key="item.id"
          class="fdm-waimao-ai-message"
          :class="`fdm-waimao-ai-message--${item.role}`"
        >
          <span class="fdm-waimao-ai-avatar">{{
            item.role === 'user' ? '你' : 'AI'
          }}</span>
          <article>
            <p>{{ item.content }}</p>
            <footer>
              <span v-if="item.modelName">{{ item.modelName }}</span>
              <span v-if="item.invocationId">调用 {{ item.invocationId }}</span>
              <time>{{ formatGeneratedAt(item.createdAt) }}</time>
            </footer>
          </article>
        </div>

        <div
          v-if="sending"
          class="fdm-waimao-ai-message fdm-waimao-ai-message--assistant"
        >
          <span class="fdm-waimao-ai-avatar">AI</span>
          <article class="fdm-waimao-ai-loading">
            <Spin size="small" />
            <span>正在核对当前页面数据并调用模型…</span>
          </article>
        </div>

        <Empty
          v-if="messages.length === 0 && !sending"
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          description="可点击常见问题，或在下方输入业务问题"
        />
      </section>
    </div>

    <template #footer>
      <div class="fdm-waimao-ai-composer">
        <Textarea
          v-model:value="input"
          :auto-size="{ minRows: 2, maxRows: 5 }"
          :disabled="
            sending || !selectedModel || !companyId || !resolvedBusinessId
          "
          :maxlength="MAX_QUESTION_CHARACTERS"
          placeholder="输入当前页面的业务问题；Ctrl / ⌘ + Enter 发送"
          @keydown="handleComposerKeydown"
        />
        <div>
          <span>{{ inputCount }} / {{ MAX_QUESTION_CHARACTERS }}</span>
          <Button
            :disabled="
              !input.trim() ||
              !selectedModel ||
              !companyId ||
              !resolvedBusinessId
            "
            :loading="sending"
            type="primary"
            @click="ask(input)"
          >
            <template #icon><IconifyIcon icon="lucide:send" /></template>
            发送
          </Button>
        </div>
      </div>
    </template>
  </Drawer>
</template>

<style scoped>
.fdm-waimao-ai-launcher {
  position: fixed;
  right: 24px;
  bottom: 88px;
  z-index: 950;
  display: inline-flex;
  gap: 7px;
  align-items: center;
  width: auto;
  height: 48px;
  padding-inline: 16px;
  border-radius: 999px;
  box-shadow: 0 12px 30px rgb(22 119 255 / 30%);
}

.fdm-waimao-ai-title,
.fdm-waimao-ai-title > span:last-child {
  display: flex;
  gap: 10px;
  align-items: center;
}

.fdm-waimao-ai-title > span:last-child {
  display: grid;
  gap: 1px;
  align-items: initial;
}

.fdm-waimao-ai-title small,
.fdm-waimao-ai-context small,
.fdm-waimao-ai-section-title small,
.fdm-waimao-ai-message footer,
.fdm-waimao-ai-composer > div > span {
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.fdm-waimao-ai-title__icon,
.fdm-waimao-ai-avatar {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: var(--ant-color-primary);
  background: var(--ant-color-primary-bg);
  border: 1px solid var(--ant-color-primary-border);
}

.fdm-waimao-ai-title__icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
}

.fdm-waimao-ai-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  padding: 14px;
}

.fdm-waimao-ai-context,
.fdm-waimao-ai-model,
.fdm-waimao-ai-questions {
  padding: 12px;
  background: var(--ant-color-fill-alter);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 10px;
}

.fdm-waimao-ai-context p {
  margin: 8px 0 3px;
}

.fdm-waimao-ai-model {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}

.fdm-waimao-ai-model label {
  font-weight: 600;
}

.fdm-waimao-ai-section-title {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 9px;
}

.fdm-waimao-ai-questions > div:last-child {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.fdm-waimao-ai-thread {
  flex: 1 1 240px;
  min-height: 200px;
  padding: 2px 2px 18px;
  overflow-y: auto;
}

.fdm-waimao-ai-message {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  margin-bottom: 13px;
}

.fdm-waimao-ai-message--user {
  flex-direction: row-reverse;
}

.fdm-waimao-ai-avatar {
  width: 30px;
  height: 30px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 50%;
}

.fdm-waimao-ai-message--user .fdm-waimao-ai-avatar {
  color: var(--ant-color-success);
  background: var(--ant-color-success-bg);
  border-color: var(--ant-color-success-border);
}

.fdm-waimao-ai-message article {
  max-width: calc(100% - 50px);
  padding: 10px 12px;
  background: var(--ant-color-fill-alter);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 4px 12px 12px;
}

.fdm-waimao-ai-message--user article {
  color: var(--ant-color-text-light-solid);
  background: var(--ant-color-primary);
  border-color: var(--ant-color-primary);
  border-radius: 12px 4px 12px 12px;
}

.fdm-waimao-ai-message p {
  margin: 0;
  line-height: 1.75;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.fdm-waimao-ai-message small {
  display: block;
  margin-top: 6px;
  color: var(--ant-color-text-secondary);
}

.fdm-waimao-ai-message footer {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 6px;
}

.fdm-waimao-ai-message--user footer {
  color: rgb(255 255 255 / 72%);
}

.fdm-waimao-ai-loading {
  display: flex;
  gap: 8px;
  align-items: center;
}

.fdm-waimao-ai-composer {
  display: grid;
  gap: 8px;
}

.fdm-waimao-ai-composer > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

@media (max-width: 767px) {
  .fdm-waimao-ai-launcher {
    right: 16px;
    bottom: 72px;
    width: 48px;
    padding-inline: 0;
    border-radius: 50%;
  }

  .fdm-waimao-ai-launcher span {
    display: none;
  }

  .fdm-waimao-ai-section-title {
    display: grid;
    gap: 2px;
  }
}
</style>
