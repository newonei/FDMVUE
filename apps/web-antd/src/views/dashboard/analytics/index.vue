<script lang="ts" setup>
import type { WorkGroup, WorkItem, WorkLink } from './model';

import type { FdmDashboardApi } from '#/api/fdmdata/dashboard';
import type { PortalDepartment } from '#/api/fdmplatform/portal';
import type { SystemNotifyMessageApi } from '#/api/system/notify/message';

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
  Segmented,
  Skeleton,
  Tabs,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { getTaskTodoPage } from '#/api/bpm/task';
import { getDingTalkApprovalTodoCount } from '#/api/fdmdingtalk/approval';
import {
  getFdmDashboardBuildInfo,
  getFdmDashboardPublishedNoticePage,
} from '#/api/fdmdata/dashboard';
import { getApprovalTasks } from '#/api/fdmplatform/approval-inbox';
import { getPortalSummary } from '#/api/fdmplatform/portal';
import { getNoticePage } from '#/api/system/notice';
import {
  getUnreadNotifyMessageCount,
  getUnreadNotifyMessageList,
} from '#/api/system/notify/message';

import { sum } from '../shared/format';
import {
  approvalItems,
  bpmItems,
  DEPARTMENT_LABELS,
  greetingText,
  plainText,
  PORTAL_PERMISSIONS,
  portalItems,
  sortWork,
  summaryLine,
  workCount,
} from './model';

defineOptions({ name: 'DashboardHome' });

interface QuickEntry {
  icon: string;
  path: string;
  permissions?: string[];
  title: string;
}

const router = useRouter();
const userStore = useUserStore();
const { hasAccessByCodes } = useAccess();
const frontendBuildInfo = useBuildInfo(import.meta.env, import.meta.env.PROD);

const can = {
  approvalInbox: computed(() =>
    hasAccessByCodes(['fdmplatform:approval-inbox:query']),
  ),
  bpm: computed(() => hasAccessByCodes(['bpm:task:query'])),
  dingTalk: computed(() => hasAccessByCodes(['fdmdingtalk:approval:query'])),
  notices: computed(() => hasAccessByCodes(['system:notice:query'])),
};

const portals = computed(() =>
  (Object.keys(PORTAL_PERMISSIONS) as PortalDepartment[]).filter(
    (department) => hasAccessByCodes([PORTAL_PERMISSIONS[department]]),
  ),
);

const loading = reactive({
  messages: false,
  notices: false,
  work: false,
});
const failed = reactive({
  bpm: false,
  dingTalk: false,
  messages: false,
  notices: false,
  version: false,
});

const bpmWork = ref<WorkItem[]>([]);
const bpmTotal = ref(0);
const approvalWork = ref<WorkItem[]>([]);
const approvalTotal = ref(0);
const businessWork = ref<WorkItem[]>([]);
const failedPortals = ref<PortalDepartment[]>([]);
const dingTalkCount = ref(0);
const unreadCount = ref(0);
const unreadMessages = ref<SystemNotifyMessageApi.NotifyMessage[]>([]);
const notices = ref<FdmDashboardApi.Notice[]>([]);
const backendBuildInfo = ref<FdmDashboardApi.BuildInfo | null>(null);
const lastUpdatedAt = ref<null | number>(null);
const refreshing = ref(false);
const loadedOnce = ref(false);
const activeGroup = ref<'all' | WorkGroup>('all');
const infoTab = ref<'messages' | 'notices'>('notices');
const selectedNotice = ref<FdmDashboardApi.Notice | null>(null);
const noticeOpen = ref(false);
const now = ref(dayjs());

const displayName = computed(
  () => userStore.userInfo?.nickname || userStore.userInfo?.username || '同事',
);
const dateText = computed(() => {
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][now.value.day()];
  return `${now.value.format('YYYY年M月D日')} · 星期${weekday}`;
});

const approvalCount = computed(() => bpmTotal.value + approvalTotal.value);
const businessCount = computed(() =>
  sum(businessWork.value.map((item) => workCount(item))),
);
const totalCount = computed(
  () => approvalCount.value + businessCount.value + dingTalkCount.value,
);

