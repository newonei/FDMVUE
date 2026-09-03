<script lang="ts" setup>
import type { BpmTaskApi } from '#/api/bpm/task';
import type { SystemNoticeApi } from '#/api/system/notice';
import type { SystemNotifyMessageApi } from '#/api/system/notify/message';
import type { SystemVersionApi } from '#/api/system/version';

import { computed, onActivated, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { useBuildInfo } from '@vben/hooks';
import { IconifyIcon } from '@vben/icons';
import { preferences } from '@vben/preferences';
import { useUserStore } from '@vben/stores';

import {
  Avatar,
  Button,
  Empty,
  Modal,
  Skeleton,
  Tabs,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { getTaskTodoPage } from '#/api/bpm/task';
import { getDingTalkApprovalTodoCount } from '#/api/fdmdingtalk/approval';
import { getNoticePage, getPublishedNoticePage } from '#/api/system/notice';
import {
  getUnreadNotifyMessageCount,
  getUnreadNotifyMessageList,
} from '#/api/system/notify/message';
import { getSystemBuildInfo } from '#/api/system/version';

defineOptions({ name: 'DashboardHome' });

interface DashboardLoadingState {
  dingTalk: boolean;
  messages: boolean;
  notices: boolean;
  tasks: boolean;
  version: boolean;
}

interface DashboardErrorState {
  dingTalk: boolean;
  messages: boolean;
  notices: boolean;
  tasks: boolean;
  version: boolean;
}

interface QuickEntry {
  color: string;
  description: string;
  icon: string;
  path: string;
  permissions?: string[];
  title: string;
}

interface MetricCard {
  color: string;
  description: string;
  icon: string;
  key: string;
  loading: boolean;
  path: string;
  title: string;
  value: null | number;
}

const router = useRouter();
const userStore = useUserStore();
const { hasAccessByCodes } = useAccess();
const frontendBuildInfo = useBuildInfo(import.meta.env, import.meta.env.PROD);

const tasks = ref<BpmTaskApi.Task[]>([]);
const taskTotal = ref(0);
const dingTalkTodoCount = ref<null | number>(null);
const unreadMessageCount = ref<null | number>(null);
const unreadMessages = ref<SystemNotifyMessageApi.NotifyMessage[]>([]);
const notices = ref<SystemNoticeApi.Notice[]>([]);
const activeInformationTab = ref<'messages' | 'notices'>('notices');
const selectedNotice = ref<null | SystemNoticeApi.Notice>(null);
const noticeModalOpen = ref(false);
const lastUpdatedAt = ref<null | number>(null);
const refreshing = ref(false);
const backendBuildInfo = ref<null | SystemVersionApi.BuildInfo>(null);

const loading = reactive<DashboardLoadingState>({
  dingTalk: false,
  messages: false,
  notices: false,
  tasks: false,
  version: false,
});

const failed = reactive<DashboardErrorState>({
  dingTalk: false,
  messages: false,
  notices: false,
  tasks: false,
  version: false,
});

const canViewBpmTasks = computed(() => hasAccessByCodes(['bpm:task:query']));
const canViewDingTalkApprovals = computed(() =>
  hasAccessByCodes(['fdmdingtalk:approval:query']),
);
const canManageNotices = computed(() =>
  hasAccessByCodes(['system:notice:query']),
);
const systemVersionStatus = computed(() => {
  if (loading.version) return { color: 'blue', text: '正在读取' };
  if (backendBuildInfo.value) return { color: 'green', text: '后端已连接' };
  return {
    color: failed.version ? 'orange' : 'default',
    text: failed.version ? '后端未上报' : '等待读取',
  };
});

const currentDateText = computed(() => {
  const weekday = [
    '星期日',
    '星期一',
    '星期二',
    '星期三',
    '星期四',
    '星期五',
    '星期六',
  ][dayjs().day()];
  return `${dayjs().format('YYYY年M月D日')} · ${weekday}`;
});

const greetingText = computed(() => {
  const hour = dayjs().hour();
  if (hour < 6) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
});

const displayName = computed(
  () => userStore.userInfo?.nickname || userStore.userInfo?.username || '同事',
);

const totalPending = computed(
  () => taskTotal.value + (dingTalkTodoCount.value ?? 0),
);

const totalPendingLoading = computed(
  () => loading.tasks || (canViewDingTalkApprovals.value && loading.dingTalk),
);

const totalPendingFailed = computed(
  () =>
    (canViewBpmTasks.value && failed.tasks) ||
    (canViewDingTalkApprovals.value && failed.dingTalk),
);

const primaryTaskPath = computed(() => {
  if (canViewBpmTasks.value) return '/bpm/task/todo';
  if (canViewDingTalkApprovals.value) return '/caiwu/dingtalk-approval';
  return '/system/notify-message';
});

const allQuickEntries: QuickEntry[] = [
  {
    color: '#2563eb',
    description: '查看并办理当前流程任务',
    icon: 'lucide:list-checks',
    path: '/bpm/task/todo',
    permissions: ['bpm:task:query'],
    title: '待办任务',
  },
  {
    color: '#0f766e',
    description: '提交新的审批或业务流程',
    icon: 'lucide:circle-play',
    path: '/bpm/process-instance/create',
    permissions: ['bpm:process-instance:create'],
    title: '发起流程',
  },
  {
    color: '#1677ff',
    description: '处理钉钉同步审批单',
    icon: 'lucide:clipboard-check',
    path: '/caiwu/dingtalk-approval',
    permissions: ['fdmdingtalk:approval:query'],
    title: '钉钉审批',
  },
  {
    color: '#7c3aed',
    description: '查看考核、复盘与确认事项',
    icon: 'lucide:chart-no-axes-combined',
    path: '/fdmperformance/my',
    permissions: ['fdmperformance:assessment:query'],
    title: '我的绩效',
  },
  {
    color: '#db2777',
    description: '进入图像与视频创作项目',
    icon: 'lucide:sparkles',
    path: '/fdmcreative/workbench',
    permissions: ['fdmcreative:project:query'],
    title: '智能创作',
  },
  {
    color: '#0891b2',
    description: '打开常用办公与业务工具',
    icon: 'lucide:layout-grid',
    path: '/dashboard/workspace',
    title: '应用工作台',
  },
  {
    color: '#475569',
    description: '查看全部系统通知与消息',
    icon: 'lucide:mail',
    path: '/system/notify-message',
    title: '我的消息',
  },
];

const quickEntries = computed(() =>
  allQuickEntries
    .filter((item) => !item.permissions || hasAccessByCodes(item.permissions))
    .slice(0, 6),
);

const metricCards = computed<MetricCard[]>(() => {
  const cards: MetricCard[] = [
    {
      color: '#2563eb',
      description: '需要我处理的全部事项',
      icon: 'lucide:inbox',
      key: 'all',
      loading: totalPendingLoading.value,
      path: primaryTaskPath.value,
      title: '我的待办',
      value: totalPendingFailed.value ? null : totalPending.value,
    },
  ];

  if (canViewBpmTasks.value) {
    cards.push({
      color: '#ea580c',
      description: '内部工作流待办理',
      icon: 'lucide:workflow',
      key: 'bpm',
      loading: loading.tasks,
      path: '/bpm/task/todo',
      title: '流程待办',
      value: failed.tasks ? null : taskTotal.value,
    });
  }

  if (canViewDingTalkApprovals.value) {
    cards.push({
      color: '#0891b2',
      description: failed.dingTalk ? '钉钉服务暂不可用' : '全部模板待我审批',
      icon: 'lucide:clipboard-check',
      key: 'dingtalk',
      loading: loading.dingTalk,
      path: '/caiwu/dingtalk-approval',
      title: '钉钉待审',
      value: failed.dingTalk ? null : dingTalkTodoCount.value,
    });
  }

  cards.push({
    color: '#7c3aed',
    description: failed.messages ? '消息服务暂不可用' : '尚未阅读的站内消息',
    icon: 'lucide:mail-open',
    key: 'messages',
    loading: loading.messages,
    path: '/system/notify-message',
    title: '未读消息',
    value: failed.messages ? null : unreadMessageCount.value,
  });

  return cards;
});

const lastUpdatedText = computed(() => {
  if (!lastUpdatedAt.value) return '正在获取最新数据';
  return `更新于 ${dayjs(lastUpdatedAt.value).format('HH:mm')}`;
});

function formatDateTime(value?: Date | number | string) {
  if (value === undefined || value === null || value === '') return '—';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('MM-DD HH:mm') : '—';
}

function formatBuildVersion(value?: string) {
  return !value || value === 'local' ? '本地开发' : value;
}

function formatBuildMetadata(commit?: string, buildTime?: string) {
  if (!commit || commit === 'local') return '本地开发构建';
  const parsed = dayjs(buildTime);
  const time = parsed.isValid()
    ? parsed.format('YYYY-MM-DD HH:mm')
    : '时间未记录';
  return `提交 ${commit.slice(0, 12)} · 构建 ${time}`;
}

function plainText(value?: string) {
  return (value || '')
    .replaceAll(/<style[\s\S]*?<\/style>/gi, ' ')
    .replaceAll(/<script[\s\S]*?<\/script>/gi, ' ')
    .replaceAll(/<[^>]+>/g, ' ')
    .replaceAll(/&nbsp;|&#160;/gi, ' ')
    .replaceAll(/&amp;/gi, '&')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function taskProcessName(task: BpmTaskApi.Task) {
  return task.processInstance?.name || '流程待办';
}

function taskStarterName(task: BpmTaskApi.Task) {
  return task.processInstance?.startUser?.nickname || '未知发起人';
}

function taskWaitingInfo(task: BpmTaskApi.Task) {
  const createdAt = Number(task.createTime);
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    return { color: 'default', text: '等待处理' };
  }
  const elapsedHours = Math.max(0, dayjs().diff(dayjs(createdAt), 'hour'));
  if (elapsedHours < 1) return { color: 'blue', text: '刚刚到达' };
  if (elapsedHours < 24) {
    return { color: 'blue', text: `已等待 ${elapsedHours} 小时` };
  }
  const elapsedDays = Math.max(1, Math.floor(elapsedHours / 24));
  if (elapsedDays >= 7) {
    return { color: 'red', text: `已等待 ${elapsedDays} 天` };
  }
  if (elapsedDays >= 3) {
    return { color: 'orange', text: `已等待 ${elapsedDays} 天` };
  }
  return { color: 'blue', text: `已等待 ${elapsedDays} 天` };
}

function noticeTypeLabel(type?: number) {
  return type === 2 ? '公告' : '通知';
}

function navigateTo(path: string) {
  void router.push(path);
}

function openTask(task: BpmTaskApi.Task) {
  void router.push({
    name: 'BpmProcessInstanceDetail',
    query: {
      id: task.processInstance?.id || task.processInstanceId,
      taskId: task.id,
    },
  });
}

function openNotice(notice: SystemNoticeApi.Notice) {
  selectedNotice.value = notice;
  noticeModalOpen.value = true;
}

async function loadTasks() {
  failed.tasks = false;
  if (!canViewBpmTasks.value) {
    tasks.value = [];
    taskTotal.value = 0;
    return;
  }
  loading.tasks = true;
  try {
    const result = await getTaskTodoPage({ pageNo: 1, pageSize: 6 });
    tasks.value = result.list || [];
    taskTotal.value = Number(result.total || 0);
  } catch {
    failed.tasks = true;
    tasks.value = [];
    taskTotal.value = 0;
  } finally {
    loading.tasks = false;
  }
}

async function loadDingTalkTodoCount() {
  failed.dingTalk = false;
  if (!canViewDingTalkApprovals.value) {
    dingTalkTodoCount.value = 0;
    return;
  }
  loading.dingTalk = true;
  try {
    const result = await getDingTalkApprovalTodoCount();
    dingTalkTodoCount.value = Number(result.count || 0);
  } catch {
    failed.dingTalk = true;
    dingTalkTodoCount.value = null;
  } finally {
    loading.dingTalk = false;
  }
}

async function loadMessages() {
  failed.messages = false;
  loading.messages = true;
  try {
    const [count, list] = await Promise.all([
      getUnreadNotifyMessageCount(),
      getUnreadNotifyMessageList(),
    ]);
    unreadMessageCount.value = Number(count || 0);
    unreadMessages.value = (list || []).slice(0, 5);
  } catch {
    failed.messages = true;
    unreadMessageCount.value = null;
    unreadMessages.value = [];
  } finally {
    loading.messages = false;
  }
}

async function loadNotices() {
  failed.notices = false;
  loading.notices = true;
  try {
    const result = await getPublishedNoticePage({ pageNo: 1, pageSize: 5 });
    notices.value = result.list || [];
  } catch {
    // 兼容前后端分批更新：旧服务仅管理员拥有公告查询权限。
    if (canManageNotices.value) {
      try {
        const fallback = await getNoticePage({
          pageNo: 1,
          pageSize: 5,
          status: 0,
        });
        notices.value = fallback.list || [];
        return;
      } catch {
        // 统一由下方空状态承接，不阻断其他首页模块。
      }
    }
    failed.notices = true;
    notices.value = [];
  } finally {
    loading.notices = false;
  }
}

async function loadSystemVersion() {
  failed.version = false;
  loading.version = true;
  try {
    backendBuildInfo.value = await getSystemBuildInfo();
  } catch {
    // 新前端可先于后端发布；旧后端不存在接口时在版本卡片中明确提示即可。
    failed.version = true;
    backendBuildInfo.value = null;
  } finally {
    loading.version = false;
  }
}

async function refreshDashboard() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    await Promise.allSettled([
      loadTasks(),
      loadDingTalkTodoCount(),
      loadMessages(),
      loadNotices(),
      loadSystemVersion(),
    ]);
    lastUpdatedAt.value = Date.now();
  } finally {
    refreshing.value = false;
  }
}

onMounted(() => {
  void refreshDashboard();
});

onActivated(() => {
  if (lastUpdatedAt.value && Date.now() - lastUpdatedAt.value > 60_000) {
    void refreshDashboard();
  }
});
</script>

<template>
  <div class="dashboard-home">
    <section class="welcome-panel">
      <div class="welcome-panel__content">
        <div class="welcome-panel__identity">
          <Avatar
            :size="52"
            :src="userStore.userInfo?.avatar || preferences.app.defaultAvatar"
          />
          <div>
            <p class="welcome-panel__date">{{ currentDateText }}</p>
            <h1>{{ greetingText }}，{{ displayName }}</h1>
            <p class="welcome-panel__description">
              先处理重要待办，再开始今天的工作。
            </p>
          </div>
        </div>
        <div class="welcome-panel__actions">
          <span class="welcome-panel__updated">{{ lastUpdatedText }}</span>
          <Button ghost :loading="refreshing" @click="refreshDashboard">
            <template #icon>
              <IconifyIcon icon="lucide:refresh-cw" />
            </template>
            刷新
          </Button>
        </div>
      </div>

      <div class="welcome-panel__focus">
        <div class="focus-icon">
          <IconifyIcon icon="lucide:check-check" />
        </div>
        <div>
          <span>今日工作焦点</span>
          <div class="focus-count">
            <Skeleton.Button
              v-if="totalPendingLoading"
              active
              size="small"
              style="width: 72px"
            />
            <strong v-else>{{
              totalPendingFailed ? '—' : totalPending
            }}</strong>
            <span>项待处理</span>
          </div>
          <button
            v-if="canViewBpmTasks"
            class="focus-link"
            type="button"
            @click="navigateTo('/bpm/task/todo')"
          >
            立即处理
            <IconifyIcon icon="lucide:arrow-right" />
          </button>
        </div>
      </div>
    </section>

    <section class="metrics-grid" aria-label="工作摘要">
      <button
        v-for="card in metricCards"
        :key="card.key"
        class="metric-card"
        type="button"
        :style="{ '--metric-color': card.color }"
        @click="navigateTo(card.path)"
      >
        <span class="metric-card__icon">
          <IconifyIcon :icon="card.icon" />
        </span>
        <span class="metric-card__body">
          <span class="metric-card__title">{{ card.title }}</span>
          <Skeleton.Button
            v-if="card.loading"
            active
            size="small"
            style="width: 56px"
          />
          <strong v-else>{{ card.value === null ? '—' : card.value }}</strong>
          <span class="metric-card__description">{{ card.description }}</span>
        </span>
        <IconifyIcon class="metric-card__arrow" icon="lucide:arrow-up-right" />
      </button>
    </section>

    <section class="dashboard-grid">
      <article class="home-card todo-card">
        <header class="home-card__header">
          <div>
            <div class="home-card__eyebrow">MY TASKS</div>
            <h2>待我处理</h2>
          </div>
          <Button
            v-if="canViewBpmTasks"
            type="link"
            @click="navigateTo('/bpm/task/todo')"
          >
            查看全部
            <IconifyIcon icon="lucide:chevron-right" />
          </Button>
        </header>

        <div v-if="loading.tasks" class="card-loading">
          <Skeleton
            v-for="item in 4"
            :key="item"
            active
            :paragraph="{ rows: 1 }"
          />
        </div>

        <div v-else-if="failed.tasks" class="card-empty">
          <Empty description="待办加载失败，请稍后重试" />
          <Button size="small" @click="loadTasks">重新加载</Button>
        </div>

        <div v-else-if="!canViewBpmTasks" class="card-empty">
          <Empty description="当前账号暂无流程待办权限" />
        </div>

        <div v-else-if="tasks.length === 0" class="card-empty">
          <Empty description="暂时没有待办，今天可以轻松一点" />
        </div>

        <div v-else class="todo-list">
          <button
            v-for="task in tasks"
            :key="task.id"
            class="todo-item"
            type="button"
            @click="openTask(task)"
          >
            <span class="todo-item__icon">
              <IconifyIcon icon="lucide:file-check-2" />
            </span>
            <span class="todo-item__content">
              <span class="todo-item__topline">
                <strong>{{ taskProcessName(task) }}</strong>
                <Tag :color="taskWaitingInfo(task).color">
                  {{ taskWaitingInfo(task).text }}
                </Tag>
              </span>
              <span class="todo-item__task">{{ task.name || '待办理' }}</span>
              <span class="todo-item__meta">
                <span>
                  <IconifyIcon icon="lucide:user-round" />
                  {{ taskStarterName(task) }}
                </span>
                <span>
                  <IconifyIcon icon="lucide:clock-3" />
                  {{ formatDateTime(task.createTime) }}
                </span>
              </span>
            </span>
            <span class="todo-item__action">
              办理
              <IconifyIcon icon="lucide:arrow-right" />
            </span>
          </button>
        </div>
      </article>

      <aside class="dashboard-sidebar">
        <article class="home-card information-card">
          <Tabs v-model:active-key="activeInformationTab" centered>
            <Tabs.TabPane key="notices">
              <template #tab>
                <span class="information-tab">
                  <IconifyIcon icon="lucide:megaphone" />
                  公告通知
                </span>
              </template>

              <div v-if="loading.notices" class="card-loading compact">
                <Skeleton
                  v-for="item in 3"
                  :key="item"
                  active
                  :paragraph="{ rows: 1 }"
                />
              </div>
              <div v-else-if="notices.length" class="information-list">
                <button
                  v-for="notice in notices"
                  :key="notice.id"
                  class="information-item"
                  type="button"
                  @click="openNotice(notice)"
                >
                  <span class="information-item__marker notice-marker">
                    <IconifyIcon icon="lucide:megaphone" />
                  </span>
                  <span class="information-item__content">
                    <span class="information-item__title-row">
                      <strong>{{ notice.title }}</strong>
                      <Tag :color="notice.type === 2 ? 'blue' : 'green'">
                        {{ noticeTypeLabel(notice.type) }}
                      </Tag>
                    </span>
                    <span class="information-item__preview">
                      {{ plainText(notice.content) || '点击查看公告详情' }}
                    </span>
                    <span class="information-item__time">
                      {{ formatDateTime(notice.createTime) }}
                    </span>
                  </span>
                </button>
              </div>
              <div v-else class="card-empty compact">
                <Empty
                  :description="
                    failed.notices ? '公告暂时不可用' : '暂无最新公告'
                  "
                />
              </div>
            </Tabs.TabPane>

            <Tabs.TabPane key="messages">
              <template #tab>
                <span class="information-tab">
                  <IconifyIcon icon="lucide:mail" />
                  我的消息
                  <span v-if="unreadMessageCount" class="tab-count">
                    {{ unreadMessageCount > 99 ? '99+' : unreadMessageCount }}
                  </span>
                </span>
              </template>

              <div v-if="loading.messages" class="card-loading compact">
                <Skeleton
                  v-for="item in 3"
                  :key="item"
                  active
                  :paragraph="{ rows: 1 }"
                />
              </div>
              <div v-else-if="unreadMessages.length" class="information-list">
                <button
                  v-for="message in unreadMessages"
                  :key="message.id"
                  class="information-item"
                  type="button"
                  @click="navigateTo('/system/notify-message')"
                >
                  <span class="information-item__marker message-marker">
                    <IconifyIcon icon="lucide:mail" />
                  </span>
                  <span class="information-item__content">
                    <span class="information-item__title-row">
                      <strong>{{
                        message.templateNickname || '系统消息'
                      }}</strong>
                      <span class="unread-dot"></span>
                    </span>
                    <span class="information-item__preview">
                      {{
                        plainText(message.templateContent) || '点击查看消息详情'
                      }}
                    </span>
                    <span class="information-item__time">
                      {{ formatDateTime(message.createTime) }}
                    </span>
                  </span>
                </button>
              </div>
              <div v-else class="card-empty compact">
                <Empty
                  :description="
                    failed.messages ? '消息暂时不可用' : '没有未读消息'
                  "
                />
              </div>
              <Button
                v-if="!loading.messages"
                block
                class="information-more"
                @click="navigateTo('/system/notify-message')"
              >
                查看全部消息
              </Button>
            </Tabs.TabPane>
          </Tabs>
        </article>

        <article class="home-card quick-card">
          <header class="home-card__header compact-header">
            <div>
              <div class="home-card__eyebrow">QUICK ACCESS</div>
              <h2>快捷入口</h2>
            </div>
          </header>
          <div class="quick-grid">
            <button
              v-for="entry in quickEntries"
              :key="entry.path"
              class="quick-entry"
              type="button"
              @click="navigateTo(entry.path)"
            >
              <span
                class="quick-entry__icon"
                :style="{
                  color: entry.color,
                  backgroundColor: `${entry.color}14`,
                }"
              >
                <IconifyIcon :icon="entry.icon" />
              </span>
              <span>
                <strong>{{ entry.title }}</strong>
                <small>{{ entry.description }}</small>
              </span>
            </button>
          </div>
        </article>

        <article class="home-card version-card">
          <header class="home-card__header compact-header">
            <div>
              <div class="home-card__eyebrow">SYSTEM VERSION</div>
              <h2>系统版本</h2>
            </div>
            <Tag :color="systemVersionStatus.color">
              {{ systemVersionStatus.text }}
            </Tag>
          </header>

          <div class="version-card__body">
            <div class="version-item">
              <span class="version-item__icon frontend-version-icon">
                <IconifyIcon icon="lucide:monitor-smartphone" />
              </span>
              <span class="version-item__content">
                <span class="version-item__label">前端构建版本</span>
                <code>{{ formatBuildVersion(frontendBuildInfo.version) }}</code>
                <span class="version-item__meta">
                  {{
                    formatBuildMetadata(
                      frontendBuildInfo.commit,
                      frontendBuildInfo.buildTime,
                    )
                  }}
                </span>
              </span>
            </div>

            <div v-if="loading.version" class="version-item">
              <span class="version-item__icon backend-version-icon">
                <IconifyIcon icon="lucide:server-cog" />
              </span>
              <span class="version-item__content version-item__loading">
                <Skeleton.Button active size="small" style="width: 152px" />
                <Skeleton.Button active size="small" style="width: 116px" />
              </span>
            </div>
            <div v-else-if="backendBuildInfo" class="version-item">
              <span class="version-item__icon backend-version-icon">
                <IconifyIcon icon="lucide:server-cog" />
              </span>
              <span class="version-item__content">
                <span class="version-item__label">后端运行版本</span>
                <code>{{ formatBuildVersion(backendBuildInfo.version) }}</code>
                <span class="version-item__meta">
                  {{
                    formatBuildMetadata(
                      backendBuildInfo.commit,
                      backendBuildInfo.buildTime,
                    )
                  }}
                </span>
              </span>
            </div>
            <div v-else class="version-item version-item--unavailable">
              <span class="version-item__icon unavailable-version-icon">
                <IconifyIcon icon="lucide:triangle-alert" />
              </span>
              <span class="version-item__content">
                <span class="version-item__label">后端运行版本</span>
                <strong>未上报</strong>
                <span class="version-item__meta">
                  {{
                    failed.version ? '后端尚未部署版本接口' : '等待版本信息返回'
                  }}
                </span>
              </span>
            </div>
          </div>
        </article>
      </aside>
    </section>

    <Modal
      v-model:open="noticeModalOpen"
      destroy-on-close
      :footer="null"
      :title="selectedNotice?.title || '公告详情'"
      :width="720"
    >
      <div v-if="selectedNotice" class="notice-detail">
        <div class="notice-detail__meta">
          <Tag :color="selectedNotice.type === 2 ? 'blue' : 'green'">
            {{ noticeTypeLabel(selectedNotice.type) }}
          </Tag>
          <span>{{ formatDateTime(selectedNotice.createTime) }}</span>
        </div>
        <div
          v-dompurify-html="selectedNotice.content"
          class="notice-detail__content"
        ></div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.dashboard-home {
  min-height: 100%;
  padding: 20px;
  color: hsl(var(--foreground));
}

