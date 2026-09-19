<script lang="ts" setup>
import type { JixiaoApi } from '#/api/fdmperformance';

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Alert, Button, Empty, Pagination, Spin, Tag } from 'ant-design-vue';

import {
  getInstancePage,
  getMyPendingReviews,
  getMyPendingSupervisorReviews,
  getMyResultPage,
} from '#/api/fdmperformance';

import { usePerformanceAccess } from '../shared/access';
import { TASK_LABELS } from '../shared/constants';
import PerformanceShell from '../shared/PerformanceShell.vue';
import {
  actionLabel,
  canHandleReview,
  deadlineMeta,
} from '../shared/workspace';

defineOptions({ name: 'FdmPerformanceWorkbench' });
const router = useRouter();
const { access, loadAccess } = usePerformanceAccess();
const loading = ref(false);
const failed = ref(false);
const summaryFailed = ref(false);
const rows = ref<JixiaoApi.Instance[]>([]);
const total = ref(0);
const page = ref(1);
const recent = ref<JixiaoApi.Result>();
const ongoing = ref<number>();
const employeeReviews = ref<JixiaoApi.Review[]>([]);
const supervisorReviews = ref<JixiaoApi.Review[]>([]);
let requestId = 0;
const reviewsCount = computed(
  () => employeeReviews.value.length + supervisorReviews.value.length,
);
const pendingRows = computed(() =>
  [...rows.value].sort((a, b) =>
    (a.endDate || '9999').localeCompare(b.endDate || '9999'),
  ),
);

async function loadPending() {
  const current = ++requestId;
  loading.value = true;
  failed.value = false;
  rows.value = [];
  try {
    const result = await getInstancePage({
      onlyPending: true,
      pageNo: page.value,
      pageSize: 8,
      scope: 'VISIBLE',
    });
    if (current !== requestId) return;
    rows.value = result.list;
    total.value = result.total;
  } catch {
    if (current === requestId) failed.value = true;
  } finally {
    if (current === requestId) loading.value = false;
  }
}

async function initialize() {
  summaryFailed.value = false;
  try {
    const permissions = await loadAccess();
    const [results, personal, supervisor] = await Promise.all([
      getMyResultPage({
        pageNo: 1,
        pageSize: 1,
        publicStatus: 1,
        scope: 'SELF',
      }),
      getMyPendingReviews(),
      getMyPendingSupervisorReviews(),
      loadPending(),
    ]);
    recent.value = results.list[0];
    employeeReviews.value = (personal || []).filter((review) =>
      canHandleReview(review, 'CONFIRM'),
    );
    supervisorReviews.value = (supervisor || []).filter((review) =>
      canHandleReview(review, 'SUBMIT'),
    );
    if (permissions.canManage) {
      const result = await getInstancePage({
        pageNo: 1,
        pageSize: 1,
        scope: permissions.availableScopes.includes('INITIATED')
          ? 'INITIATED'
          : 'ALL',
        status: 1,
      });
      ongoing.value = result.total;
    }
  } catch {
    summaryFailed.value = true;
  }
}

function openInstance(record: JixiaoApi.Instance) {
  void router.push(
    `/fdmperformance/batches/${record.batchId}/instances/${record.id}`,
  );
}
onMounted(initialize);
</script>