const allWork = computed(() =>
  sortWork([...bpmWork.value, ...approvalWork.value, ...businessWork.value]),
);
const visibleWork = computed(() =>
  activeGroup.value === 'all'
    ? allWork.value
    : allWork.value.filter((item) => item.group === activeGroup.value),
);
const groupOptions = computed(() => [
  { label: `全部 ${approvalCount.value + businessCount.value}`, value: 'all' },
  { label: `审批 ${approvalCount.value}`, value: 'approval' },
  { label: `部门待办 ${businessCount.value}`, value: 'business' },
]);

const longestWaitDays = computed(() => {
  const created = [...bpmWork.value, ...approvalWork.value]
    .map((item) => item.rank)
    .filter((rank) => rank > -1_000_000);
  const hours = created.length > 0 ? -Math.min(...created) : 0;
  return Math.floor(hours / 24);
});

const summary = computed(() =>
  summaryLine({
    approvals: approvalCount.value,
    business: businessCount.value,
    dingTalk: dingTalkCount.value,
    longestWaitDays: longestWaitDays.value,
    unread: unreadCount.value,
  }),
);

interface StatTile {
  key: string;
  label: string;
  value: number | string;
  hint: string;
  icon: string;
  link: WorkLink;
}

const stats = computed<StatTile[]>(() => {
  const tiles: StatTile[] = [];
  if (can.bpm.value || can.approvalInbox.value) {
    tiles.push({
      hint:
        failed.bpm && can.bpm.value
          ? '流程服务暂不可用'
          : `流程 ${bpmTotal.value} · 业务单据 ${approvalTotal.value}`,
      icon: 'lucide:stamp',
      key: 'approval',
      label: '待我审批',
      link: { path: can.bpm.value ? '/bpm/task/todo' : '/fdmprocurement/platform-approvals' },
      value: approvalCount.value,
    });
  }
  if (portals.value.length > 0) {
    tiles.push({
      hint: portals.value.map((key) => DEPARTMENT_LABELS[key]).join(' · '),
      icon: 'lucide:list-todo',
      key: 'business',
      label: '部门待办',
      link: { path: portalPath(portals.value[0]!) },
      value: businessCount.value,
    });
  }
  if (can.dingTalk.value) {
    tiles.push({
      hint: failed.dingTalk ? '钉钉服务暂不可用' : '全部模板待我审批',
      icon: 'lucide:clipboard-check',
      key: 'dingtalk',
      label: '钉钉待审',
      link: { path: '/caiwu/dingtalk-approval' },
      value: failed.dingTalk ? '—' : dingTalkCount.value,
    });
  }
  tiles.push({
    hint: failed.messages ? '消息服务暂不可用' : '站内通知与提醒',
    icon: 'lucide:bell',
    key: 'messages',
    label: '未读消息',
    link: { path: '/system/notify-message' },
    value: failed.messages ? '—' : unreadCount.value,
  });
  return tiles;
});

function portalPath(department: PortalDepartment) {
  const base: Record<PortalDepartment, string> = {
    domestic: '/neixiao',
    finance: '/caiwu',
    purchase: '/fdmprocurement',
    trade: '/fdmwaimao',
  };
  return `${base[department]}/platform-portal`;
}

const allQuickEntries = computed<QuickEntry[]>(() => [
  ...portals.value.map((department) => ({
    icon: 'lucide:door-open',
    path: portalPath(department),
    title: `${DEPARTMENT_LABELS[department]}门户`,
  })),
  { icon: 'lucide:building-2', path: '/dashboard/workspace', title: '公司看板' },
  {
    icon: 'lucide:circle-play',
    path: '/bpm/process-instance/create',
    permissions: ['bpm:process-instance:create'],
    title: '发起流程',
  },
  {
    icon: 'lucide:receipt',
    path: '/fdmexpense/platform-expenses',
    permissions: ['fdmplatform:expense:query'],
    title: '费用报销',
  },
  {
    icon: 'lucide:chart-no-axes-combined',
    path: '/fdmperformance/my',
    permissions: ['fdmperformance:assessment:query'],
    title: '我的绩效',
  },
  {
    icon: 'lucide:hammer',
    path: '/gongchang/workbench',
    permissions: ['fdmgongchang:workbench:use'],
    title: '工厂工作台',
  },
  {
    icon: 'lucide:sparkles',
    path: '/fdmcreative/workbench',
    permissions: ['fdmcreative:project:query'],
    title: '智能创作',
  },
  {
    icon: 'lucide:shopping-cart',
    path: '/fdmdata/ec-shop-daily/summary',
    permissions: ['fdmdata:ec-shop-daily:query'],
    title: '电商经营',
  },
  { icon: 'lucide:mail', path: '/system/notify-message', title: '我的消息' },
]);

