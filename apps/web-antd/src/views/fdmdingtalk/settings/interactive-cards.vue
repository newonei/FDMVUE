<script setup lang="ts">
import type { FormInstance, TableColumnsType } from 'ant-design-vue';

import type { DingTalkInteractiveCardApi } from '#/api/fdmdingtalk/interactive-card';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { useMediaQuery } from '@vueuse/core';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  getDingTalkInteractiveCard,
  getDingTalkInteractiveCardSettings,
  getRecentDingTalkInteractiveCards,
  saveDingTalkInteractiveCardSettings,
  sendDingTalkInteractiveCard,
} from '#/api/fdmdingtalk/interactive-card';
import { getSimpleUserList } from '#/api/system/user';
import { formatDingTalkCardTime } from '#/utils/dingtalk-card-time';

import {
  buildInteractiveCardSendAttempt,
  cardRecipientOptions,
  cardSendBlockReason,
  cardStatusLabel,
  cloudUpdateStatusLabel,
} from './interactive-card-model';

const props = defineProps<{
  appDirty: boolean;
  appEnabled: boolean;
  platformUrl: string;
}>();
const emit = defineEmits<{ settingsUpdated: [] }>();

const { hasAccessByCodes } = useAccess();
const compactDetails = useMediaQuery('(max-width: 767px)');
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmdingtalk:settings:update']),
);
const canTest = computed(() =>
  hasAccessByCodes(['fdmdingtalk:settings:test']),
);
const settings = ref<DingTalkInteractiveCardApi.Settings>();
const cardForm = reactive({ enabled: false, templateId: '' });
const loading = ref(false);
const saving = ref(false);
const pageError = ref('');
const cardDirty = computed(
  () =>
    !!settings.value &&
    (cardForm.enabled !== settings.value.enabled ||
      cardForm.templateId.trim() !== settings.value.templateId),
);
const blockReason = computed(() =>
  cardSendBlockReason(
    settings.value,
    props.appEnabled,
    props.appDirty,
    cardDirty.value,
  ),
);
const sendFormRef = ref<FormInstance>();
const sendForm = reactive({
  systemUserId: undefined as number | undefined,
  title: '钉钉互动卡片接入测试',
  content: '这是一条互动卡片测试通知。请点击“我已知晓”，系统将记录确认并更新当前卡片。',
});
const recipients = ref<ReturnType<typeof cardRecipientOptions>>([]);
const loadingRecipients = ref(false);
const recipientsError = ref('');
const sending = ref(false);
const confirming = ref(false);
const attempt = ref<DingTalkInteractiveCardApi.SendParams>();
const instances = ref<DingTalkInteractiveCardApi.Instance[]>([]);
const refreshing = ref(false);
const historyError = ref('');
const selected = ref<DingTalkInteractiveCardApi.Instance>();
const refreshingInstance = ref(false);

const columns: TableColumnsType<DingTalkInteractiveCardApi.Instance> = [
  { title: '标题 / 收件人', key: 'recipient' },
  { title: '卡片状态', key: 'status' },
  { title: '确认回调时间', dataIndex: 'acknowledgedAt', key: 'acknowledgedAt' },
  { title: '创建时间', dataIndex: 'createTime', key: 'createTime' },
  { title: '操作', key: 'action', width: 100 },
];

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function recipientLabel(id: number) {
  return recipients.value.find((item) => item.value === id)?.label || `系统用户 #${id}`;
}