.welcome-panel {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  min-height: 190px;
  overflow: hidden;
  color: #fff;
  background:
    radial-gradient(circle at 82% 16%, rgb(255 255 255 / 18%), transparent 24%),
    radial-gradient(circle at 62% 120%, rgb(34 211 238 / 34%), transparent 38%),
    linear-gradient(120deg, #173f91 0%, #2563eb 48%, #3b82f6 100%);
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 18px;
  box-shadow: 0 18px 50px rgb(30 64 175 / 20%);
}

.welcome-panel::before,
.welcome-panel::after {
  position: absolute;
  content: '';
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 999px;
}

.welcome-panel::before {
  right: 170px;
  bottom: -145px;
  width: 360px;
  height: 360px;
}

.welcome-panel::after {
  top: -110px;
  right: -60px;
  width: 270px;
  height: 270px;
}

.welcome-panel__content {
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
  padding: 30px 34px 28px;
}

.welcome-panel__identity {
  display: flex;
  gap: 16px;
  align-items: center;
}

.welcome-panel__identity :deep(.ant-avatar) {
  flex: none;
  border: 2px solid rgb(255 255 255 / 75%);
  box-shadow: 0 8px 24px rgb(15 23 42 / 24%);
}

.welcome-panel__date {
  margin: 0 0 5px;
  font-size: 13px;
  color: rgb(255 255 255 / 76%);
}

.welcome-panel h1 {
  margin: 0;
  font-size: clamp(24px, 2vw, 32px);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
}

.welcome-panel__description {
  margin: 7px 0 0;
  font-size: 14px;
  color: rgb(255 255 255 / 78%);
}

.welcome-panel__actions {
  display: flex;
  gap: 14px;
  align-items: center;
}

.welcome-panel__updated {
  font-size: 12px;
  color: rgb(255 255 255 / 68%);
}

.welcome-panel__focus {
  z-index: 1;
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 30px;
  background: rgb(8 31 79 / 20%);
  border-left: 1px solid rgb(255 255 255 / 12%);
  backdrop-filter: blur(8px);
}

.focus-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 48px;
  height: 48px;
  font-size: 24px;
  color: #dbeafe;
  background: rgb(255 255 255 / 14%);
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 14px;
}