const quickEntries = computed(() =>
  allQuickEntries.value
    .filter((entry) => !entry.permissions || hasAccessByCodes(entry.permissions))
    .slice(0, 8),
);

function formatTime(value?: Date | number | string) {
  if (value === undefined || value === null || value === '') return '';
  const parsed = dayjs(value);
  if (!parsed.isValid()) return '';
  return parsed.isSame(now.value, 'day')
    ? parsed.format('HH:mm')
    : parsed.format('MM-DD HH:mm');
}

function versionText(value?: string) {
  return !value || value === 'local' ? '本地开发' : value;
}

function commitText(commit?: string, buildTime?: string) {
  if (!commit || commit === 'local') return '本地构建';
  const parsed = dayjs(buildTime);
  return `${commit.slice(0, 8)}${parsed.isValid() ? ` · ${parsed.format('MM-DD HH:mm')}` : ''}`;
}

function go(link: WorkLink) {
  void router.push(link.name ? { name: link.name, query: link.query } : link);
}

function openNotice(notice: FdmDashboardApi.Notice) {
  selectedNotice.value = notice;
  noticeOpen.value = true;
}

async function loadWork() {
  const time = Date.now();
  failed.bpm = false;
  failed.dingTalk = false;
  const [bpm, approvals, dingTalk, ...portalResults] = await Promise.allSettled([
    can.bpm.value
      ? getTaskTodoPage({ pageNo: 1, pageSize: 8 })
      : Promise.resolve(null),
    can.approvalInbox.value
      ? getApprovalTasks({
          pageNo: 1,
          pageSize: 8,
          scope: 'assigned',
          status: 'OPEN',
        })
      : Promise.resolve(null),
    can.dingTalk.value ? getDingTalkApprovalTodoCount() : Promise.resolve(null),
    ...portals.value.map((department) => getPortalSummary(department)),
  ]);
  if (bpm.status === 'fulfilled' && bpm.value) {
    bpmWork.value = bpmItems(bpm.value.list ?? [], time);
    bpmTotal.value = Number(bpm.value.total || 0);
  } else {
    failed.bpm = bpm.status === 'rejected';
    bpmWork.value = [];
    bpmTotal.value = 0;
  }
  if (approvals.status === 'fulfilled' && approvals.value) {
    approvalWork.value = approvalItems(approvals.value.list ?? [], time);
    approvalTotal.value = Number(approvals.value.total || 0);
  } else {
    approvalWork.value = [];
    approvalTotal.value = 0;
  }
  if (dingTalk.status === 'fulfilled') {
    dingTalkCount.value = Number(dingTalk.value?.count || 0);
  } else {
    failed.dingTalk = true;
    dingTalkCount.value = 0;
  }
  const business: WorkItem[] = [];
  const portalFailures: PortalDepartment[] = [];
  portalResults.forEach((result, index) => {
    const department = portals.value[index]!;
    if (result.status === 'fulfilled') {
      business.push(...portalItems(department, result.value));
    } else {
      portalFailures.push(department);
    }
  });
  businessWork.value = business;
  failedPortals.value = portalFailures;
}

async function loadMessages() {
  failed.messages = false;
  loading.messages = true;
  try {
    const [count, list] = await Promise.all([
      getUnreadNotifyMessageCount(),
      getUnreadNotifyMessageList(),
    ]);
    unreadCount.value = Number(count || 0);
    unreadMessages.value = (list || []).slice(0, 5);
  } catch {
    failed.messages = true;
    unreadCount.value = 0;
    unreadMessages.value = [];
  } finally {
    loading.messages = false;
  }
}