async function loadSettings() {
  loading.value = true;
  pageError.value = '';
  try {
    const value = await getDingTalkInteractiveCardSettings();
    settings.value = value;
    Object.assign(cardForm, { enabled: value.enabled, templateId: value.templateId || '' });
  } catch (error) {
    pageError.value = errorText(error, '读取互动卡片配置失败');
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  if (!canUpdate.value || props.appDirty) return;
  const templateId = cardForm.templateId.trim();
  if (cardForm.enabled && !templateId) {
    message.warning('启用互动卡片前，请填写已发布的模板 ID');
    return;
  }
  saving.value = true;
  try {
    await saveDingTalkInteractiveCardSettings({ enabled: cardForm.enabled, templateId });
    message.success('互动卡片配置已保存');
    await loadSettings();
    emit('settingsUpdated');
  } finally {
    saving.value = false;
  }
}

function refreshCardSettings() {
  if (!cardDirty.value) {
    void loadSettings();
    return;
  }
  Modal.confirm({
    title: '重新读取已保存的卡片配置？',
    content: '当前尚未保存的模板和启用状态修改将被清除。',
    okText: '重新读取',
    cancelText: '继续编辑',
    onOk: loadSettings,
  });
}

async function loadRecipients() {
  if (!canTest.value) return;
  loadingRecipients.value = true;
  recipientsError.value = '';
  try {
    recipients.value = cardRecipientOptions(await getSimpleUserList());
    if (!recipients.value.some((item) => item.value === sendForm.systemUserId)) {
      sendForm.systemUserId = undefined;
    }
  } catch (error) {
    recipients.value = [];
    sendForm.systemUserId = undefined;
    recipientsError.value = errorText(error, '读取系统用户失败，请重试');
  } finally {
    loadingRecipients.value = false;
  }
}

async function loadInstances() {
  refreshing.value = true;
  historyError.value = '';
  try {
    instances.value = await getRecentDingTalkInteractiveCards();
    if (selected.value) {
      selected.value = instances.value.find((item) => item.id === selected.value?.id) || selected.value;
    }
  } catch (error) {
    historyError.value = errorText(error, '读取卡片记录失败');
  } finally {
    refreshing.value = false;
  }
}

async function refreshInstance(id: number) {
  refreshingInstance.value = true;
  try {
    selected.value = await getDingTalkInteractiveCard(id);
    const index = instances.value.findIndex((item) => item.id === id);
    if (index >= 0) instances.value[index] = selected.value;
  } finally {
    refreshingInstance.value = false;
  }
}

async function confirmSend() {
  if (!canTest.value || sending.value || confirming.value) return;
  if (blockReason.value) {
    message.warning(blockReason.value);
    return;
  }
  try {
    await sendFormRef.value?.validate();
    if (!recipients.value.some((item) => item.value === sendForm.systemUserId)) {
      throw new Error('请从已加载的系统用户中选择一位收件人');
    }
    attempt.value = buildInteractiveCardSendAttempt(sendForm, attempt.value, () => crypto.randomUUID());
  } catch (error) {
    if (error instanceof Error) message.warning(error.message);
    return;
  }
  const payload = { ...attempt.value };
  confirming.value = true;
  Modal.confirm({
    title: `发送互动卡片给 ${recipientLabel(payload.systemUserId)}？`,
    content: '将向这一个系统账号绑定的钉钉用户发送真实通知，位置为应用机器人单聊。点击“我已知晓”会回传确认并更新原卡片。',
    okText: '发送给此用户',
    cancelText: '取消',
    onCancel: () => { confirming.value = false; },
    onOk: async () => {
      if (sending.value) return;
      sending.value = true;
      try {
        selected.value = await sendDingTalkInteractiveCard(payload);
        if (!['SENDING', 'UNKNOWN'].includes(selected.value.status)) {
          attempt.value = undefined;
        }
        if (selected.value.status === 'FAILED') message.error('发送失败，请查看记录中的错误');
        else if (selected.value.status === 'UNKNOWN') message.warning('投放结果待核实，请先查询此记录，避免重复通知');
        else message.success('请求已处理，请在钉钉客户端核对卡片并测试确认');
        await loadInstances();
      } finally {
        sending.value = false;
        confirming.value = false;
      }
    },
  });
}

onMounted(async () => {
  await Promise.allSettled([loadSettings(), loadRecipients(), loadInstances()]);
});
</script>

<template>
  <div class="interactive-cards">
    <div class="section-heading">
      <h2>机器人通知与卡片内确认 <Tag color="blue">应用机器人单聊</Tag></h2>
      <p>用户可直接在钉钉卡片内点击“我已知晓”；详情按钮进入系统中仅本人可见的通知内容。</p>
    </div>
    <Alert v-if="pageError" class="mb-4" type="error" show-icon :message="pageError">
      <template #description><Button size="small" @click="loadSettings">重新读取</Button></template>
    </Alert>
    <Spin :spinning="loading">
      <template v-if="settings">
        <Card size="small" title="卡片模板配置">
          <template #extra>
            <Button size="small" :disabled="saving" @click="refreshCardSettings">刷新卡片配置</Button>
          </template>
          <Form layout="vertical" :disabled="!canUpdate || saving">
            <div class="config-grid">
              <Form.Item label="已发布模板 ID" extra="从钉钉卡片平台复制模板 ID；填写草稿模板不会自动发布。">
                <Input v-model:value="cardForm.templateId" :maxlength="128" placeholder="填写已发布的互动卡片模板 ID" />
              </Form.Item>
              <Form.Item label="互动卡片状态">
                <Space><Switch v-model:checked="cardForm.enabled" /><span>{{ cardForm.enabled ? '启用通知与确认' : '停用发送' }}</span></Space>
              </Form.Item>
            </div>
          </Form>
          <Space wrap>
            <Button v-access:code="['fdmdingtalk:settings:update']" type="primary" :disabled="!cardDirty || appDirty" :loading="saving" @click="saveSettings">保存卡片配置</Button>
            <span v-if="appDirty" class="pending-note">请先保存应用连接中的修改。</span>
            <span v-else-if="cardDirty" class="pending-note">卡片配置尚未保存。</span>
          </Space>
          <Descriptions class="mt-4" size="small" :column="{ xs: 1, md: 2 }">
            <Descriptions.Item label="企业 CorpId">{{ settings.corpId || '未配置' }}</Descriptions.Item>
            <Descriptions.Item label="机器人 RobotCode">{{ settings.robotCode || '未配置' }}</Descriptions.Item>
            <Descriptions.Item label="卡片回调通道"><Tag :color="settings.streamRunning ? 'green' : 'default'">{{ settings.streamRunning ? 'Stream 运行中' : settings.streamEnabled ? 'Stream 未连接' : 'Stream 未启用' }}</Tag></Descriptions.Item>
          </Descriptions>
        </Card>
        <Alert class="mt-4" type="info" show-icon message="开放平台仍需配置模板、权限与回调">
          <template #description>
            <ol class="platform-steps">
              <li>发布模板，声明参数 <code>title</code>、<code>content</code>、<code>status</code>、<code>acknowledgedAt</code>、<code>buttonText</code>、<code>detailUrl</code>。</li>
              <li>“我已知晓”按钮使用服务端回调，传入 <code>action=acknowledge</code>；详情按钮打开 <code>detailUrl</code>。</li>
              <li>为当前应用开通卡片创建、投放、更新权限，并启用应用机器人。启用本页卡片配置后，系统自动连接 Stream 卡片回调，不会自动开启通讯录事件订阅。</li>
            </ol>
            <p>本场景投放在应用机器人单聊。保存配置和凭证测试通过后，仍需真实投放与点击确认来验证完整链路。</p>
            <Space wrap><Button size="small" :href="platformUrl" target="_blank" rel="noopener noreferrer">打开应用开放平台 ↗</Button><Button size="small" href="https://open.dingtalk.com/document/development/interactive-mode" target="_blank" rel="noopener noreferrer">查看互动卡片文档 ↗</Button></Space>
          </template>
        </Alert>
        <Card v-if="canTest" class="mt-5" size="small" title="发送一张测试卡片">
          <Alert v-if="blockReason" class="mb-4" type="warning" show-icon :message="blockReason" />
          <Alert v-if="recipientsError" class="mb-4" type="error" show-icon :message="recipientsError" />
          <Form ref="sendFormRef" :model="sendForm" layout="vertical" :disabled="sending || confirming">
            <Form.Item label="收件人（单选）" name="systemUserId" :rules="[{ required: true, message: '请选择一位系统用户' }]" extra="仅可选择真实系统账号；服务端会校验该用户的启用状态、企业和钉钉绑定。">
              <Space class="recipient-row">
                <Select v-model:value="sendForm.systemUserId" class="recipient-select" show-search allow-clear option-filter-prop="label" :options="recipients" :loading="loadingRecipients" placeholder="手动选择一位收件人" />
                <Button :loading="loadingRecipients" @click="loadRecipients">刷新用户</Button>
              </Space>
            </Form.Item>
            <Form.Item label="通知标题" name="title" :rules="[{ required: true, whitespace: true, message: '请填写标题' }]"><Input v-model:value="sendForm.title" :maxlength="100" show-count /></Form.Item>
            <Form.Item label="通知正文" name="content" :rules="[{ required: true, whitespace: true, message: '请填写正文' }]"><Input.TextArea v-model:value="sendForm.content" :maxlength="1000" :rows="3" show-count /></Form.Item>
            <Button type="primary" :loading="sending" :disabled="!!blockReason || loadingRecipients || !sendForm.systemUserId || confirming" @click="confirmSend">发送给所选用户</Button>
          </Form>
        </Card>
      </template>
    </Spin>
    <Card class="mt-5" size="small" title="最近 20 条卡片记录">
      <template #extra><Button size="small" :loading="refreshing" @click="loadInstances">刷新记录</Button></template>
      <p class="muted">投放结果与用户确认分别显示；没有确认回调不代表用户未读。收到确认后刷新记录查看原卡片更新状态。</p>
      <Alert v-if="historyError" class="mb-4" type="error" show-icon :message="historyError" />
      <Table :columns="columns" :data-source="instances" :pagination="false" :loading="refreshing" :scroll="{ x: 800 }" row-key="id" size="small">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'recipient'"><div>{{ record.title }}</div><span class="muted">{{ recipientLabel(record.systemUserId) }}</span></template>
          <template v-else-if="column.key === 'status'"><Tag :color="record.status === 'ACKNOWLEDGED' ? 'green' : record.status === 'FAILED' || record.status === 'UNKNOWN' ? 'orange' : 'blue'">{{ cardStatusLabel(record.status) }}</Tag><div class="muted">{{ cloudUpdateStatusLabel(record.cloudUpdateStatus) }}</div></template>
          <template v-else-if="column.key === 'acknowledgedAt'">{{ record.acknowledgedAt ? formatDingTalkCardTime(record.acknowledgedAt) : '尚未收到确认' }}</template>
          <template v-else-if="column.key === 'createTime'">{{ formatDingTalkCardTime(record.createTime) }}</template>
          <template v-else-if="column.key === 'action'"><Button type="link" size="small" @click="refreshInstance(record.id)">查看状态</Button></template>
        </template>
        <template #emptyText><Empty description="暂无互动卡片记录" :image="Empty.PRESENTED_IMAGE_SIMPLE" /></template>
      </Table>
      <Card v-if="selected" class="mt-4" size="small" title="卡片状态详情">
        <template #extra><Button size="small" :loading="refreshingInstance" @click="refreshInstance(selected.id)">刷新此卡片</Button></template>
        <Descriptions bordered size="small" :column="{ xs: 1, md: 2 }">
          <Descriptions.Item label="收件人">{{ recipientLabel(selected.systemUserId) }}</Descriptions.Item>
          <Descriptions.Item label="状态">{{ cardStatusLabel(selected.status) }}</Descriptions.Item>
          <Descriptions.Item label="卡片实例标识"><code>{{ selected.outTrackId }}</code></Descriptions.Item>
          <Descriptions.Item label="确认回调时间">{{ selected.acknowledgedAt ? formatDingTalkCardTime(selected.acknowledgedAt) : '尚未收到确认' }}</Descriptions.Item>
          <Descriptions.Item label="云端显示同步">{{ cloudUpdateStatusLabel(selected.cloudUpdateStatus) }}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{{ formatDingTalkCardTime(selected.createTime) }}</Descriptions.Item>
          <Descriptions.Item label="标题" :span="compactDetails ? 1 : 2">{{ selected.title }}</Descriptions.Item>
          <Descriptions.Item label="正文" :span="compactDetails ? 1 : 2"><span class="card-content">{{ selected.content }}</span></Descriptions.Item>
        </Descriptions>
        <Alert v-if="selected.lastError" class="mt-4" type="warning" show-icon :message="selected.lastError" />
        <Alert v-if="selected.status === 'UNKNOWN'" class="mt-4" type="warning" show-icon message="投放结果尚未确定，请先核对钉钉客户端与本条记录，避免重新发送造成重复通知。" />
      </Card>
    </Card>
  </div>
</template>

<style scoped>
.section-heading { margin: 10px 0 24px; }
h2 { margin: 0 0 7px; color: #172b4d; font-size: 18px; font-weight: 600; }
.section-heading p, .muted { color: #64748b; line-height: 1.8; }
.config-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
.platform-steps { padding-left: 20px; list-style: decimal; line-height: 1.9; }
.pending-note { color: #b7791f; font-size: 12px; }
.recipient-row { display: flex; }
.recipient-select { min-width: 320px; }
.muted { font-size: 12px; }
.card-content { white-space: pre-wrap; overflow-wrap: anywhere; }
code { overflow-wrap: anywhere; }
@media (width <= 600px) {
  .config-grid { grid-template-columns: 1fr; gap: 0; }
  .recipient-row { flex-wrap: wrap; }
  .recipient-select { min-width: 240px; max-width: 100%; }
}
</style>
