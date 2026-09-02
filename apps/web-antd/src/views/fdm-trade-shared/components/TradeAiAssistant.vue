<script setup lang="ts">
import type {
  TradeAiPageKey,
  TradeAiResponse,
  TradeAiSelectedDocument,
} from '../ai-assistant';
import type { PrototypeDocumentType } from '../document-routing';

import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Drawer,
  Empty,
  message,
  Spin,
  Tag,
  Textarea,
} from 'ant-design-vue';

import { analyzeTradeAssistant, getTradeAiPageProfile } from '../ai-assistant';
import { documentDrawerLocation } from '../document-routing';
import { useTradePrototypeStore } from '../domain/store';

import './trade-ai-assistant.css';

defineOptions({ name: 'FdmTradeAiAssistant' });

const props = defineProps<{
  activeTab?: string;
  open: boolean;
  pageKey: TradeAiPageKey;
  selectedDocument?: TradeAiSelectedDocument;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
}>();

interface TradeAiConversationMessage {
  id: string;
  query?: string;
  response?: TradeAiResponse;
  role: 'assistant' | 'user';
}

type StoredConversations = Partial<
  Record<TradeAiPageKey, TradeAiConversationMessage[]>
>;

const AI_CONVERSATION_STORAGE_KEY = 'fdm:foreign-trade-ai-assistant:v1';
const router = useRouter();
const store = useTradePrototypeStore();
const input = ref('');
const analyzing = ref(false);
const threadRef = ref<HTMLElement>();
const triggerElement = ref<HTMLElement>();
const conversations = ref<StoredConversations>(readConversations());

const profile = computed(() => getTradeAiPageProfile(props.pageKey));
const messages = computed(() => conversations.value[props.pageKey] ?? []);
const currentContextLabel = computed(
  () => props.selectedDocument?.label ?? props.selectedDocument?.id,
);
const contextMode = computed(() =>
  props.selectedDocument ? '当前单据' : '当前页面',
);

function readConversations(): StoredConversations {
  if (typeof window === 'undefined') return {};
  try {
    const stored = window.sessionStorage.getItem(AI_CONVERSATION_STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored) as StoredConversations;
  } catch {
    return {};
  }
}

function persistConversations() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      AI_CONVERSATION_STORAGE_KEY,
      JSON.stringify(conversations.value),
    );
  } catch {
    // A disabled session store should not block the business prototype.
  }
}

function appendMessage(item: TradeAiConversationMessage) {
  const pageMessages = [...messages.value, item].slice(-24);
  conversations.value = {
    ...conversations.value,
    [props.pageKey]: pageMessages,
  };
  persistConversations();
}

async function scrollToLatest() {
  await nextTick();
  threadRef.value?.scrollTo({
    behavior: 'smooth',
    top: threadRef.value.scrollHeight,
  });
}

