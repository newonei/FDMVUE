<script setup lang="ts">
import type { Contract, Directory } from '#/api/fdmplatform';
import type {
  ContractReview,
  ContractReviewStatus,
} from '#/api/fdmplatform/contract-review';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { Alert, Button, Card, Input, Select, Space, Tag } from 'ant-design-vue';

import { getDirectory, newIdempotencyKey } from '#/api/fdmplatform';
import {
  decideContractReview,
  getContractReviews,
  refreshContractReview,
  submitContractReview,
} from '#/api/fdmplatform/contract-review';

import { errorText } from '../data';

const props = withDefaults(
  defineProps<{ contract?: Contract; open?: boolean }>(),
  { contract: undefined, open: true },
);
const emit = defineEmits<{ changed: []; updated: [] }>();
const router = useRouter();
const panelElement = ref<HTMLElement>();
const labels: Record<ContractReviewStatus, string> = {
  AI_PENDING: 'AI审核中',
  AUTO_APPROVED: '自动审核通过',
  HUMAN_APPROVED: '人工审核通过',
  MANUAL_REQUIRED: '待人工审核',
  RETURNED: '已退回补充',
  STALE: '审核已失效',
};
const reviews = ref<ContractReview[]>([]);
const users = ref<Directory['users']>([]);
const reviewerUserId = ref<number>();
const reason = ref('');
const loadError = ref('');
const busy = ref(false);
const loading = ref(false);
const loaded = ref(false);
const feedback = ref('');
const reasonError = ref('');
const current = computed(() => reviews.value.find((review) => review.current));
const pending = computed(() =>
  ['AI_PENDING', 'MANUAL_REQUIRED'].includes(current.value?.status ?? ''),
);
const needsSubmission = computed(
  () =>
    !current.value ||
    ['RETURNED', 'STALE'].includes(current.value.status) ||
    !!current.value.inboxUnavailableReason,
);
const statusLabel = computed(() =>
  current.value ? labels[current.value.status] : '',
);
const primaryLabel = computed(() => {
  if (pending.value) {
    return current.value?.status === 'MANUAL_REQUIRED'
      ? '处理审核'
      : '查看审核';
  }
  return current.value ? '重新提交审核' : '提交审核';
});
const reviewerName = computed(() => {
  const id = pending.value
    ? current.value?.reviewerUserId
    : reviewerUserId.value;
  return (
    users.value.find((user) => user.id === id)?.nickname ??
    (id ? `用户 #${id}` : '尚未指定')
  );
});
const canSubmit = computed(
  () =>
    props.contract?.status === 'DRAFT' &&
    loaded.value &&
    !loading.value &&
    needsSubmission.value &&
    !!reviewerUserId.value,
);
const manual = computed(
  () =>
    props.contract?.status === 'DRAFT' &&
    current.value?.status === 'MANUAL_REQUIRED',
);
let loadSequence = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let operation: undefined | { fingerprint: string; key: string };

