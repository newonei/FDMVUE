<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type {
  DesktopFeedback,
  FeedbackAttachment,
  FeedbackCategory,
  FeedbackStatus,
} from '#/api/fdmmcp/desktop-feedback';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { formatDateTime } from '@vben/utils';

import {
  Alert,
  Button,
  Drawer,
  Empty,
  Image,
  message,
  Modal,
  Pagination,
  Select,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  feedbackDiagnosticType,
  getDesktopFeedbackAttachment,
  getDesktopFeedbackPage,
  updateDesktopFeedback,
} from '#/api/fdmmcp/desktop-feedback';

defineOptions({ name: 'FdmDesktopFeedback' });

const categories = {
  suggestion: '优化建议',
  issue: '问题反馈',
  feature: '功能需求',
} satisfies Record<FeedbackCategory, string>;

const statuses = {
  pending: { label: '待处理', color: 'orange' },
  processing: { label: '处理中', color: 'blue' },
  completed: { label: '已完成', color: 'green' },
} satisfies Record<FeedbackStatus, { color: string; label: string }>;

const statusOptions = (Object.keys(statuses) as FeedbackStatus[]).map(
  (value) => ({ value, label: statuses[value].label }),
);
const queueOptions = [
  { value: 'all', label: '全部反馈' },
  ...statusOptions,
] as const;
const categoryOptions = [
  { value: 'all', label: '全部类型' },
  ...Object.entries(categories).map(([value, label]) => ({ value, label })),
];

const columns: TableColumnsType<DesktopFeedback> = [
  { key: 'subject', title: '反馈内容' },
  { key: 'status', title: '状态', width: 120 },
  { key: 'author', title: '提交人', width: 130 },
  { key: 'createdAt', title: '提交时间', width: 180 },
  { key: 'actions', title: '操作', width: 100, align: 'right' },
];

const { hasAccessByCodes } = useAccess();
const canQuery = computed(() =>
  hasAccessByCodes(['fdmmcp:desktop-feedback:query']),
);
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmmcp:desktop-feedback:update']),
);

const category = ref<'all' | FeedbackCategory>('all');
const queue = ref<'all' | FeedbackStatus>('all');
const page = ref(1);
const pageSize = ref(20);
const refreshKey = ref(0);
const rows = ref<DesktopFeedback[]>([]);
const total = ref(0);
const loading = ref(false);
const loadError = ref(false);
const filtered = computed(
  () => category.value !== 'all' || queue.value !== 'all',
);