.welcome-panel__focus > div:last-child > span {
  font-size: 13px;
  color: rgb(255 255 255 / 70%);
}

.focus-count {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-top: 5px;
}

.focus-count strong {
  font-size: 34px;
  line-height: 1;
}

.focus-count > span {
  font-size: 13px;
  color: rgb(255 255 255 / 74%);
}

.focus-link {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 0;
  margin-top: 12px;
  font-size: 13px;
  color: #fff;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.metric-card {
  position: relative;
  display: flex;
  gap: 14px;
  align-items: center;
  min-width: 0;
  padding: 18px;
  color: hsl(var(--foreground));
  text-align: left;
  cursor: pointer;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border) / 78%);
  border-radius: 14px;
  box-shadow: 0 4px 14px rgb(15 23 42 / 4%);
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.metric-card:hover {
  border-color: color-mix(in srgb, var(--metric-color) 38%, transparent);
  box-shadow: 0 12px 28px rgb(15 23 42 / 8%);
  transform: translateY(-2px);
}

.metric-card__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 48px;
  height: 48px;
  font-size: 23px;
  color: var(--metric-color);
  background: color-mix(in srgb, var(--metric-color) 10%, transparent);
  border-radius: 14px;
}

.metric-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.metric-card__title {
  margin-bottom: 1px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.metric-card__body strong {
  font-size: 27px;
  line-height: 1.25;
}

.metric-card__description {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.metric-card__arrow {
  position: absolute;
  top: 14px;
  right: 14px;
  font-size: 15px;
  color: hsl(var(--muted-foreground) / 55%);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.85fr) minmax(340px, 1fr);
  gap: 16px;
  align-items: start;
  margin-top: 16px;
}

.dashboard-sidebar {
  display: grid;
  gap: 16px;
}

.home-card {
  overflow: hidden;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border) / 78%);
  border-radius: 14px;
  box-shadow: 0 4px 14px rgb(15 23 42 / 4%);
}