async function loadNotices() {
  failed.notices = false;
  loading.notices = true;
  try {
    const result = await getFdmDashboardPublishedNoticePage({
      pageNo: 1,
      pageSize: 5,
    });
    notices.value = result.list || [];
  } catch {
    // 兼容前后端分批更新：旧服务仅管理员拥有公告查询权限。
    if (can.notices.value) {
      try {
        const fallback = await getNoticePage({
          pageNo: 1,
          pageSize: 5,
          status: 0,
        });
        notices.value = fallback.list || [];
        return;
      } catch {
        // 由空状态承接，不阻断其他模块。
      }
    }
    failed.notices = true;
    notices.value = [];
  } finally {
    loading.notices = false;
  }
}

async function loadVersion() {
  failed.version = false;
  try {
    backendBuildInfo.value = await getFdmDashboardBuildInfo();
  } catch {
    failed.version = true;
    backendBuildInfo.value = null;
  }
}

async function refresh() {
  if (refreshing.value) return;
  refreshing.value = true;
  loading.work = true;
  now.value = dayjs();
  try {
    await Promise.allSettled([
      loadWork().finally(() => {
        loading.work = false;
      }),
      loadMessages(),
      loadNotices(),
      loadVersion(),
    ]);
    lastUpdatedAt.value = Date.now();
  } finally {
    refreshing.value = false;
    loadedOnce.value = true;
  }
}

onMounted(() => void refresh());
onActivated(() => {
  if (lastUpdatedAt.value && Date.now() - lastUpdatedAt.value > 60_000) {
    void refresh();
  }
});
</script>