watch(
  [canQuery, category, queue, page, pageSize, refreshKey],
  async ([allowed, type, status, pageNo, limit], previous, cleanup) => {
    if (!allowed) {
      rows.value = [];
      total.value = 0;
      loading.value = false;
      return;
    }
    const request = new AbortController();
    cleanup(() => request.abort());
    loading.value = true;
    loadError.value = false;
    const [
      wasAllowed,
      previousType,
      previousStatus,
      previousPage,
      previousLimit,
    ] = previous ?? [];
    const scopeChanged =
      !wasAllowed ||
      previousType !== type ||
      previousStatus !== status ||
      previousPage !== pageNo ||
      previousLimit !== limit;
    if (scopeChanged) rows.value = [];
    try {
      const result = await getDesktopFeedbackPage(
        {
          category: type === 'all' ? undefined : type,
          pageNo,
          pageSize: limit,
          status: status === 'all' ? undefined : status,
        },
        request.signal,
      );
      if (request.signal.aborted) return;
      total.value = result.total;
      const lastPage = Math.max(1, Math.ceil(result.total / limit));
      if (pageNo > lastPage) {
        page.value = lastPage;
        return;
      }
      rows.value = result.list;
    } catch {
      if (!request.signal.aborted) loadError.value = true;
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  },
  { immediate: true },
);

function selectQueue(value: 'all' | FeedbackStatus) {
  if (queue.value === value) return;
  page.value = 1;
  queue.value = value;
}

function selectCategory(value: unknown) {
  page.value = 1;
  category.value =
    typeof value === 'string' && Object.hasOwn(categories, value)
      ? (value as FeedbackCategory)
      : 'all';
}

function clearFilters() {
  page.value = 1;
  queue.value = 'all';
  category.value = 'all';
}

function changePage(next: number, limit: number) {
  page.value = limit === pageSize.value ? next : 1;
  pageSize.value = limit;
}

const detail = ref<DesktopFeedback>();
const detailAttachments = computed(() => [
  ...(detail.value?.attachments ?? []),
  ...(detail.value?.diagnostics ?? []),
]);
const editStatus = ref<FeedbackStatus>('pending');
const reply = ref('');
const saving = ref(false);
const saveError = ref('');
const changed = computed(
  () =>
    !!detail.value &&
    (editStatus.value !== detail.value.status ||
      reply.value.trim() !== (detail.value.reply ?? '')),
);

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const selectedAttachment = ref<number>();
const loadingAttachment = ref(false);
const attachmentPreview = ref<{
  name: string;
  text?: string;
  url: string;
}>();
const attachmentError = ref('');
let attachmentRequest: AbortController | undefined;

function resetAttachment() {
  attachmentRequest?.abort();
  attachmentRequest = undefined;
  if (attachmentPreview.value) URL.revokeObjectURL(attachmentPreview.value.url);
  attachmentPreview.value = undefined;
  selectedAttachment.value = undefined;
  loadingAttachment.value = false;
  attachmentError.value = '';
}

function openDetail(id: string) {
  const row = rows.value.find((item) => item.id === id);
  if (!row) return;
  resetAttachment();
  detail.value = row;
  editStatus.value = row.status;
  reply.value = row.reply ?? '';
  saveError.value = '';
}

function closeDetail() {
  resetAttachment();
  detail.value = undefined;
}

function requestClose() {
  if (saving.value) return;
  if (!changed.value) {
    closeDetail();
    return;
  }
  Modal.confirm({
    title: '放弃这次修改？',
    content: '本次状态修改和回复尚未保存。',
    okText: '放弃修改',
    okType: 'danger',
    cancelText: '继续编辑',
    onOk: closeDetail,
  });
}

async function showAttachment(attachment: FeedbackAttachment) {
  const row = detail.value;
  if (
    !row ||
    (selectedAttachment.value === attachment.index &&
      (attachmentPreview.value || loadingAttachment.value))
  )
    return;
  resetAttachment();
  const request = new AbortController();
  attachmentRequest = request;
  selectedAttachment.value = attachment.index;
  loadingAttachment.value = true;
  try {
    const blob = await getDesktopFeedbackAttachment(
      row.id,
      attachment.index,
      request.signal,
    );
    if (request.signal.aborted) return;
    const diagnostic = attachment.contentType === feedbackDiagnosticType;
    const supported = diagnostic
      ? blob.type === feedbackDiagnosticType
      : imageTypes.has(blob.type);
    if (!supported || blob.size !== attachment.size) {
      attachmentError.value = '此附件无法预览。';
      return;
    }
    const text = diagnostic ? await blob.text() : undefined;
    if (request.signal.aborted) return;
    attachmentPreview.value = {
      name: attachment.name,
      text,
      url: URL.createObjectURL(blob),
    };
  } catch {
    if (!request.signal.aborted)
      attachmentError.value = '附件加载失败，点击文件名可重试。';
  } finally {
    if (attachmentRequest === request) {
      attachmentRequest = undefined;
      loadingAttachment.value = false;
    }
  }
}

async function saveDetail() {
  const row = detail.value;
  if (!row || !canUpdate.value || saving.value || !changed.value) return;
  saving.value = true;
  saveError.value = '';
  try {
    const saved = await updateDesktopFeedback({
      id: row.id,
      revision: row.revision,
      status: editStatus.value,
      reply: reply.value.trim(),
    });
    if (!saved) {
      saveError.value = '处理结果未保存，请重试。';
      return;
    }
    closeDetail();
    message.success('处理结果已保存');
    refreshKey.value++;
  } catch (error) {
    saveError.value =
      error &&
      typeof error === 'object' &&
      'msg' in error &&
      typeof error.msg === 'string'
        ? error.msg
        : '处理结果保存失败，请重试。';
  } finally {
    saving.value = false;
  }
}

onBeforeUnmount(resetAttachment);
</script>

<template>
  <Page
    title="桌面端意见反馈"
    description="查看飞德慕桌面端提交的建议和问题，跟进处理并回复员工。"
  >
    <Alert
      v-if="!canQuery"
      message="当前账号没有查看桌面端反馈的权限。"
      type="warning"
      show-icon
    />
    <section
      v-else
      class="feedback-queue bg-card text-card-foreground"
      aria-label="反馈列表"
    >
      <header class="feedback-toolbar border-b">
        <div class="feedback-queues" role="group" aria-label="处理状态">
          <button
            v-for="option in queueOptions"
            :key="option.value"
            type="button"
            class="feedback-queue-button"
            :aria-pressed="queue === option.value"
            @click="selectQueue(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
        <div class="feedback-filters">
          <Select
            :value="category"
            :options="categoryOptions"
            aria-label="反馈类型"
            class="feedback-category-select"
            @change="selectCategory"
          />
          <Button v-if="filtered" type="text" @click="clearFilters">
            清除筛选
          </Button>
          <Button :loading="loading" @click="refreshKey++">刷新</Button>
        </div>
      </header>

      <Alert
        v-if="loadError"
        class="m-4"
        message="反馈列表加载失败。"
        type="error"
        show-icon
      >
        <template #action>
          <Button size="small" @click="refreshKey++">重试</Button>
        </template>
      </Alert>
      <div
        v-if="loading && rows.length === 0"
        class="feedback-empty"
        role="status"
      >
        正在加载反馈…
      </div>
      <div v-else-if="!loadError && rows.length === 0" class="feedback-empty">
        <Empty :image="Empty.PRESENTED_IMAGE_SIMPLE">
          <template #description>
            <div class="feedback-empty-text">
              <strong>{{
                filtered ? '当前筛选下暂无反馈' : '还没有收到反馈'
              }}</strong>
              <span class="text-muted-foreground">{{
                filtered
                  ? '可切换状态或反馈类型查看其他记录。'
                  : '员工从飞德慕提交反馈后，记录会显示在这里。'
              }}</span>
            </div>
          </template>
          <Button v-if="filtered" @click="clearFilters">查看全部反馈</Button>
        </Empty>
      </div>
      <Table
        v-else-if="rows.length"
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: 760 }"
        row-key="id"
        table-layout="fixed"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'subject'">
            <button
              type="button"
              class="feedback-subject"
              @click="openDetail(record.id)"
            >
              {{ record.subject }}
            </button>
            <div class="feedback-row-meta text-muted-foreground">
              <span>FB-{{ record.id }}</span>
              <span>{{ categories[record.category as FeedbackCategory] }}</span>
              <span v-if="record.attachments.length">{{ record.attachments.length }} 张截图</span>
            </div>
          </template>
          <Tag
            v-else-if="column.key === 'status'"
            :color="statuses[record.status as FeedbackStatus].color"
          >
            {{ statuses[record.status as FeedbackStatus].label }}
          </Tag>
          <span
            v-else-if="column.key === 'author'"
            :title="`员工编号 ${record.userId}`"
            >{{ record.userId }}</span>
          <span v-else-if="column.key === 'createdAt'">{{
            formatDateTime(record.createdAt)
          }}</span>
          <Button
            v-else-if="column.key === 'actions'"
            type="link"
            size="small"
            @click="openDetail(record.id)"
          >
            {{ canUpdate ? '处理' : '查看' }}
          </Button>
        </template>
      </Table>
      <footer v-if="rows.length > 0" class="feedback-list-footer border-t">
        <span class="text-muted-foreground">共 {{ total }} 条反馈</span>
        <Pagination
          :current="page"
          :page-size="pageSize"
          :total="total"
          :page-size-options="['20', '50', '100']"
          size="small"
          show-size-changer
          @change="changePage"
        />
      </footer>
    </section>

    <Drawer
      :open="Boolean(detail)"
      title="反馈详情"
      width="min(660px, 100vw)"
      :closable="!saving"
      :keyboard="!saving"
      :mask-closable="false"
      @close="requestClose"
    >
      <template v-if="detail">
        <header class="feedback-detail-heading">
          <div class="feedback-detail-tags">
            <Tag>{{ categories[detail.category] }}</Tag>
            <Tag :color="statuses[detail.status].color">
              {{ statuses[detail.status].label }}
            </Tag>
            <span class="text-muted-foreground">FB-{{ detail.id }}</span>
          </div>
          <h2>{{ detail.subject }}</h2>
          <dl class="feedback-detail-meta text-muted-foreground">
            <div>
              <dt>提交人</dt>
              <dd>{{ detail.userId }}</dd>
            </div>
            <div>
              <dt>提交时间</dt>
              <dd>{{ formatDateTime(detail.createdAt) }}</dd>
            </div>
            <div v-if="detail.updatedAt !== detail.createdAt">
              <dt>最后更新</dt>
              <dd>{{ formatDateTime(detail.updatedAt) }}</dd>
            </div>
            <div v-if="detail.appVersion || detail.platform">
              <dt>客户端</dt>
              <dd>
                {{
                  [detail.appVersion, detail.platform]
                    .filter(Boolean)
                    .join(' · ')
                }}
              </dd>
            </div>
          </dl>
        </header>

        <section class="feedback-detail-section">
          <h3>反馈原文</h3>
          <p class="feedback-original bg-muted/50">{{ detail.description }}</p>
        </section>

        <section
          v-if="detailAttachments.length"
          class="feedback-detail-section"
        >
          <h3>
            附件
            <small class="text-muted-foreground">{{ detailAttachments.length }} 个</small>
          </h3>
          <div class="feedback-attachment-buttons">
            <Button
              v-for="attachment in detailAttachments"
              :key="attachment.index"
              :type="
                selectedAttachment === attachment.index ? 'primary' : 'default'
              "
              :loading="
                selectedAttachment === attachment.index && loadingAttachment
              "
              :aria-pressed="selectedAttachment === attachment.index"
              :title="attachment.name"
              @click="showAttachment(attachment)"
            >
              {{ attachment.name }}
            </Button>
          </div>
          <Alert
            v-if="attachmentError"
            class="mt-3"
            :message="attachmentError"
            type="error"
            show-icon
          />
          <div
            v-if="attachmentPreview?.text !== undefined"
            class="feedback-diagnostic-view bg-muted/50"
          >
            <pre>{{ attachmentPreview.text }}</pre>
            <a :href="attachmentPreview.url" :download="attachmentPreview.name">下载诊断日志</a>
          </div>
          <div
            v-else-if="attachmentPreview"
            class="feedback-image-view bg-muted/50"
          >
            <Image
              :src="attachmentPreview.url"
              :alt="attachmentPreview.name"
              @error="attachmentError = '此截图无法预览。'"
            />
          </div>
        </section>

        <section class="feedback-detail-section feedback-resolution border-t">
          <h3>{{ canUpdate ? '处理反馈' : '团队回复' }}</h3>
          <template v-if="canUpdate">
            <div class="feedback-editor">
              <div>
                <div
                  id="desktop-feedback-state-label"
                  class="feedback-field-label"
                >
                  更新状态
                </div>
                <div
                  class="feedback-state-options"
                  role="group"
                  aria-labelledby="desktop-feedback-state-label"
                >
                  <Button
                    v-for="option in statusOptions"
                    :key="option.value"
                    :type="editStatus === option.value ? 'primary' : 'default'"
                    :aria-pressed="editStatus === option.value"
                    :disabled="saving"
                    @click="editStatus = option.value"
                  >
                    {{ option.label }}
                  </Button>
                </div>
              </div>
              <div>
                <label for="desktop-feedback-reply" class="feedback-field-label">回复员工</label>
                <Textarea
                  id="desktop-feedback-reply"
                  v-model:value="reply"
                  :maxlength="1000"
                  :rows="4"
                  :disabled="saving"
                  placeholder="填写处理结果，或告诉员工下一步安排"
                  show-count
                />
              </div>
            </div>
          </template>
          <p v-else class="feedback-original bg-muted/50">
            {{ detail.reply || '暂无回复' }}
          </p>
          <Alert
            v-if="saveError"
            class="mt-3"
            :message="saveError"
            type="error"
            show-icon
          />
        </section>
      </template>
      <template #footer>
        <div class="feedback-drawer-footer">
          <span v-if="canUpdate" class="text-muted-foreground">保存后，员工可在「我的反馈」查看进度和回复。</span>
          <div>
            <Button :disabled="saving" @click="requestClose">关闭</Button>
            <Button
              v-if="canUpdate"
              type="primary"
              :disabled="!changed"
              :loading="saving"
              @click="saveDetail"
            >
              保存处理结果
            </Button>
          </div>
        </div>
      </template>
    </Drawer>
  </Page>