.home-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 22px 16px;
  border-bottom: 1px solid hsl(var(--border) / 65%);
}

.home-card__header h2 {
  margin: 1px 0 0;
  font-size: 18px;
  font-weight: 650;
}

.home-card__eyebrow {
  font-size: 10px;
  font-weight: 700;
  color: #2563eb;
  letter-spacing: 0.13em;
}

.compact-header {
  padding-bottom: 13px;
}

.card-loading {
  display: grid;
  gap: 10px;
  padding: 20px 22px;
}

.card-loading.compact {
  min-height: 286px;
  padding: 10px 4px;
}

.card-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 360px;
}

.card-empty.compact {
  min-height: 270px;
}

.todo-list {
  padding: 4px 10px 10px;
}

.todo-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 13px;
  align-items: center;
  width: 100%;
  padding: 15px 12px;
  color: hsl(var(--foreground));
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-bottom: 1px solid hsl(var(--border) / 58%);
  border-radius: 10px;
  transition:
    background 140ms ease,
    transform 140ms ease;
}

.todo-item:last-child {
  border-bottom-color: transparent;
}

.todo-item:hover {
  background: hsl(var(--muted) / 42%);
  transform: translateX(2px);
}

.todo-item__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  font-size: 19px;
  color: #2563eb;
  background: rgb(37 99 235 / 9%);
  border-radius: 12px;
}

