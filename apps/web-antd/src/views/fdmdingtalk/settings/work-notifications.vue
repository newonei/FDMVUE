<script setup lang="ts">
import type { DingTalkWorkNotificationApi } from '#/api/fdmdingtalk/work-notification';
import type {
  WorkNotificationAttempt,
  WorkNotificationForm,
} from './work-notification-model';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { useAccessStore } from '@vben/stores';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  message,
  Modal,
  Radio,
  Select,
  Space,
  Tag,
} from 'ant-design-vue';

import {
  getDingTalkWorkNotificationDetailResult,
  getDingTalkWorkNotificationResult,
  sendDingTalkWorkNotification,
  sendDingTalkWorkNotificationDetail,
} from '#/api/fdmdingtalk/work-notification';
import { getSimpleUserList } from '#/api/system/user';
import { formatDingTalkCardTime } from '#/utils/dingtalk-card-time';

import { cardRecipientOptions } from './interactive-card-model';
import {
  beginWorkNotificationAttempt,
  buildWorkNotificationPayload,
  restoreWorkNotificationAttempt,
  summarizeWorkNotificationResult,
  WORK_NOTIFICATION_COVER,
} from './work-notification-model';

const props = defineProps<{
  appClientId: string;
  appDirty: boolean;
  appEnabled: boolean;
  frontendBaseUrl: string;
}>();
const { hasAccessByCodes } = useAccess();
const accessStore = useAccessStore();
const canSend = computed(() =>
  hasAccessByCodes(['fdmdingtalk:work-notification:send']),
);
const canQuery = computed(() =>
  hasAccessByCodes(['fdmdingtalk:work-notification:query']),
);
const storageKey = () =>
  `fdm:work-notification:${accessStore.tenantId ?? ''}:${props.appClientId}`;
let attemptStorageKey = storageKey();
const attempt = ref<WorkNotificationAttempt>();
try {
  attempt.value = restoreWorkNotificationAttempt(
    sessionStorage.getItem(attemptStorageKey),
  );
} catch {
  /* The in-memory lock still works without storage. */
}
const form = reactive<WorkNotificationForm>({
  systemUserId: undefined,
  detailMode: 'lightweight',
  title: '工作通知接入测试',
  description: '请查看这条工作通知的详情。',
  buttonTitle: '查看明细',
  detailUrl: props.frontendBaseUrl || '',
  coverUrl: '',
});
const recipients = ref<ReturnType<typeof cardRecipientOptions>>([]);
const loadingUsers = ref(false);
const userError = ref('');
const confirming = ref(false);
const querying = ref(false);
const queryError = ref('');
const sendError = ref('');
const result = ref<DingTalkWorkNotificationApi.SendResult>();
const summary = computed(() =>
  result.value ? summarizeWorkNotificationResult(result.value) : undefined,
);
const rawResult = computed(() => JSON.stringify(result.value, null, 2));
const blockReason = computed(() => {
  if (props.appDirty) return '请先保存应用连接中的修改';
  if (!props.appEnabled) return '请先启用并保存钉钉应用';
  if (!canSend.value) return '当前账号没有工作通知发送权限';
  if (!canQuery.value) return '需要工作通知查询权限，才能核对发送结果';
  return '';
});
const locked = computed(() => !!attempt.value);
const statusText = computed(() => {
  if (summary.value?.state === 'reported') return '钉钉已返回接收状态';
  if (summary.value?.state === 'issues') return '钉钉已返回异常接收状态';
  if (attempt.value?.phase === 'accepted')
    return '钉钉已受理，等待查询接收状态';
  if (attempt.value?.phase === 'failed') return '服务端记录发送失败';
  if (attempt.value?.phase === 'sending') return '发送请求处理中';
  return '发送结果不明，请先核对钉钉客户端';
});
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let pollCount = 0;
let alive = true;

function persistAttempt() {
  try {
    if (attempt.value)
      sessionStorage.setItem(attemptStorageKey, JSON.stringify(attempt.value));
    else sessionStorage.removeItem(attemptStorageKey);
  } catch {
    /* Keep the in-memory lock when storage is unavailable. */
  }
}

async function loadUsers() {
  loadingUsers.value = true;
  userError.value = '';
  try {
    recipients.value = cardRecipientOptions(await getSimpleUserList());
    if (!recipients.value.some((item) => item.value === form.systemUserId))
      form.systemUserId = undefined;
  } catch (error) {
    recipients.value = [];
    form.systemUserId = undefined;
    userError.value =
      error instanceof Error ? error.message : '读取系统用户失败，请重试';
  } finally {
    loadingUsers.value = false;
  }
}

