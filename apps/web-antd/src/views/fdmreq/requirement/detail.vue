<script lang="ts" setup>
import type { FdmReqApi } from '#/api/fdmreq';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  FormItem,
  Modal,
  Select,
  Space,
  Spin,
  Steps,
  Switch,
  TabPane,
  Tabs,
  Tag,
  Textarea,
  Timeline,
  TimelineItem,
  message,
} from 'ant-design-vue';

import {
  approveRequirement,
  completeRequirement,
  deleteRequirement,
  getRequirementDetail,
  reanalyzeRequirement,
  rejectRequirement,
  retryRequirement,
  supplementRequirement,
} from '#/api/fdmreq';

import {
  canReviewVersion,
  displayValue,
  eventLabel,
  eventMessage,
  formatFdmReqTime,
  getFdmReqStatusHint,
  getFdmReqStatusMeta,
  parseJson,
  proposalSections,
  readableValue,
  requiresManualHandling,
  safeExternalUrl,
} from '../status';

defineOptions({ name: 'FdmReqRequirementDetail' });

type FeedbackAction = 'reject' | 'supplement' | 'reanalyze' | 'retry';
const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();
const canApprove = computed(() =>
  hasAccessByCodes(['fdmreq:requirement:approve']),
);
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmreq:requirement:update']),
);
const canDelete = computed(() =>
  hasAccessByCodes(['fdmreq:requirement:delete']),
);
const reqNo = computed(() => String(route.query.reqNo || ''));
const loading = ref(false);
const loadError = ref(false);
const busy = ref(false);
const autoRefresh = ref(true);
const refreshedAt = ref('');
const detail = ref<FdmReqApi.RequirementDetail>();
const selectedVersionId = ref<number>();
const activeTab = ref('proposal');
const approvalCandidate = ref<FdmReqApi.RequirementVersion>();
const approvalOpen = ref(false);
const completeOpen = ref(false);
const cancelOpen = ref(false);
const feedbackOpen = ref(false);
const feedbackAction = ref<FeedbackAction>('supplement');
const feedbackMessage = ref('');
const feedbackVersionId = ref<number>();
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let loadGeneration = 0;

const requirement = computed(() => detail.value?.requirement);
const versions = computed(() => [...(detail.value?.versions ?? [])].reverse());
const selectedVersion = computed(() =>
  versions.value.find((item) => item.id === selectedVersionId.value),
);
const isCurrentVersion = computed(
  () =>
    selectedVersion.value?.id !== undefined &&
    selectedVersion.value.id === requirement.value?.currentVersionId,
);
const sections = computed(() =>
  proposalSections(selectedVersion.value?.contentJson),
);
const tasks = computed(() => [...(detail.value?.tasks ?? [])].reverse());
const reports = computed(() => [...(detail.value?.reports ?? [])].reverse());
const events = computed(() =>
  [...(detail.value?.events ?? [])].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)),
);
const latestFeedback = computed(() =>
  events.value.find((item) => !!eventMessage(item)),
);
const status = computed(() => requirement.value?.status ?? '');
const showReview = computed(
  () =>
    canApprove.value &&
    canReviewVersion(requirement.value, selectedVersion.value),
);
const isManual = computed(() =>
  requiresManualHandling(selectedVersion.value?.contentJson),
);
const editableStatuses = [
  'PENDING_ANALYSIS',
  'PENDING_SUPPLEMENT',
  'PENDING_CONFIRM',
  'APPROVED_PENDING_DEV',
];
const canSupplement = computed(
  () => canUpdate.value && editableStatuses.includes(status.value),
);
const canCancel = computed(
  () =>
    canDelete.value && [...editableStatuses, 'BLOCKED'].includes(status.value),
);
const stepIndex = computed(() => {
  if (status.value === 'CANCELLED') return -1;
  if (['COMPLETED', 'ACCEPTED'].includes(status.value)) return 5;
  if (status.value === 'PENDING_ACCEPTANCE') return 4;
  if (['DEVELOPING', 'TESTING', 'PUSHED_CHECKING'].includes(status.value))
    return 3;
  if (status.value === 'APPROVED_PENDING_DEV') return 2;
  if (status.value === 'PENDING_CONFIRM') return 1;
  if (status.value === 'BLOCKED') return tasks.value.length ? 3 : 0;
  return 0;
});
const feedbackMeta = computed(
  () =>
    ({
      reject: {
        title: '退回方案并重新分析',
        label: '需要调整的地方',
        hint: '请说明哪些内容不符合预期，AI 会根据反馈生成新版本，原方案保留。',
        ok: '退回重新分析',
      },
      supplement: {
        title: '补充需求说明',
        label: '补充内容',
        hint: '补充后会重新分析，已有审核结果不再用于执行；原始描述保持不变。',
        ok: '提交补充',
      },
      reanalyze: {
        title: '重新生成方案',
        label: '重新分析的原因或要求',
        hint: '需求将重新进入分析队列，新的方案需要再次审核。',
        ok: '重新分析',
      },
      retry: {
        title: '处理后重试',
        label: '问题处理情况',
        hint: '确认阻塞原因已解决。系统会校验已审核方案，将可重试的任务重新排队。',
        ok: '重新排队',
      },
    })[feedbackAction.value],
);