.todo-item__content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.todo-item__topline {
  display: flex;
  gap: 8px;
  align-items: center;
}

.todo-item__topline strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  white-space: nowrap;
}

.todo-item__topline :deep(.ant-tag) {
  flex: none;
  margin-inline-end: 0;
  font-size: 11px;
}

.todo-item__task {
  margin-top: 3px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.todo-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 7px;
  font-size: 11px;
  color: hsl(var(--muted-foreground) / 82%);
}

.todo-item__meta span {
  display: inline-flex;
  gap: 5px;
  align-items: center;
}

.todo-item__action {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  font-size: 12px;
  color: #2563eb;
}

.information-card {
  min-height: 390px;
  padding: 0 18px 16px;
}

.information-card :deep(.ant-tabs-nav) {
  margin-bottom: 8px;
}

.information-tab {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 10px;
  color: #fff;
  background: #ef4444;
  border-radius: 999px;
}

.information-list {
  display: grid;
}

.information-item {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 10px;
  width: 100%;
  padding: 12px 4px;
  color: hsl(var(--foreground));
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-bottom: 1px solid hsl(var(--border) / 55%);
}

.information-item:last-child {
  border-bottom: 0;
}

.information-item:hover strong {
  color: #2563eb;
}

.information-item__marker {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  font-size: 16px;
  border-radius: 10px;
}