function commandKey(fingerprint: string) {
  if (operation?.fingerprint !== fingerprint)
    operation = { fingerprint, key: newIdempotencyKey() };
  return operation.key;
}
function stopPoll() {
  if (timer) clearTimeout(timer);
  timer = undefined;
}
function invalidateLoads() {
  stopPoll();
  loadSequence += 1;
  loading.value = false;
}
function schedulePoll() {
  stopPoll();
  if (props.open && current.value?.status === 'AI_PENDING')
    timer = setTimeout(() => void load(), 5000);
}
async function load() {
  const contract = props.contract;
  if (!props.open || !contract) return;
  const sequence = ++loadSequence;
  loading.value = true;
  try {
    const rows = await getContractReviews(contract.id);
    if (sequence !== loadSequence || props.contract?.id !== contract.id) return;
    const previous = current.value;
    reviews.value = rows;
    loaded.value = true;
    loadError.value = '';
    if (
      previous?.id !== current.value?.id ||
      previous?.status !== current.value?.status
    )
      feedback.value = '';
    if (previous && previous.id !== current.value?.id) {
      reason.value = '';
      reasonError.value = '';
    }
    if (
      current.value &&
      (current.value.contractVersion !== contract.version ||
        (previous?.status === 'AI_PENDING' &&
          current.value.status !== 'AI_PENDING'))
    ) {
      emit('updated');
      emit('changed');
    }
    schedulePoll();
  } catch (error) {
    if (sequence === loadSequence) {
      loadError.value = errorText(error);
      schedulePoll();
    }
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}
function apply(review: ContractReview) {
  reviews.value = [
    review,
    ...reviews.value
      .filter((row) => row.id !== review.id)
      .map((row) => ({ ...row, current: false })),
  ];
  operation = undefined;
  loaded.value = true;
  reason.value = '';
  emit('updated');
  emit('changed');
  schedulePoll();
}
async function submit() {
  const contract = props.contract;
  if (!contract || busy.value) return;
  if (!canSubmit.value) {
    loadError.value = submissionBlockedMessage();
    await focusPanel();
    return;
  }
  invalidateLoads();
  busy.value = true;
  loadError.value = '';
  const fingerprint = JSON.stringify([
    'submit',
    contract.id,
    contract.version,
    reviewerUserId.value,
  ]);
  try {
    const result = await submitContractReview(
      contract.id,
      contract.version,
      commandKey(fingerprint),
      reviewerUserId.value,
    );
    if (props.contract?.id === contract.id) {
      apply(result);
      feedback.value = submissionFeedback(result.status);
    }
  } catch (error) {
    if (props.contract?.id === contract.id) loadError.value = errorText(error);
  } finally {
    busy.value = false;
    if (props.contract?.id === contract.id) schedulePoll();
  }
}
function submissionBlockedMessage() {
  if (pending.value) return '';
  if (loading.value) return '正在读取审核状态，请稍候';
  return loaded.value
    ? '请先选择人工审核处理人'
    : '审核状态未读取成功，请先刷新审核';
}
function submissionFeedback(status: ContractReviewStatus) {
  if (status === 'MANUAL_REQUIRED') {
    return '提交成功，已进入人工审核。请在下方填写审核意见并处理，无需重复提交。';
  }
  if (status === 'AI_PENDING') {
    return '提交成功，AI正在审核，结果将在这里自动更新。';
  }
  return `审核状态：${labels[status]}`;
}
async function refresh() {
  const contract = props.contract;
  const review = current.value;
  if (!contract || busy.value) return;
  if (!review || review.status !== 'AI_PENDING') {
    loadError.value = '';
    await load();
    return;
  }
  busy.value = true;
  invalidateLoads();
  loadError.value = '';
  try {
    const result = await refreshContractReview(
      contract.id,
      review.id,
      contract.version,
    );
    if (props.contract?.id === contract.id) apply(result);
  } catch (error) {
    if (props.contract?.id === contract.id) loadError.value = errorText(error);
  } finally {
    busy.value = false;
    if (props.contract?.id === contract.id) schedulePoll();
  }
}
async function decide(decision: 'APPROVE' | 'RETURN') {
  const contract = props.contract;
  const review = current.value;
  if (!contract || !review || !manual.value || busy.value) return;
  if (!reason.value.trim()) {
    reasonError.value = '请先填写审核意见，说明通过依据或需要补充的问题';
    await focusPanel();
    return;
  }
  reasonError.value = '';
  const explanation = reason.value.trim();
  invalidateLoads();
  busy.value = true;
  loadError.value = '';
  const fingerprint = JSON.stringify([
    contract.id,
    review.id,
    contract.version,
    decision,
    explanation,
  ]);
  try {
    const result = await decideContractReview(contract.id, review.id, {
      decision,
      expectedVersion: contract.version,
      idempotencyKey: commandKey(fingerprint),
      reason: explanation,
    });
    if (props.contract?.id === contract.id) {
      apply(result);
      feedback.value =
        decision === 'APPROVE'
          ? '审核通过，合同已确认，可以继续办理后续业务。'
          : '已退回补充，修改资料后可重新提交审核。';
    }
  } catch (error) {
    if (props.contract?.id === contract.id) loadError.value = errorText(error);
  } finally {
    busy.value = false;
    if (props.contract?.id === contract.id) schedulePoll();
  }
}
watch(
  () => [props.contract?.id, props.contract?.version, props.open] as const,
  async (value, previous) => {
    stopPoll();
    loadSequence += 1;
    if (value[0] !== previous?.[0]) {
      reviews.value = [];
      reason.value = '';
      loadError.value = '';
      operation = undefined;
      loaded.value = false;
      feedback.value = '';
      reasonError.value = '';
      reviewerUserId.value = props.contract?.ownerUserId;
    }
    if (!props.open || !props.contract) return;
    void load();
    if (users.value.length === 0) {
      try {
        const directory = await getDirectory(0);
        users.value = directory.users;
      } catch (error) {
        loadError.value = errorText(error);
      }
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  stopPoll();
  loadSequence += 1;
});
async function focusPanel() {
  await nextTick();
  panelElement.value?.scrollIntoView?.({
    block: 'nearest',
    behavior: 'smooth',
  });
  const input = panelElement.value?.querySelector<HTMLElement>(
    manual.value ? 'textarea' : '[role="combobox"], select',
  );
  (input ?? panelElement.value)?.focus();
}
async function primaryAction() {
  await (pending.value ? focusPanel() : submit());
}
defineExpose({
  busy,
  current,
  load,
  loading,
  primaryAction,
  primaryLabel,
  statusLabel,
  submit,
});
</script>

<template>
  <section ref="panelElement" tabindex="-1" aria-label="合同审核办理">
    <Card title="合同审核" size="small">
      <Space direction="vertical" style="width: 100%" :size="12">
        <Alert v-if="loadError" type="error" show-icon :message="loadError" />
        <Alert v-if="feedback" type="success" show-icon :message="feedback" />
        <Alert
          :type="
            current?.status === 'AUTO_APPROVED' ||
            current?.status === 'HUMAN_APPROVED'
              ? 'success'
              : 'info'
          "
          show-icon
          :message="current ? labels[current.status] : '尚未提交审核'"
          :description="
            current?.summary ||
            '保存后提交审核。AI明确通过且资料充分时自动确认合同；异常、资料不足或AI不可用时转人工。'
          "
        />
        <div v-if="pending" class="review-guidance">
          <p>
            {{
              current?.status === 'MANUAL_REQUIRED'
                ? '已提交，等待人工审核。审核通过后合同才会确认；请直接在下方填写审核意见。'
                : '已提交，AI正在审核。请等待结果，无需重复提交。'
            }}
          </p>
          <p>
            待办处理人：{{ reviewerName
            }}<span v-if="current?.requestedBy">
              · 提交人：{{
                users.find((user) => user.id === current?.requestedBy)
                  ?.nickname ?? `用户 #${current.requestedBy}`
              }}</span>
          </p>
          <p class="review-help">
            集中入口：采购部门 →
            业务待办与提醒。处理人查看“我的待办”，发起人查看“我发起的审批”。
          </p>
          <Button
            type="link"
            :disabled="busy"
            @click="router.push('/fdmprocurement/platform-approvals')"
          >
            打开业务待办与提醒
          </Button>
        </div>
        <Alert
          v-if="current?.inboxUnavailableReason"
          type="warning"
          show-icon
          :message="current.inboxUnavailableReason"
          description="请重新指定可用处理人并提交；也可在当前合同中处理审核。"
        />
        <Alert
          v-if="current?.ruleIssues?.length"
          type="warning"
          show-icon
          message="请先修正以下资料，规则未通过时不能人工放行"
          :description="current.ruleIssues.join('；')"
        />
        <div
          v-for="(issue, index) in current?.result?.issues || []"
          :key="index"
        >
          <Tag :color="issue.severity === 'HIGH' ? 'red' : 'orange'">
            {{ issue.severity }}
          </Tag>
          {{ issue.message }}
          <span class="review-evidence">依据：{{ issue.evidenceIds.join('、') }}</span>
        </div>
        <Space wrap>
          <template v-if="contract?.status === 'DRAFT' && needsSubmission">
            <span>人工审核处理人</span>
            <Select
              v-model:value="reviewerUserId"
              aria-label="人工审核处理人"
              style="min-width: 180px"
              :disabled="busy || current?.status === 'AI_PENDING'"
              show-search
              option-filter-prop="label"
              :options="
                users.map((user) => ({ value: user.id, label: user.nickname }))
              "
            />
            <Button
              type="primary"
              :loading="busy"
              :disabled="!canSubmit || busy"
              @click="submit"
            >
              {{
                current?.inboxUnavailableReason
                  ? '提交给新处理人'
                  : current
                    ? '重新提交审核'
                    : '提交审核'
              }}
            </Button>
          </template>
          <Button
            :loading="loading"
            :disabled="busy || loading"
            @click="refresh"
          >
            刷新审核
          </Button>
        </Space>
        <template v-if="manual">
          <label class="review-reason-label">审核意见（必填）</label>
          <p class="review-help">
            填写通过依据或需要补充的问题，再选择“人工通过并确认合同”或“退回补充”。
          </p>
          <Input.TextArea
            v-model:value="reason"
            aria-label="人工审核理由"
            :maxlength="2000"
            :rows="3"
            :disabled="busy"
            :status="reasonError ? 'error' : undefined"
            :aria-invalid="!!reasonError"
            @update:value="reasonError = ''"
            placeholder="填写核对依据、通过理由或需补充的问题"
          />
          <span v-if="reasonError" role="alert" class="review-reason-error">{{
            reasonError
          }}</span>
          <Space>
            <Button
              type="primary"
              :loading="busy"
              :disabled="busy || !!current?.ruleIssues?.length"
              @click="decide('APPROVE')"
            >
              人工通过并确认合同
            </Button>
            <Button :disabled="busy" @click="decide('RETURN')">
              退回补充
            </Button>
          </Space>
        </template>
        <details v-if="reviews.length">
          <summary>查看审核记录（{{ reviews.length }}）</summary>
          <div
            v-for="review in reviews"
            :key="review.id"
            class="review-history"
          >
            <Tag>{{ labels[review.status] }}</Tag>
            业务版本 {{ review.businessVersion }} · {{ review.createdAt }}
            <p>{{ review.summary }}</p>
            <p v-if="review.decisionReason">
              {{
                review.decisionSource === 'SYSTEM_AI'
                  ? '系统自动审核'
                  : '人工处理'
              }}：{{ review.decisionReason }}
            </p>
          </div>
        </details>
      </Space>
    </Card>
  </section>
</template>

<style scoped>
.review-evidence {
  display: block;
  font-size: 12px;
  color: var(--ant-color-text-secondary, #64748b);
}

.review-history {
  margin-top: 12px;
}

.review-history p {
  margin: 6px 0;
}

.review-guidance p,
.review-help {
  margin: 0 0 6px;
}

.review-reason-label {
  font-weight: 500;
}

.review-help {
  color: var(--ant-color-text-secondary, #64748b);
}

.review-reason-error {
  color: var(--ant-color-error, #cf1322);
}
</style>