<template>
  <PerformanceShell
    title="绩效工作台"
    description="先处理待办，再查看自己的成绩与负责考核的进度。"
  >
    <template #actions
      ><Button
        v-if="access?.canLaunch"
        type="primary"
        @click="router.push('/fdmperformance/launch')"
        >发起考核</Button
      ></template
    >
    <Alert
      v-if="summaryFailed"
      type="error"
      message="部分工作台数据加载失败，请重试。"
      show-icon
      ><template #action
        ><Button size="small" @click="initialize">重试</Button></template
      ></Alert
    >
    <section class="summary-grid">
      <button
        class="summary-card"
        type="button"
        @click="
          page = 1;
          loadPending();
        "
      >
        <span>待我处理</span><strong>{{ total }}</strong
        ><small>当前有权办理的考核任务</small>
      </button>
      <button
        class="summary-card"
        type="button"
        @click="
          router.push({ path: '/fdmperformance/my', query: { tab: 'reviews' } })
        "
      >
        <span>改进与复盘</span><strong>{{ reviewsCount }}</strong
        ><small>待填写或待本人确认</small>
      </button>
      <button
        class="summary-card"
        type="button"
        @click="
          router.push({ path: '/fdmperformance/my', query: { tab: 'history' } })
        "
      >
        <span>最近公布成绩</span
        ><strong
          >{{ recent?.finalScore ?? '—' }}
          <Tag v-if="recent?.grade" color="blue">{{
            recent.grade
          }}</Tag></strong
        ><small>{{ recent?.periodKey || '暂无已公布成绩' }}</small>
      </button>
      <button
        v-if="access?.canManage"
        class="summary-card"
        type="button"
        @click="router.push('/fdmperformance/batches')"
      >
        <span>我发起的进行中考核</span><strong>{{ ongoing ?? '—' }}</strong
        ><small>查看阶段、截止时间与处理人</small>
      </button>
    </section>
    <section class="workbench-panel">
      <div class="section-head">
        <div>
          <h2>需要我处理</h2>
          <span>本页按截止时间排列</span>
        </div>
        <Button :loading="loading" @click="loadPending">刷新</Button>
      </div>
      <Alert
        v-if="failed"
        type="error"
        message="待办加载失败，请重试。"
        show-icon
      />
      <Spin :spinning="loading">
        <Empty
          v-if="!loading && !failed && !pendingRows.length"
          description="当前没有需要处理的考核任务"
        />
        <article
          v-for="record in pendingRows"
          :key="record.id"
          class="task-row"
        >
          <div class="task-main">
            <strong
              >{{ record.userName }} ·
              {{ record.templateName || '绩效考核' }}</strong
            >
            <p>
              {{ record.periodKey }} ·
              {{
                TASK_LABELS[record.currentTaskKey || ''] ||
                record.currentTaskName
              }}<span v-if="record.creatorUserName">
                · 发起人 {{ record.creatorUserName }}</span
              >
            </p>
          </div>
          <Tag :color="deadlineMeta(record.endDate).color">{{
            deadlineMeta(record.endDate).text
          }}</Tag>
          <Button type="primary" @click="openInstance(record)">{{
            actionLabel(record)
          }}</Button>
        </article>
      </Spin>
      <Pagination
        v-if="total > 8"
        v-model:current="page"
        :page-size="8"
        :total="total"
        size="small"
        @change="loadPending"
      />
    </section>
    <section v-if="reviewsCount" class="workbench-panel">
      <div class="section-head">
        <h2>复盘待办</h2>
        <Button
          type="link"
          @click="
            router.push({
              path: '/fdmperformance/my',
              query: { tab: 'reviews' },
            })
          "
          >查看全部</Button
        >
      </div>
      <article
        v-for="review in supervisorReviews.slice(0, 3)"
        :key="`s-${review.id}`"
        class="task-row"
      >
        <div class="task-main">
          <strong>{{ review.userName }} · 绩效复盘</strong>
          <p>{{ review.triggerGrade }} · 等待填写改进计划</p>
        </div>
        <Button
          @click="
            router.push({
              path: '/fdmperformance/my',
              query: {
                tab: 'reviews',
                reviewId: review.id,
                reviewAction: 'submit',
              },
            })
          "
          >填写复盘</Button
        >
      </article>
      <article
        v-for="review in employeeReviews.slice(0, 3)"
        :key="`e-${review.id}`"
        class="task-row"
      >
        <div class="task-main">
          <strong>我的绩效复盘</strong>
          <p>{{ review.supervisorUserName }} · 等待本人确认</p>
        </div>
        <Button
          @click="
            router.push({
              path: '/fdmperformance/my',
              query: {
                tab: 'reviews',
                reviewId: review.id,
                reviewAction: 'confirm',
              },
            })
          "
          >查看并确认</Button
        >
      </article>
    </section>
  </PerformanceShell>
</template>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 14px;
}
.summary-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 20px;
  text-align: left;
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  background: hsl(var(--card));
  cursor: pointer;
}
.summary-card:hover {
  border-color: hsl(var(--primary));
}
.summary-card strong {
  font-size: 30px;
  line-height: 1.25;
}
.summary-card small,
.section-head span,
.task-main p {
  color: hsl(var(--muted-foreground));
}
.workbench-panel {
  padding: 22px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.section-head h2 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 650;
}
.task-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 17px 0;
  border-bottom: 1px solid hsl(var(--border));
}
.task-row:last-child {
  border-bottom: 0;
}
.task-main {
  flex: 1;
  min-width: 0;
}
.task-main p {
  margin: 6px 0 0;
  font-size: 12px;
}
@media (max-width: 720px) {
  .task-row {
    flex-wrap: wrap;
  }
  .task-main {
    flex-basis: 100%;
  }
  .workbench-panel {
    padding: 16px;
  }
}
</style>