async function ask(question: string, questionId?: string) {
  const query = question.trim();
  if (!query || analyzing.value) return;

  appendMessage({
    id: `user-${Date.now()}`,
    query,
    role: 'user',
  });
  input.value = '';
  analyzing.value = true;
  await scrollToLatest();

  try {
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    const response = analyzeTradeAssistant(store.state, {
      activeTab: props.activeTab,
      pageKey: props.pageKey,
      query,
      questionId,
      selectedDocument: props.selectedDocument,
    });
    appendMessage({
      id: response.id,
      response,
      role: 'assistant',
    });
  } catch (error) {
    message.error(
      `AI 分析暂时不可用：${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    analyzing.value = false;
    await scrollToLatest();
  }
}

function askCommonQuestion(questionId: string) {
  const question = profile.value.questions.find(
    (item) => item.id === questionId,
  );
  if (question) void ask(question.prompt, question.id);
}

function clearConversation() {
  conversations.value = Object.fromEntries(
    Object.entries(conversations.value).filter(
      ([key]) => key !== props.pageKey,
    ),
  ) as StoredConversations;
  persistConversations();
}

async function navigateTo(
  route?: string,
  documentType?: PrototypeDocumentType,
  documentId?: string,
) {
  if (route) {
    emit('update:open', false);
    await router.push(route);
    return;
  }
  if (documentType && documentId) {
    emit('update:open', false);
    await router.push(documentDrawerLocation(documentType, documentId));
  }
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
  event.preventDefault();
  void ask(input.value);
}

function handleAfterOpenChange(open: boolean) {
  if (open) {
    void scrollToLatest();
    return;
  }
  if (triggerElement.value?.isConnected) triggerElement.value.focus();
}

function toneColor(tone?: TradeAiResponse['tone']) {
  if (tone === 'danger') return 'red';
  if (tone === 'success') return 'green';
  if (tone === 'warning') return 'orange';
  return 'blue';
}

function priorityLabel(priority: 'HIGH' | 'LOW' | 'MEDIUM') {
  if (priority === 'HIGH') return '优先';
  if (priority === 'MEDIUM') return '建议';
  return '关注';
}

function priorityColor(priority: 'HIGH' | 'LOW' | 'MEDIUM') {
  if (priority === 'HIGH') return 'red';
  if (priority === 'MEDIUM') return 'orange';
  return 'blue';
}

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      triggerElement.value =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : undefined;
    }
  },
);
</script>

<template>
  <Drawer
    :body-style="{ padding: 0 }"
    :open="open"
    placement="right"
    root-class-name="fdm-trade-ai-drawer"
    :width="520"
    @after-open-change="handleAfterOpenChange"
    @update:open="emit('update:open', $event)"
  >
    <template #title>
      <div class="fdm-trade-ai-drawer__title">
        <strong>飞德慕业务 AI 助手</strong>
        <span>可读 · 可理解 · 可建议 · 可约束 · 可追溯</span>
      </div>
    </template>

    <template #extra>
      <Button
        v-if="messages.length > 0"
        size="small"
        type="link"
        @click="clearConversation"
      >
        清空本页会话
      </Button>
    </template>

    <div class="fdm-trade-ai-drawer__body">
      <section class="fdm-trade-ai-drawer__context" aria-label="AI 分析上下文">
        <div class="fdm-trade-ai-drawer__avatar" aria-hidden="true">AI</div>
        <div class="fdm-trade-ai-drawer__context-copy">
          <strong>当前继承：{{ profile.role }}</strong>
          <span>{{ profile.department }} · {{ profile.scope }}</span>
          <small v-if="currentContextLabel">
            {{ contextMode }}：{{ currentContextLabel }}
          </small>
        </div>
        <Tag color="blue">原型分析</Tag>
      </section>

      <section class="fdm-trade-ai-drawer__questions" aria-label="本页常见问题">
        <div class="fdm-trade-ai-drawer__section-heading">
          <span>本页常见问题</span>
          <small>{{ profile.title }}</small>
        </div>
        <div class="fdm-trade-ai-drawer__question-list">
          <Button
            v-for="question in profile.questions"
            :key="question.id"
            :disabled="analyzing"
            size="small"
            @click="askCommonQuestion(question.id)"
          >
            {{ question.label }}
          </Button>
        </div>
      </section>

      <div
        ref="threadRef"
        class="fdm-trade-ai-drawer__thread"
        aria-live="polite"
      >
        <div class="fdm-trade-ai-message fdm-trade-ai-message--assistant">
          <div class="fdm-trade-ai-message__avatar" aria-hidden="true">AI</div>
          <div class="fdm-trade-ai-message__bubble">
            <p>{{ profile.greeting }}</p>
            <small>
              我只读取当前浏览器会话中的模拟数据；不会直接提交采购、修改库存、核销回款或确认付款。
            </small>
          </div>
        </div>

        <template v-for="item in messages" :key="item.id">
          <div
            v-if="item.role === 'user'"
            class="fdm-trade-ai-message fdm-trade-ai-message--user"
          >
            <div class="fdm-trade-ai-message__avatar" aria-hidden="true">
              你
            </div>
            <div class="fdm-trade-ai-message__bubble">
              <p>{{ item.query }}</p>
            </div>
          </div>

          <div
            v-else-if="item.response"
            class="fdm-trade-ai-message fdm-trade-ai-message--assistant"
          >
            <div class="fdm-trade-ai-message__avatar" aria-hidden="true">
              AI
            </div>
            <article class="fdm-trade-ai-response">
              <header class="fdm-trade-ai-response__header">
                <div>
                  <Tag :color="toneColor(item.response.tone)">
                    {{ item.response.title }}
                  </Tag>
                  <time>{{
                    formatGeneratedAt(item.response.generatedAt)
                  }}</time>
                </div>
                <p>{{ item.response.summary }}</p>
              </header>

              <Alert
                v-if="item.response.guardrail"
                class="fdm-trade-ai-response__guardrail"
                show-icon
                :type="
                  item.response.guardrail.mode === 'BLOCKED'
                    ? 'error'
                    : 'warning'
                "
              >
                <template #message>
                  <strong>{{ item.response.guardrail.title }}</strong>
                </template>
                <template #description>
                  <p>{{ item.response.guardrail.reason }}</p>
                  <p v-if="item.response.guardrail.prohibitedAction">
                    <strong>已阻止：</strong>
                    {{ item.response.guardrail.prohibitedAction }}
                  </p>
                  <p>
                    <strong>安全下一步：</strong>
                    {{ item.response.guardrail.allowedNextStep }}
                  </p>
                </template>
              </Alert>

              <section
                v-if="item.response.evidence.length > 0"
                class="fdm-trade-ai-response__section"
              >
                <h4>分析依据</h4>
                <div class="fdm-trade-ai-response__evidence-list">
                  <button
                    v-for="evidence in item.response.evidence"
                    :key="`${item.response.id}-${evidence.label}-${evidence.value}`"
                    :class="{
                      'is-clickable':
                        evidence.route ||
                        (evidence.documentType && evidence.documentId),
                    }"
                    :data-tone="evidence.tone"
                    :disabled="
                      !evidence.route &&
                      !(evidence.documentType && evidence.documentId)
                    "
                    type="button"
                    @click="
                      navigateTo(
                        evidence.route,
                        evidence.documentType,
                        evidence.documentId,
                      )
                    "
                  >
                    <span>
                      <small>{{ evidence.label }}</small>
                      <strong>{{ evidence.value }}</strong>
                      <em v-if="evidence.detail">{{ evidence.detail }}</em>
                    </span>
                    <IconifyIcon
                      v-if="
                        evidence.route ||
                        (evidence.documentType && evidence.documentId)
                      "
                      icon="lucide:arrow-up-right"
                    />
                  </button>
                </div>
              </section>

              <section
                v-if="item.response.recommendations.length > 0"
                class="fdm-trade-ai-response__section"
              >
                <h4>建议下一步</h4>
                <div class="fdm-trade-ai-response__recommendations">
                  <div
                    v-for="recommendation in item.response.recommendations"
                    :key="`${item.response.id}-${recommendation.title}`"
                  >
                    <Tag :color="priorityColor(recommendation.priority)">
                      {{ priorityLabel(recommendation.priority) }}
                    </Tag>
                    <span>
                      <strong>{{ recommendation.title }}</strong>
                      <small>{{ recommendation.description }}</small>
                    </span>
                    <Button
                      v-if="
                        recommendation.route ||
                        (recommendation.documentType &&
                          recommendation.documentId)
                      "
                      size="small"
                      type="link"
                      @click="
                        navigateTo(
                          recommendation.route,
                          recommendation.documentType,
                          recommendation.documentId,
                        )
                      "
                    >
                      打开
                    </Button>
                  </div>
                </div>
              </section>

              <footer>{{ item.response.dataScopeNotice }}</footer>
            </article>
          </div>
        </template>

        <div
          v-if="analyzing"
          class="fdm-trade-ai-message fdm-trade-ai-message--assistant"
        >
          <div class="fdm-trade-ai-message__avatar" aria-hidden="true">AI</div>
          <div
            class="fdm-trade-ai-message__bubble fdm-trade-ai-message__bubble--loading"
          >
            <Spin size="small" />
            <span>正在核对当前页面数据、单据关系和业务约束…</span>
          </div>
        </div>

        <Empty
          v-if="messages.length === 0 && !analyzing"
          class="fdm-trade-ai-drawer__empty"
          description="可点击上方常见问题开始分析"
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
        />
      </div>
    </div>

    <template #footer>
      <div class="fdm-trade-ai-composer">
        <Textarea
          v-model:value="input"
          :auto-size="{ minRows: 2, maxRows: 5 }"
          :disabled="analyzing"
          placeholder="输入业务问题或操作指令，例如：查风险、这张单据下一步做什么"
          @keydown="handleComposerKeydown"
        />
        <div class="fdm-trade-ai-composer__actions">
          <span>Ctrl / ⌘ + Enter 发送；高风险动作会先给出约束卡片</span>
          <Button
            :disabled="!input.trim()"
            :loading="analyzing"
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