async function queryResult(automatic = false) {
  const taskId = attempt.value?.taskId;
  const detailId = attempt.value?.detailId;
  const requestKey = attempt.value?.requestKey;
  if ((!taskId && !detailId) || querying.value || !canQuery.value) return;
  clearTimeout(pollTimer);
  querying.value = true;
  queryError.value = '';
  if (automatic) pollCount++;
  try {
    const value = detailId
      ? await getDingTalkWorkNotificationDetailResult(detailId)
      : await getDingTalkWorkNotificationResult(taskId!);
    if (!alive || requestKey !== attempt.value?.requestKey) return;
    result.value = value;
    if (
      automatic &&
      summarizeWorkNotificationResult(value).state === 'pending' &&
      pollCount < 6
    ) {
      pollTimer = setTimeout(() => {
        void queryResult(true);
      }, 2000);
    }
  } catch (error) {
    queryError.value =
      error instanceof Error
        ? error.message
        : '查询失败，请稍后手动查询；不要重复发送';
  } finally {
    querying.value = false;
  }
}

function startAnother() {
  if (attempt.value?.phase === 'sending') return;
  Modal.confirm({
    title: '开始另一条工作通知？',
    content:
      '上一条可能已经送达。请先核对钉钉客户端；开始另一条后，再次发送可能产生重复通知。',
    okText: '已核对，开始另一条',
    cancelText: '继续查看当前结果',
    onOk: () => {
      clearTimeout(pollTimer);
      attempt.value = undefined;
      persistAttempt();
      attemptStorageKey = storageKey();
      result.value = undefined;
      queryError.value = '';
      sendError.value = '';
      form.systemUserId = undefined;
    },
  });
}

async function confirmSend() {
  if (attempt.value || confirming.value || blockReason.value) return;
  let payload: ReturnType<typeof buildWorkNotificationPayload>;
  const recipient = recipients.value.find(
    (item) => item.value === form.systemUserId,
  );
  try {
    if (!recipient) throw new Error('请从真实系统用户中选择一位收件人');
    payload = buildWorkNotificationPayload(form, crypto.randomUUID());
  } catch (error) {
    message.warning(error instanceof Error ? error.message : '请核对卡片内容');
    return;
  }
  const title =
    payload.mode === 'lightweight'
      ? payload.data.title
      : payload.data.card.title;
  const requestKey =
    payload.mode === 'lightweight'
      ? payload.data.requestKey
      : crypto.randomUUID();
  confirming.value = true;
  Modal.confirm({
    title: `通过工作通知发送给 ${recipient.label}？`,
    content:
      '只发送给此账号绑定的钉钉用户，位置是企业应用工作通知。详情按钮会打开链接；此卡片不提供卡内“我已知晓”操作。',
    okText: '发送此工作通知',
    cancelText: '取消',
    onCancel: () => {
      confirming.value = false;
    },
    onOk: async () => {
      if (attempt.value || blockReason.value) {
        confirming.value = false;
        return;
      }
      attemptStorageKey = storageKey();
      attempt.value = beginWorkNotificationAttempt(
        attempt.value,
        recipient.label,
        title,
        requestKey,
      );
      persistAttempt();
      sendError.value = '';
      try {
        if (payload.mode === 'lightweight') {
          const receipt = await sendDingTalkWorkNotificationDetail(
            payload.data,
          );
          attempt.value.detailId = receipt.id;
          if (receipt.status === 'ACCEPTED') attempt.value.phase = 'accepted';
          else if (receipt.status === 'FAILED') attempt.value.phase = 'failed';
          else attempt.value.phase = 'unknown';
          if (receipt.taskId) attempt.value.taskId = receipt.taskId;
          attempt.value.detailUrl = receipt.detailUrl;
        } else {
          attempt.value.taskId = await sendDingTalkWorkNotification(
            payload.data,
          );
          attempt.value.phase = 'accepted';
          attempt.value.detailUrl = payload.data.card.detailUrl;
        }
        persistAttempt();
        if (attempt.value.taskId && alive) {
          pollCount = 0;
          void queryResult(true);
        }
      } catch (error) {
        attempt.value.phase = 'unknown';
        sendError.value =
          error instanceof Error ? error.message : '请求未返回可确认的发送结果';
        persistAttempt();
      } finally {
        confirming.value = false;
      }
    },
  });
}