</template>

<style scoped>
.feedback-queue {
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.feedback-toolbar,
.feedback-list-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
}

.feedback-queues,
.feedback-filters,
.feedback-state-options,
.feedback-attachment-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.feedback-queue-button {
  padding: 6px 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
  border-radius: 6px;
}

.feedback-queue-button:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--muted));
}

.feedback-queue-button[aria-pressed='true'] {
  font-weight: 600;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}

.feedback-category-select {
  min-width: 128px;
}

.feedback-empty {
  display: grid;
  place-items: center;
  min-height: 218px;
  padding: 24px 16px;
  text-align: center;
}

.feedback-empty-text {
  display: grid;
  gap: 6px;
}

.feedback-empty-text strong {
  font-size: 15px;
  color: hsl(var(--foreground));
}

.feedback-row-meta,
.feedback-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: center;
}

.feedback-row-meta {
  margin-top: 4px;
  font-size: 12px;
}

.feedback-subject {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  vertical-align: top;
  color: hsl(var(--foreground));
  text-align: left;
  white-space: nowrap;
}

.feedback-subject:hover {
  color: hsl(var(--primary));
  text-decoration: underline;
}

.feedback-detail-tags :deep(.ant-tag) {
  margin-inline-end: 0;
}

.feedback-detail-heading h2 {
  margin: 9px 0 10px;
  font-size: 21px;
  font-weight: 650;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.feedback-detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 0;
  font-size: 12px;
}