<template>
  <div class="home">
    <header class="home-head">
      <div class="home-head__who">
        <Avatar
          :size="56"
          :src="userStore.userInfo?.avatar || preferences.app.defaultAvatar"
        />
        <div>
          <p class="home-eyebrow">{{ dateText }}</p>
          <h1>{{ greetingText(now.hour()) }}，{{ displayName }}</h1>
          <p class="home-lead">
            <template v-if="loadedOnce">{{ summary }}</template>
            <template v-else>正在整理你的待办…</template>
          </p>
        </div>
      </div>
      <div class="home-head__actions">
        <span v-if="lastUpdatedAt" class="home-updated">
          更新于 {{ dayjs(lastUpdatedAt).format('HH:mm') }}
        </span>
        <Button :loading="refreshing" @click="refresh">
          <template #icon><IconifyIcon icon="lucide:refresh-cw" /></template>
          刷新
        </Button>
      </div>
    </header>

    <section aria-label="待办概览" class="stat-strip">
      <button
        class="stat stat--total"
        type="button"
        @click="activeGroup = 'all'"
      >
        <span class="stat__label">待处理合计</span>
        <Skeleton.Button
          v-if="loading.work && !loadedOnce"
          active
          size="small"
          style="width: 64px"
        />
        <strong v-else class="stat__hero">{{ totalCount }}</strong>
        <span class="stat__hint">审批、部门待办与钉钉审批</span>
      </button>
      <button
        v-for="tile in stats"
        :key="tile.key"
        class="stat"
        type="button"
        @click="go(tile.link)"
      >
        <span class="stat__label">
          <IconifyIcon :icon="tile.icon" />
          {{ tile.label }}
        </span>
        <Skeleton.Button
          v-if="loading.work && !loadedOnce"
          active
          size="small"
          style="width: 48px"
        />
        <strong v-else class="stat__value">{{ tile.value }}</strong>
        <span class="stat__hint">{{ tile.hint }}</span>
      </button>
    </section>

    <section class="home-grid">
      <article class="panel work-panel">
        <header class="panel-head">
          <div>
            <h2>待我处理</h2>
            <p>等得最久的审批排在最前，点击直接办理</p>
          </div>
          <Segmented
            v-model:value="activeGroup"
            :options="groupOptions"
            size="small"
          />
        </header>

        <div v-if="loading.work && !loadedOnce" class="work-loading">
          <Skeleton
            v-for="item in 4"
            :key="item"
            active
            :paragraph="{ rows: 1 }"
            :title="false"
          />
        </div>

        <template v-else>
          <button
            v-if="dingTalkCount > 0 && activeGroup !== 'business'"
            class="work-banner"
            type="button"
            @click="go({ path: '/caiwu/dingtalk-approval' })"
          >
            <IconifyIcon icon="lucide:clipboard-check" />
            钉钉里还有 <strong>{{ dingTalkCount }}</strong> 项审批等你处理
            <IconifyIcon class="work-banner__go" icon="lucide:arrow-right" />
          </button>

          <ul v-if="visibleWork.length" class="work-list">
            <li v-for="item in visibleWork" :key="item.key">
              <button
                class="work-item"
                :class="{ 'work-item--hot': item.hot }"
                type="button"
                @click="go(item.link)"
              >
                <span
                  class="work-item__source"
                  :class="`work-item__source--${item.group}`"
                >
                  {{ item.source }}
                </span>
                <span class="work-item__body">
                  <span class="work-item__title">
                    <strong>{{ item.title }}</strong>
                    <span v-if="item.count" class="work-item__count">
                      {{ item.count }}
                    </span>
                  </span>
                  <small>{{ item.detail }}</small>
                </span>
                <span
                  v-if="item.wait"
                  class="wait"
                  :class="`wait--${item.wait.tone}`"
                >
                  <IconifyIcon icon="lucide:clock-3" />
                  {{ item.wait.text }}
                </span>
                <IconifyIcon class="work-item__go" icon="lucide:chevron-right" />
              </button>
            </li>
          </ul>

          <div v-else-if="dingTalkCount === 0" class="work-empty">
            <span class="work-empty__icon">
              <IconifyIcon icon="lucide:check-check" />
            </span>
            <strong>
              {{
                activeGroup === 'business' ? '部门待办都处理完了' : '没有待办'
              }}
            </strong>
            <small>新的审批和待办会出现在这里</small>
          </div>

          <footer class="work-foot">
            <span v-if="failed.bpm" class="work-foot__warn">
              <IconifyIcon icon="lucide:circle-alert" />
              流程待办读取失败
            </span>
            <span v-if="failedPortals.length" class="work-foot__warn">
              <IconifyIcon icon="lucide:circle-alert" />
              {{
                failedPortals.map((key) => DEPARTMENT_LABELS[key]).join('、')
              }}待办读取失败
            </span>
            <Button
              v-if="bpmTotal > bpmWork.length"
              size="small"
              type="link"
              @click="go({ path: '/bpm/task/todo' })"
            >
              全部 {{ bpmTotal }} 条流程待办
            </Button>
            <Button
              v-if="approvalTotal > approvalWork.length"
              size="small"
              type="link"
              @click="go({ path: '/fdmprocurement/platform-approvals' })"
            >
              全部 {{ approvalTotal }} 条业务审批
            </Button>
          </footer>
        </template>
      </article>

      <aside class="home-side">
        <article class="panel info-panel">
          <Tabs v-model:active-key="infoTab" size="small">
            <Tabs.TabPane key="notices" tab="公告通知">
              <div v-if="loading.notices && !loadedOnce" class="work-loading">
                <Skeleton
                  v-for="item in 3"
                  :key="item"
                  active
                  :paragraph="{ rows: 1 }"
                  :title="false"
                />
              </div>
              <ul v-else-if="notices.length" class="info-list">
                <li v-for="notice in notices" :key="notice.id">
                  <button
                    class="info-item"
                    type="button"
                    @click="openNotice(notice)"
                  >
                    <span class="info-item__title">
                      <Tag
                        class="info-item__tag"
                        :color="notice.type === 2 ? 'blue' : 'green'"
                      >
                        {{ notice.type === 2 ? '公告' : '通知' }}
                      </Tag>
                      <strong>{{ notice.title }}</strong>
                    </span>
                    <small>{{ plainText(notice.content) || '点击查看详情' }}</small>
                    <time>{{ formatTime(notice.createTime) }}</time>
                  </button>
                </li>
              </ul>
              <Empty
                v-else
                :description="failed.notices ? '公告暂时不可用' : '暂无公告'"
                :image="Empty.PRESENTED_IMAGE_SIMPLE"
              />
            </Tabs.TabPane>
            <Tabs.TabPane key="messages">
              <template #tab>
                未读消息
                <span v-if="unreadCount" class="tab-count">
                  {{ unreadCount > 99 ? '99+' : unreadCount }}
                </span>
              </template>
              <ul v-if="unreadMessages.length" class="info-list">
                <li v-for="message in unreadMessages" :key="message.id">
                  <button
                    class="info-item"
                    type="button"
                    @click="go({ path: '/system/notify-message' })"
                  >
                    <span class="info-item__title">
                      <span class="unread-dot"></span>
                      <strong>{{ message.templateNickname || '系统消息' }}</strong>
                    </span>
                    <small>{{
                      plainText(message.templateContent) || '点击查看详情'
                    }}</small>
                    <time>{{ formatTime(message.createTime) }}</time>
                  </button>
                </li>
              </ul>
              <Empty
                v-else
                :description="failed.messages ? '消息暂时不可用' : '没有未读消息'"
                :image="Empty.PRESENTED_IMAGE_SIMPLE"
              />
              <Button
                block
                class="info-more"
                @click="go({ path: '/system/notify-message' })"
              >
                查看全部消息
              </Button>
            </Tabs.TabPane>
          </Tabs>
        </article>

        <article class="panel">
          <header class="panel-head">
            <div><h2>常用功能</h2></div>
          </header>
          <div class="quick-grid">
            <button
              v-for="entry in quickEntries"
              :key="entry.path"
              class="quick"
              type="button"
              @click="go({ path: entry.path })"
            >
              <span class="quick__icon"><IconifyIcon :icon="entry.icon" /></span>
              <span>{{ entry.title }}</span>
            </button>
          </div>
        </article>

        <footer class="version">
          <span>
            前端 <code>{{ versionText(frontendBuildInfo.version) }}</code>
            {{ commitText(frontendBuildInfo.commit, frontendBuildInfo.buildTime) }}
          </span>
          <span v-if="backendBuildInfo">
            后端 <code>{{ versionText(backendBuildInfo.version) }}</code>
            {{ commitText(backendBuildInfo.commit, backendBuildInfo.buildTime) }}
          </span>
          <span v-else-if="failed.version">后端版本未上报</span>
        </footer>
      </aside>
    </section>

    <Modal
      v-model:open="noticeOpen"
      destroy-on-close
      :footer="null"
      :title="selectedNotice?.title || '公告详情'"
      :width="720"
    >
      <div v-if="selectedNotice" class="notice-detail">
        <div class="notice-detail__meta">
          <Tag :color="selectedNotice.type === 2 ? 'blue' : 'green'">
            {{ selectedNotice.type === 2 ? '公告' : '通知' }}
          </Tag>
          <span>{{ formatTime(selectedNotice.createTime) }}</span>
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
.home {
  --tone-bad: #d03b3b;
  --tone-warning: #9a6200;
  --tone-good: #006300;

  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
  padding: 20px;
  color: hsl(var(--foreground));
}