watch(
  () => props.frontendBaseUrl,
  (value, oldValue) => {
    if (!locked.value && form.detailUrl === oldValue) form.detailUrl = value;
  },
);
void loadUsers();
if (attempt.value?.taskId && canQuery.value) void queryResult(true);
onBeforeUnmount(() => {
  alive = false;
  clearTimeout(pollTimer);
});
</script>

<template>
  <div class="work-notifications">
    <div class="section-heading">
      <h2>工作通知卡片 <Tag color="blue">企业应用工作通知</Tag></h2>
      <p>发送图文通知到钉钉工作通知，点击“查看明细”打开详情链接。</p>
    </div>
    <Alert
      class="mb-4"
      type="info"
      show-icon
      message="工作通知与机器人互动卡片是两个发送入口"
      description="本页发送 action_card 工作通知，详情按钮跳转到 URL。卡片内不能直接确认知晓；需要卡内回传时使用“机器人互动卡片”页签。"
    />
    <Alert
      v-if="blockReason"
      class="mb-4"
      type="warning"
      show-icon
      :message="blockReason"
    />
    <Alert
      v-if="userError"
      class="mb-4"
      type="error"
      show-icon
      :message="userError"
    />
    <Card size="small" title="发送给一位员工">
      <Form
        :model="form"
        layout="vertical"
        :disabled="locked || confirming || !!blockReason"
      >
        <Form.Item
          label="收件人（单选）"
          required
          extra="仅选择真实系统账号，服务端校验启用状态、企业和钉钉绑定。"
        >
          <div class="recipient-row">
            <Select
              v-model:value="form.systemUserId"
              class="recipient-select"
              show-search
              allow-clear
              option-filter-prop="label"
              :options="recipients"
              :loading="loadingUsers"
              placeholder="手动选择一位收件人"
            /><Button :loading="loadingUsers" @click="loadUsers"
              >刷新用户</Button
            >
          </div>
        </Form.Item>
        <div class="form-grid">
          <Form.Item label="通知标题" required
            ><Input
              v-model:value="form.title"
              :maxlength="100"
              show-count /></Form.Item
          ><Form.Item label="按钮文字" required
            ><Input v-model:value="form.buttonTitle" :maxlength="20" show-count
          /></Form.Item>
        </div>
        <Form.Item label="通知说明" required
          ><Input.TextArea
            v-model:value="form.description"
            :rows="3"
            :maxlength="600"
            show-count
        /></Form.Item>
        <Form.Item label="详情打开方式"
          ><Radio.Group v-model:value="form.detailMode"
            ><Radio value="lightweight">系统内轻量详情</Radio
            ><Radio value="link">已有业务链接</Radio></Radio.Group
          ></Form.Item
        >
        <Alert
          v-if="form.detailMode === 'lightweight'"
          class="mb-4"
          type="info"
          show-icon
          message="发送时生成此通知专属的详情入口"
          description="详情仅加载这条通知的内容，并在钉钉内完成免登；不加载后台导航菜单，仅收件人可查看。"
        />
        <Form.Item
          v-else
          label="详情 URL"
          required
          extra="填写已有业务深链；默认系统首页，不保证跳过该业务页面的加载流程。"
          ><Input
            v-model:value="form.detailUrl"
            :maxlength="500"
            placeholder="https://系统域名/已有业务详情"
        /></Form.Item>
        <Form.Item
          label="封面图片 URL（可选）"
          extra="可留空。图片必须是钉钉可公开访问的 HTTP(S) 地址。"
          ><Input
            v-model:value="form.coverUrl"
            :maxlength="500"
            placeholder="留空则不显示封面"
          /><Button
            class="mt-2"
            size="small"
            @click="
              form.coverUrl = `${frontendBaseUrl.replace(/\/+$/, '')}${WORK_NOTIFICATION_COVER}`
            "
            >使用内置封面</Button
          ></Form.Item
        >
        <Button
          v-access:code="['fdmdingtalk:work-notification:send']"
          type="primary"
          :disabled="
            locked || confirming || !!blockReason || !form.systemUserId
          "
          :loading="attempt?.phase === 'sending'"
          @click="confirmSend"
          >通过工作通知发送</Button
        >
      </Form>
    </Card>
    <Card v-if="attempt" class="mt-5" size="small" title="本次发送结果">
      <Alert
        class="mb-4"
        show-icon
        :type="
          attempt.phase === 'unknown' || attempt.phase === 'failed'
            ? 'warning'
            : 'info'
        "
        :message="statusText"
        description="返回任务编号仅代表受理。请查询钉钉发送结果，并在客户端核对通知；结果不明时本次发送保持锁定，不会自动重试。"
      />
      <Alert
        v-if="sendError"
        class="mb-4"
        type="warning"
        show-icon
        :message="sendError"
      />
      <Descriptions bordered size="small" :column="1"
        ><Descriptions.Item label="收件人">{{
          attempt.recipientLabel
        }}</Descriptions.Item
        ><Descriptions.Item label="标题">{{ attempt.title }}</Descriptions.Item
        ><Descriptions.Item label="发送时间">{{
          formatDingTalkCardTime(attempt.createdAt)
        }}</Descriptions.Item
        ><Descriptions.Item label="任务编号"
          ><code>{{
            attempt.taskId || '尚未取得可查询任务编号'
          }}</code></Descriptions.Item
        ><Descriptions.Item v-if="attempt.detailUrl" label="详情链接"
          ><code>{{ attempt.detailUrl }}</code></Descriptions.Item
        ></Descriptions
      >
      <Space class="mt-4" wrap
        ><Button
          v-access:code="['fdmdingtalk:work-notification:query']"
          :disabled="(!attempt.taskId && !attempt.detailId) || attempt.phase === 'sending'"
          :loading="querying"
          @click="queryResult(false)"
          >查询发送结果</Button
        ><Button :disabled="attempt.phase === 'sending'" @click="startAnother"
          >开始另一条通知</Button
        ></Space
      >
      <Alert
        v-if="queryError"
        class="mt-4"
        type="warning"
        show-icon
        :message="queryError"
        description="查询失败不会触发重发。可稍后再次查询，或在钉钉核对。"
      />
      <template v-if="summary">
        <Alert
          class="mt-4"
          show-icon
          :type="
            summary.state === 'reported'
              ? 'success'
              : summary.state === 'issues' || summary.state === 'invalid'
                ? 'warning'
                : 'info'
          "
          :message="
            summary.state === 'reported'
              ? '钉钉已返回接收状态'
              : summary.state === 'issues'
                ? '发送结果包含失败、无效或禁止状态'
                : summary.state === 'invalid'
                  ? '发送结果格式需核实'
                  : '尚未取得接收状态'
          "
          :description="
            summary.state === 'pending'
              ? '空列表不能证明发送成功。系统最多自动查询6次；仍无结果时请稍后手动查询。'
              : '以下是此任务返回的状态统计，具体账号与实际显示请在钉钉核对。'
          "
        />
        <div class="result-grid">
          <div
            v-for="(label, key) in {
              read_user_id_list: '已读',
              unread_user_id_list: '未读',
              failed_user_id_list: '失败',
              invalid_user_id_list: '无效用户',
              invalid_dept_id_list: '无效部门',
              forbidden_user_id_list: '禁止用户',
              forbidden_list: '限制条目',
            }"
            :key="key"
            class="result-stat"
          >
            <span>{{ label }}</span
            ><strong>{{ summary.counts[key] }}</strong>
          </div>
        </div>
        <details class="raw-result">
          <summary>查看钉钉原始结果</summary>
          <pre>{{ rawResult }}</pre>
        </details>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.section-heading {
  margin: 10px 0 24px;
}
h2 {
  margin: 0 0 7px;
  color: #172b4d;
  font-size: 18px;
  font-weight: 600;
}
.section-heading p {
  color: #64748b;
  line-height: 1.8;
}
.form-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  column-gap: 24px;
}
.recipient-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.recipient-select {
  width: 340px;
  max-width: 100%;
}
.result-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}
.result-stat {
  padding: 14px;
  background: #f5f8fc;
  border-radius: 8px;
  color: #64748b;
}
.result-stat strong {
  display: block;
  margin-top: 8px;
  color: #19314f;
  font-size: 24px;
}
code,
pre {
  overflow-wrap: anywhere;
  word-break: break-all;
}
.raw-result {
  margin-top: 20px;
  color: #52657c;
}
.raw-result summary {
  cursor: pointer;
}
.raw-result pre {
  max-height: 320px;
  overflow: auto;
  padding: 14px;
  white-space: pre-wrap;
  background: #f5f8fc;
}
@media (width <= 600px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .result-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