async function load(silent = false) {
  if (!reqNo.value) {
    loadError.value = true;
    return;
  }
  const generation = ++loadGeneration;
  if (!silent) loading.value = true;
  try {
    const next = await getRequirementDetail(reqNo.value);
    if (generation !== loadGeneration) return;
    const oldCurrent = requirement.value?.currentVersionId;
    const wasCurrent = selectedVersionId.value === oldCurrent;
    detail.value = next;
    if (
      selectedVersionId.value === undefined ||
      wasCurrent ||
      !next.versions?.some((item) => item.id === selectedVersionId.value)
    ) {
      selectedVersionId.value =
        next.requirement.currentVersionId ?? next.versions?.at(-1)?.id;
    }
    loadError.value = false;
    refreshedAt.value = new Date().toLocaleTimeString('zh-CN', {
      hour12: false,
    });
  } catch {
    if (generation === loadGeneration) loadError.value = true;
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

function openApproval() {
  if (!showReview.value) return;
  approvalCandidate.value = selectedVersion.value;
  approvalOpen.value = true;
}

async function approve() {
  const versionId = approvalCandidate.value?.id;
  if (!canApprove.value || versionId === undefined) return;
  busy.value = true;
  try {
    await approveRequirement(reqNo.value, { versionId });
    approvalOpen.value = false;
    message.success('审核通过，已进入待实现队列');
    await load();
  } finally {
    busy.value = false;
  }
}

function openFeedback(action: FeedbackAction) {
  feedbackAction.value = action;
  feedbackMessage.value = '';
  feedbackVersionId.value = selectedVersion.value?.id;
  feedbackOpen.value = true;
}

async function submitFeedback() {
  if (!feedbackMessage.value.trim()) {
    message.warning('请填写说明，方便后续分析与追踪');
    return;
  }
  busy.value = true;
  const actions = {
    reject: rejectRequirement,
    supplement: supplementRequirement,
    reanalyze: reanalyzeRequirement,
    retry: retryRequirement,
  };
  try {
    await actions[feedbackAction.value](reqNo.value, {
      message: feedbackMessage.value.trim(),
      ...(feedbackAction.value === 'reject'
        ? { versionId: feedbackVersionId.value }
        : {}),
    });
    feedbackOpen.value = false;
    message.success(
      feedbackAction.value === 'retry'
        ? '已重新排队'
        : '已记录反馈，等待 AI 重新分析',
    );
    await load();
  } finally {
    busy.value = false;
  }
}

async function complete() {
  busy.value = true;
  try {
    await completeRequirement(reqNo.value);
    completeOpen.value = false;
    message.success('需求已验收完成');
    await load();
  } finally {
    busy.value = false;
  }
}

async function cancel() {
  busy.value = true;
  try {
    await deleteRequirement(reqNo.value);
    cancelOpen.value = false;
    message.success('需求已取消，历史记录保留');
    await load();
  } finally {
    busy.value = false;
  }
}

function taskPullRequests(task: FdmReqApi.DevTask) {
  const result = parseJson(task.resultJson);
  const list: Array<{ repository: string; url: string }> = [];
  if (
    result &&
    typeof result === 'object' &&
    'pullRequests' in result &&
    Array.isArray(result.pullRequests)
  ) {
    for (const item of result.pullRequests) {
      if (!item || typeof item !== 'object') continue;
      const url = safeExternalUrl(item.url);
      if (url)
        list.push({
          repository: String(item.repository || '查看代码变更'),
          url,
        });
    }
  }
  const legacyUrl = safeExternalUrl(task.prUrl);
  if (legacyUrl && !list.some((item) => item.url === legacyUrl))
    list.push({ repository: '查看代码变更', url: legacyUrl });
  return list;
}

function taskSummary(task: FdmReqApi.DevTask) {
  const result = parseJson(task.resultJson);
  return result && typeof result === 'object' && 'summary' in result
    ? readableValue(result.summary)
    : '';
}

function reportColor(result?: string) {
  return result === 'PASS' ? 'success' : result === 'FAIL' ? 'error' : 'orange';
}
function reportLabel(result?: string) {
  return (
    (
      { PASS: '通过', FAIL: '失败', SKIPPED: '已跳过' } as Record<
        string,
        string
      >
    )[result ?? ''] ??
    result ??
    '未报告'
  );
}

watch(reqNo, () => {
  detail.value = undefined;
  approvalOpen.value = false;
  approvalCandidate.value = undefined;
  feedbackOpen.value = false;
  completeOpen.value = false;
  cancelOpen.value = false;
  selectedVersionId.value = undefined;
  activeTab.value = 'proposal';
  void load();
});
onMounted(() => {
  void load();
  refreshTimer = setInterval(() => {
    if (
      autoRefresh.value &&
      !document.hidden &&
      !busy.value &&
      !loading.value &&
      !approvalOpen.value &&
      !feedbackOpen.value &&
      !completeOpen.value &&
      !cancelOpen.value
    )
      void load(true);
  }, 15_000);
});
onBeforeUnmount(() => {
  clearInterval(refreshTimer);
  loadGeneration++;
});
</script>

<template>
  <Page auto-content-height>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Button @click="router.push('/fdmreq/requirements')"
        >← 返回需求中心</Button
      >
      <Space wrap>
        <span class="text-xs text-muted-foreground">{{
          refreshedAt ? `更新于 ${refreshedAt}` : ''
        }}</span>
        <span class="text-xs text-muted-foreground">自动刷新</span
        ><Switch
          v-model:checked="autoRefresh"
          size="small"
          aria-label="自动刷新"
        />
        <Button :loading="loading" @click="load()">刷新</Button>
      </Space>
    </div>
    <Alert
      v-if="loadError"
      class="mb-4"
      type="error"
      show-icon
      :message="
        reqNo
          ? '需求详情加载失败，请刷新重试。'
          : '缺少需求编号，请返回需求中心选择需求。'
      "
    />
    <Spin :spinning="loading && !detail">
      <template v-if="requirement">
        <Card class="mb-4 req-overview">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <div
                class="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
              >
                <span>{{ requirement.reqNo }}</span
                ><span>·</span
                ><span
                  >{{
                    formatFdmReqTime(requirement.createTime)
                  }}（北京时间）</span
                >
              </div>
              <h1 class="req-heading">{{ requirement.title }}</h1>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <Tag :color="getFdmReqStatusMeta(status).color">{{
                  getFdmReqStatusMeta(status).label
                }}</Tag
                ><span class="text-sm text-muted-foreground">{{
                  getFdmReqStatusHint(status)
                }}</span>
              </div>
            </div>
            <Space wrap>
              <Button v-if="canSupplement" @click="openFeedback('supplement')"
                >补充说明</Button
              >
              <Button
                v-if="canApprove && status === 'BLOCKED'"
                type="primary"
                @click="openFeedback('retry')"
                >处理后重试</Button
              >
              <Button
                v-if="canApprove && status === 'PENDING_ACCEPTANCE'"
                type="primary"
                @click="completeOpen = true"
                >验收通过</Button
              >
              <Button
                v-if="canCancel"
                danger
                type="text"
                @click="cancelOpen = true"
                >取消需求</Button
              >
            </Space>
          </div>
          <Steps
            class="mt-7"
            size="small"
            :current="stepIndex"
            :status="status === 'BLOCKED' ? 'error' : 'process'"
            :items="[
              { title: 'AI 分析' },
              { title: '方案审核' },
              { title: '等待实现' },
              { title: '执行与测试' },
              { title: '人工验收' },
            ]"
          />
        </Card>

        <Alert
          v-if="status === 'PENDING_SUPPLEMENT'"
          class="mb-4"
          type="warning"
          show-icon
          message="AI 需要更多信息"
          :description="
            latestFeedback
              ? eventMessage(latestFeedback)
              : '请补充场景、预期效果或验收标准，以便继续设计方案。'
          "
        />
        <Alert
          v-else-if="status === 'BLOCKED'"
          class="mb-4"
          type="error"
          show-icon
          message="需求已阻塞"
          :description="
            tasks[0]?.failReason ||
            (latestFeedback
              ? eventMessage(latestFeedback)
              : '请查看执行记录，处理问题后再重试。')
          "
        />

        <Card :body-style="{ paddingTop: '6px' }">
          <Tabs v-model:active-key="activeTab">
            <TabPane key="proposal" tab="方案与审核">
              <div
                class="mb-5 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <h2 class="section-heading">AI 实现方案</h2>
                  <p class="mt-1 text-xs text-muted-foreground">
                    每次修改都会保留版本，审核仅针对你确认的具体方案。
                  </p>
                </div>
                <Select
                  v-if="versions.length"
                  v-model:value="selectedVersionId"
                  style="min-width: 230px"
                  :options="
                    versions.map((item) => ({
                      value: item.id,
                      label: `${item.versionNo} · ${item.id === requirement?.currentVersionId ? '当前版本' : '历史版本'}`,
                    }))
                  "
                  aria-label="方案版本"
                />
              </div>
              <template v-if="selectedVersion">
                <Alert
                  v-if="!isCurrentVersion"
                  class="mb-4"
                  type="info"
                  show-icon
                  message="正在查看历史方案，此版本不可审核。请切换到当前版本查看最新方案。"
                />
                <Alert
                  v-if="isManual"
                  class="mb-4"
                  type="warning"
                  show-icon
                  message="此方案需要人工拆分"
                  description="AI 标记此需求不适合直接自动实现。请退回并缩小范围，或补充说明后重新分析。"
                />
                <div class="proposal-grid">
                  <section
                    v-for="(section, index) in sections"
                    :key="index"
                    class="proposal-section"
                  >
                    <h3>{{ section.title }}</h3>
                    <p>{{ section.body }}</p>
                  </section>
                </div>
                <div
                  class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4"
                >
                  <span class="text-xs text-muted-foreground"
                    >{{ selectedVersion.versionNo }} · 生成于
                    {{ formatFdmReqTime(selectedVersion.createTime) }}</span
                  >
                  <Space wrap>
                    <Button
                      v-if="canUpdate && editableStatuses.includes(status)"
                      @click="openFeedback('reanalyze')"
                      >重新分析</Button
                    >
                    <Button
                      v-if="
                        canApprove &&
                        status === 'PENDING_CONFIRM' &&
                        isCurrentVersion
                      "
                      @click="openFeedback('reject')"
                      >退回修改</Button
                    >
                    <Button
                      v-if="showReview"
                      type="primary"
                      @click="openApproval"
                      >审核通过，加入待实现</Button
                    >
                  </Space>
                </div>
              </template>
              <Empty
                v-else
                :description="
                  status === 'ANALYZING'
                    ? 'AI 正在设计方案，请稍后查看'
                    : '方案尚未生成，需求正在等待分析'
                "
                class="py-12"
              />
              <div
                v-if="detail?.approvals?.length"
                class="mt-5 rounded-lg bg-muted/40 p-4"
              >
                <h3 class="mb-3 text-sm font-semibold">审核记录</h3>
                <div
                  v-for="approval in [...detail.approvals].reverse()"
                  :key="approval.id"
                  class="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
                >
                  <span>{{
                    versions.find((item) => item.id === approval.versionId)
                      ?.versionNo || `版本 ${approval.versionId}`
                  }}</span
                  ><span>审核人 {{ approval.approverId || '—' }}</span
                  ><span>{{ formatFdmReqTime(approval.approvedAt) }}</span
                  ><Tag color="success">审核通过</Tag>
                </div>
              </div>
            </TabPane>

            <TabPane key="requirement" tab="需求与补充">
              <section class="mb-6">
                <h2 class="section-heading">原始需求</h2>
                <p class="mb-4 mt-1 text-xs text-muted-foreground">
                  提交人 {{ requirement.submitterId || '—' }} ·
                  原始内容保留，后续分析不覆盖。
                </p>
                <div class="readable-block">
                  {{ requirement.rawDescription || '未提供描述' }}
                </div>
              </section>
              <section>
                <h2 class="section-heading mb-4">补充说明与反馈</h2>
                <div
                  v-for="event in events.filter((item) => !!eventMessage(item))"
                  :key="event.id"
                  class="feedback-entry"
                >
                  <div
                    class="mb-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"
                  >
                    <b>{{ eventLabel(event) }}</b
                    ><span>{{ formatFdmReqTime(event.createTime) }}</span>
                  </div>
                  <p>{{ eventMessage(event) }}</p>
                </div>
                <Empty
                  v-if="!events.some((item) => !!eventMessage(item))"
                  description="暂无补充说明"
                />
              </section>
            </TabPane>

            <TabPane
              key="delivery"
              :tab="`执行与交付${tasks.length ? ` · ${tasks.length}` : ''}`"
            >
              <Alert
                class="mb-5"
                type="info"
                show-icon
                message="实现结果、测试记录和代码变更集中展示在这里，验收完成不会自动合并代码。"
              />
              <Empty
                v-if="!tasks.length"
                description="尚未开始执行，方案审核通过后等待自动任务领取"
                class="py-8"
              />
              <article v-for="task in tasks" :key="task.id" class="task-card">
                <div
                  class="mb-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <h3 class="font-semibold">
                      {{ task.taskNo || `执行任务 ${task.id}` }}
                    </h3>
                    <div class="mt-1 text-xs text-muted-foreground">
                      方案
                      {{
                        versions.find((item) => item.id === task.versionId)
                          ?.versionNo ||
                        task.versionId ||
                        '—'
                      }}
                      · 已重试 {{ task.retryCount ?? 0 }} 次
                    </div>
                  </div>
                  <Tag :color="getFdmReqStatusMeta(task.status).color">{{
                    getFdmReqStatusMeta(task.status).label
                  }}</Tag>
                </div>
                <div class="mb-4 grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <span class="text-muted-foreground">最近心跳：</span
                    >{{
                      task.heartbeatAt
                        ? formatFdmReqTime(task.heartbeatAt)
                        : '尚未收到'
                    }}
                  </div>
                  <div>
                    <span class="text-muted-foreground">执行分支：</span
                    ><code>{{ task.branchName || '待生成' }}</code>
                  </div>
                  <div
                    v-if="
                      task.id === tasks[0]?.id && detail?.lease?.type === 'DEV'
                    "
                  >
                    <span class="text-muted-foreground">领取有效期：</span
                    >{{ formatFdmReqTime(detail?.lease?.expiresAt) }}
                  </div>
                  <div v-if="task.commitSha">
                    <span class="text-muted-foreground">提交记录：</span
                    ><code class="break-all">{{ task.commitSha }}</code>
                  </div>
                </div>
                <Alert
                  v-if="task.failReason"
                  class="mb-3"
                  type="error"
                  show-icon
                  :message="task.failReason"
                />
                <div v-if="taskSummary(task)" class="readable-block mb-3">
                  {{ taskSummary(task) }}
                </div>
                <div
                  v-if="taskPullRequests(task).length"
                  class="mb-3 flex flex-wrap gap-3"
                >
                  <a
                    v-for="pr in taskPullRequests(task)"
                    :key="pr.url"
                    :href="pr.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="pr-link"
                    >{{ pr.repository }} ↗</a
                  >
                </div>
                <details v-if="task.logExcerpt" class="task-log">
                  <summary>执行日志摘要</summary>
                  <pre>{{ task.logExcerpt }}</pre>
                </details>
              </article>
              <h2 class="section-heading mb-4 mt-7">测试与验收证据</h2>
              <Empty v-if="!reports.length" description="暂无测试报告" />
              <article
                v-for="report in reports"
                :key="report.id"
                class="task-card"
              >
                <div class="mb-3 flex flex-wrap justify-between gap-2">
                  <span class="text-sm"
                    >任务
                    {{
                      tasks.find((item) => item.id === report.taskId)?.taskNo ||
                      report.taskId ||
                      '—'
                    }}
                    · {{ formatFdmReqTime(report.createTime) }}</span
                  ><Tag :color="reportColor(report.result)">{{
                    reportLabel(report.result)
                  }}</Tag>
                </div>
                <div v-if="report.commandsJson" class="mb-3">
                  <h3 class="mb-2 text-xs text-muted-foreground">检查命令</h3>
                  <pre class="readable-block">{{
                    readableValue(parseJson(report.commandsJson))
                  }}</pre>
                </div>
                <div v-if="report.evidenceJson" class="mb-3">
                  <h3 class="mb-2 text-xs text-muted-foreground">执行证据</h3>
                  <div class="readable-block">
                    {{ readableValue(parseJson(report.evidenceJson)) }}
                  </div>
                </div>
                <Alert
                  v-if="report.skippedReason"
                  class="mb-3"
                  type="warning"
                  :message="`跳过原因：${report.skippedReason}`"
                />
                <Alert
                  v-if="report.residualRisk"
                  type="warning"
                  :message="`剩余风险：${report.residualRisk}`"
                />
                <div
                  v-if="report.commitSha"
                  class="mt-3 break-all text-xs text-muted-foreground"
                >
                  测试对应提交 {{ report.commitSha }}
                </div>
              </article>
            </TabPane>

            <TabPane key="activity" tab="需求时间线">
              <Empty
                v-if="!events.length"
                description="暂无操作记录"
                class="py-8"
              />
              <Timeline v-else class="pt-4">
                <TimelineItem
                  v-for="event in events"
                  :key="event.id"
                  :color="
                    event.toStatus === 'BLOCKED'
                      ? 'red'
                      : event.toStatus === 'COMPLETED'
                        ? 'green'
                        : 'blue'
                  "
                >
                  <div class="mb-1 flex flex-wrap items-center gap-3">
                    <strong class="text-sm">{{ eventLabel(event) }}</strong
                    ><span class="text-xs text-muted-foreground">{{
                      formatFdmReqTime(event.createTime)
                    }}</span>
                  </div>
                  <div class="text-xs text-muted-foreground">
                    操作人 {{ displayValue(event.actorId)
                    }}<template v-if="event.toStatus">
                      ·
                      {{
                        event.fromStatus
                          ? `${getFdmReqStatusMeta(event.fromStatus).label} → `
                          : ''
                      }}{{
                        getFdmReqStatusMeta(event.toStatus).label
                      }}</template
                    >
                  </div>
                  <p
                    v-if="eventMessage(event)"
                    class="mt-2 whitespace-pre-wrap break-words text-sm"
                  >
                    {{ eventMessage(event) }}
                  </p>
                </TimelineItem>
              </Timeline>
            </TabPane>
          </Tabs>
        </Card>
      </template>
    </Spin>

    <Modal
      v-model:open="approvalOpen"
      title="确认通过这版方案？"
      ok-text="审核通过，加入待实现"
      cancel-text="继续查看"
      :confirm-loading="busy"
      :mask-closable="false"
      @ok="approve"
    >
      <p class="my-4">
        你将批准 <b>{{ requirement?.title }}</b> 的
        <b>{{ approvalCandidate?.versionNo }}</b> 方案。
      </p>
      <Alert
        type="info"
        show-icon
        message="通过后进入待实现队列，由自动任务按已批准方案实现、测试并交付，完成后仍需你验收。"
      />
    </Modal>
    <Modal
      v-model:open="feedbackOpen"
      :title="feedbackMeta.title"
      :ok-text="feedbackMeta.ok"
      cancel-text="返回"
      :confirm-loading="busy"
      :mask-closable="false"
      @ok="submitFeedback"
    >
      <p class="mb-4 mt-3 text-sm text-muted-foreground">
        {{ feedbackMeta.hint }}
      </p>
      <Form layout="vertical"
        ><FormItem :label="feedbackMeta.label" required
          ><Textarea
            v-model:value="feedbackMessage"
            :rows="5"
            :maxlength="8000"
            show-count /></FormItem
      ></Form>
    </Modal>
    <Modal
      v-model:open="completeOpen"
      title="确认需求已经满足验收标准？"
      ok-text="确认验收完成"
      cancel-text="继续检查"
      :confirm-loading="busy"
      @ok="complete"
      ><p class="my-4">
        请确认实现效果、测试报告和剩余风险已检查。此操作将需求标记为已完成，不会自动合并代码。
      </p></Modal
    >
    <Modal
      v-model:open="cancelOpen"
      title="确认取消这个需求？"
      ok-text="确认取消"
      cancel-text="保留需求"
      :ok-button-props="{ danger: true }"
      :confirm-loading="busy"
      @ok="cancel"
      ><p class="my-4">
        取消后将停止排队，需求描述、方案和历史记录会保留。
      </p></Modal
    >
  </Page>
</template>

<style scoped>
.req-heading {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 24px;
  line-height: 1.4;
  font-weight: 650;
}
.section-heading {
  font-size: 16px;
  font-weight: 600;
}
.proposal-grid {
  display: grid;
  gap: 16px;
}
.proposal-section {
  padding: 18px 20px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}
.proposal-section:first-child {
  background: hsl(var(--primary) / 0.035);
  border-left: 3px solid hsl(var(--primary));
}
.proposal-section h3 {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
}
.proposal-section p,
.feedback-entry p {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.85;
}
.readable-block {
  padding: 16px;
  border-radius: 8px;
  background: hsl(var(--muted) / 0.55);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.8;
}
.feedback-entry {
  margin-bottom: 12px;
  padding: 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}
.task-card {
  margin-bottom: 16px;
  padding: 20px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}
.task-log {
  margin-top: 12px;
  font-size: 13px;
}
.task-log summary {
  cursor: pointer;
  color: hsl(var(--muted-foreground));
}
.task-log pre {
  max-height: 300px;
  overflow: auto;
  margin-top: 12px;
  padding: 14px;
  border-radius: 6px;
  background: hsl(var(--muted) / 0.6);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
.pr-link {
  display: inline-block;
  padding: 7px 12px;
  border: 1px solid hsl(var(--primary) / 0.25);
  border-radius: 6px;
  color: hsl(var(--primary));
  font-size: 13px;
}
@media (max-width: 640px) {
  .req-heading {
    font-size: 20px;
  }
  .task-card,
  .proposal-section {
    padding: 14px;
  }
}
</style>