:global(.dark) .home {
  --tone-bad: #e66767;
  --tone-warning: #fab219;
  --tone-good: #0ca30c;
}

.home-head {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  justify-content: space-between;
}

.home-head__who {
  display: flex;
  gap: 16px;
  align-items: center;
}

.home-eyebrow {
  margin: 0 0 2px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.home-head h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 650;
}

.home-lead {
  margin: 4px 0 0;
  font-size: 14px;
  color: hsl(var(--muted-foreground));
}

.home-head__actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.home-updated {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

/* 概览条 */
.stat-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 16px 18px;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.stat:hover {
  border-color: hsl(var(--primary) / 45%);
  box-shadow: 0 10px 28px -18px hsl(var(--foreground) / 40%);
}

.stat:focus-visible,
.work-item:focus-visible,
.quick:focus-visible,
.info-item:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}

.stat--total {
  color: hsl(var(--primary-foreground));
  background: hsl(var(--primary));
  border-color: transparent;
}

.stat--total .stat__label,
.stat--total .stat__hint {
  color: hsl(var(--primary-foreground) / 80%);
}

.stat__label {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.stat__hero {
  font-size: 34px;
  font-weight: 700;
  line-height: 1.1;
}

.stat__value {
  font-size: 26px;
  font-weight: 650;
  line-height: 1.15;
}

.stat__hint {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

/* 主体 */
.home-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(320px, 1fr);
  gap: 16px;
  align-items: start;
}

.home-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.panel {
  min-width: 0;
  padding: 18px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
}

.panel-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
}