.notice-marker {
  color: #2563eb;
  background: rgb(37 99 235 / 9%);
}

.message-marker {
  color: #7c3aed;
  background: rgb(124 58 237 / 9%);
}

.information-item__content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.information-item__title-row {
  display: flex;
  gap: 7px;
  align-items: center;
}

.information-item__title-row strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  white-space: nowrap;
  transition: color 140ms ease;
}

.information-item__title-row :deep(.ant-tag) {
  flex: none;
  margin-inline-end: 0;
  font-size: 10px;
  line-height: 18px;
}

.information-item__preview {
  display: -webkit-box;
  margin-top: 3px;
  overflow: hidden;
  -webkit-line-clamp: 1;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  -webkit-box-orient: vertical;
}

.information-item__time {
  margin-top: 4px;
  font-size: 10px;
  color: hsl(var(--muted-foreground) / 72%);
}

.unread-dot {
  flex: none;
  width: 6px;
  height: 6px;
  background: #ef4444;
  border-radius: 999px;
}

.information-more {
  margin-top: 12px;
}

.version-card__body {
  display: grid;
  padding: 4px 20px 10px;
}

.version-item {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 14px 0;
}

.version-item + .version-item {
  border-top: 1px solid hsl(var(--border) / 58%);
}

.version-item__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  font-size: 17px;
  border-radius: 10px;
}