.feedback-detail-meta > div {
  display: flex;
  gap: 5px;
  min-width: 0;
}

.feedback-detail-meta dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.feedback-detail-section {
  margin-top: 23px;
}

.feedback-detail-section h3 {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
}

.feedback-detail-section h3 small {
  margin-left: 5px;
  font-weight: 400;
}

.feedback-original {
  padding: 12px 14px;
  margin-bottom: 0;
  line-height: 1.7;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  border-radius: 8px;
}

.feedback-attachment-buttons button {
  max-width: min(280px, 100%);
  overflow: hidden;
  text-overflow: ellipsis;
}

.feedback-attachment-buttons button :deep(span) {
  overflow: hidden;
  text-overflow: ellipsis;
}

.feedback-image-view {
  display: flex;
  justify-content: center;
  padding: 8px;
  margin-top: 10px;
  border-radius: 8px;
}

.feedback-image-view :deep(img) {
  max-height: 290px;
  object-fit: contain;
}

.feedback-diagnostic-view {
  padding: 12px;
  margin-top: 10px;
  border-radius: 8px;
}

.feedback-diagnostic-view pre {
  max-height: 290px;
  margin-bottom: 8px;
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.feedback-resolution {
  padding-top: 18px;
}

.feedback-editor {
  display: grid;
  gap: 14px;
}

.feedback-field-label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
}

.feedback-drawer-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  justify-content: space-between;
}

.feedback-drawer-footer > span {
  font-size: 12px;
}

.feedback-drawer-footer > div {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

@media (max-width: 700px) {
  .feedback-toolbar,
  .feedback-list-footer {
    padding-inline: 12px;
  }

  .feedback-queue-button {
    padding-inline: 8px;
  }
}
</style>