.panel-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.panel-head p {
  margin: 2px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.work-panel {
  min-height: 420px;
}

.work-loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.work-banner {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 10px 14px;
  margin-bottom: 10px;
  font: inherit;
  font-size: 13px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: hsl(var(--primary) / 8%);
  border: 1px solid hsl(var(--primary) / 20%);
  border-radius: 10px;
}

.work-banner strong {
  color: hsl(var(--primary));
}

.work-banner__go {
  margin-left: auto;
  color: hsl(var(--primary));
}

.work-list {
  display: flex;
  flex-direction: column;
  padding: 0;
  margin: 0;
  list-style: none;
}

.work-list li + li {
  border-top: 1px solid hsl(var(--border) / 70%);
}

.work-item {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto 16px;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 12px 8px;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 10px;
}

.work-item:hover {
  background: hsl(var(--accent) / 70%);
}

.work-item__source {
  justify-self: start;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  border-radius: 6px;
}

.work-item__source--approval {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}

.work-item__source--business {
  color: hsl(var(--foreground) / 75%);
  background: hsl(var(--accent));
}

.work-item__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.work-item__title {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.work-item__title strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.work-item__count {
  flex-shrink: 0;
  min-width: 22px;
  padding: 0 7px;
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
  text-align: center;
  background: hsl(var(--accent));
  border-radius: 999px;
}

.work-item--hot .work-item__count {
  color: #fff;
  background: var(--tone-bad);
}

.work-item__body small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.wait {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.wait--warning {
  font-weight: 600;
  color: var(--tone-warning);
}

.wait--critical {
  font-weight: 600;
  color: var(--tone-bad);
}

.work-item__go {
  color: hsl(var(--muted-foreground));
}

.work-empty {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  text-align: center;
}

.work-empty__icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin-bottom: 8px;
  font-size: 24px;
  color: var(--tone-good);
  background: hsl(var(--accent));
  border-radius: 50%;
}

.work-empty small {
  color: hsl(var(--muted-foreground));
}

.work-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: center;
  justify-content: flex-end;
  margin-top: 8px;
}

.work-foot:empty {
  display: none;
}

.work-foot__warn {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  margin-right: auto;
  font-size: 12px;
  color: var(--tone-warning);
}

/* 公告与消息 */
.info-panel {
  padding-top: 8px;
}

.info-list {
  display: flex;
  flex-direction: column;
  padding: 0;
  margin: 0;
  list-style: none;
}

.info-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 12px;
  width: 100%;
  padding: 10px 6px;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 8px;
}

.info-item:hover {
  background: hsl(var(--accent) / 70%);
}

.info-item__title {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.info-item__title strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.info-item__tag {
  margin: 0;
}

.info-item small {
  grid-column: 1 / -1;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.info-item time {
  grid-row: 1;
  grid-column: 2;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.unread-dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  background: hsl(var(--primary));
  border-radius: 50%;
}

.tab-count {
  padding: 0 6px;
  margin-left: 4px;
  font-size: 11px;
  color: #fff;
  background: var(--tone-bad);
  border-radius: 999px;
}

.info-more {
  margin-top: 10px;
}

/* 常用功能 */
.quick-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.quick {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  padding: 10px 4px;
  font: inherit;
  font-size: 12px;
  color: inherit;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 10px;
}

.quick:hover {
  background: hsl(var(--accent) / 70%);
}

.quick__icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  font-size: 18px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
  border-radius: 10px;
}

.version {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 4px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.version code {
  padding: 0 4px;
  font-size: 11px;
  background: hsl(var(--accent));
  border-radius: 4px;
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

@media (max-width: 1100px) {
  .home-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .home {
    padding: 12px;
  }

  .work-item {
    grid-template-columns: minmax(0, 1fr) 16px;
  }

  .work-item__source,
  .wait {
    display: none;
  }

  .quick-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