.frontend-version-icon {
  color: #2563eb;
  background: rgb(37 99 235 / 9%);
}

.backend-version-icon {
  color: #0f766e;
  background: rgb(15 118 110 / 10%);
}

.unavailable-version-icon {
  color: #d97706;
  background: rgb(217 119 6 / 10%);
}

.version-item__content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.version-item__label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.version-item code,
.version-item strong {
  display: block;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.45;
  white-space: nowrap;
}

.version-item__meta {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground) / 78%);
  white-space: nowrap;
}

.version-item__loading {
  gap: 6px;
  padding-top: 2px;
}

.version-item__loading :deep(.ant-skeleton-button) {
  height: 16px;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 12px;
}

.quick-entry {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  min-width: 0;
  padding: 10px;
  color: hsl(var(--foreground));
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  transition:
    background 140ms ease,
    border-color 140ms ease;
}

.quick-entry:hover {
  background: hsl(var(--muted) / 36%);
  border-color: hsl(var(--border) / 72%);
}

.quick-entry__icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  font-size: 18px;
  border-radius: 10px;
}

.quick-entry strong,
.quick-entry small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-entry strong {
  font-size: 12px;
}

.quick-entry small {
  margin-top: 2px;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.notice-detail__meta {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-bottom: 14px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  border-bottom: 1px solid hsl(var(--border));
}

.notice-detail__content {
  max-height: 62vh;
  padding: 18px 2px 4px;
  overflow: auto;
  font-size: 14px;
  line-height: 1.8;
}

.notice-detail__content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

@media (max-width: 1280px) {
  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard-grid {
    grid-template-columns: minmax(0, 1.55fr) minmax(320px, 1fr);
  }
}

@media (max-width: 980px) {
  .welcome-panel {
    grid-template-columns: 1fr;
  }

  .welcome-panel__focus {
    padding: 20px 30px;
    border-top: 1px solid rgb(255 255 255 / 12%);
    border-left: 0;
  }

  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .dashboard-home {
    padding: 12px;
  }

  .welcome-panel__content {
    padding: 24px 20px;
  }

  .welcome-panel__identity {
    align-items: flex-start;
  }

  .welcome-panel__actions {
    justify-content: space-between;
    margin-top: 24px;
  }

  .welcome-panel__focus {
    padding: 18px 20px;
  }

  .metrics-grid {
    grid-template-columns: 1fr;
  }

  .metric-card {
    padding: 15px;
  }

  .todo-item {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .todo-item__icon {
    width: 36px;
    height: 36px;
  }

  .todo-item__action {
    display: none;
  }

  .quick-grid {
    grid-template-columns: 1fr;
  }
}
</style>
