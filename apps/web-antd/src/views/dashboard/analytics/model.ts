import type { BpmTaskApi } from '#/api/bpm/task';
import type { ApprovalTask } from '#/api/fdmplatform/approval-inbox';
import type {
  PortalDepartment,
  PortalSummary,
} from '#/api/fdmplatform/portal';

import { portalDefinitions } from '#/views/fdmplatform/portal/model';

export type WorkGroup = 'approval' | 'business';
export type WaitTone = 'critical' | 'fresh' | 'normal' | 'warning';

export interface WorkLink {
  name?: string;
  path?: string;
  query?: Record<string, string>;
}

/** 首页“待我处理”里的一行：流程审批、业务审批或部门待办。 */
export interface WorkItem {
  key: string;
  group: WorkGroup;
  source: string;
  title: string;
  detail: string;
  /** 部门待办是汇总数，审批是单条 */
  count?: number;
  hot?: boolean;
  wait?: { text: string; tone: WaitTone };
  /** 越小越靠前 */
  rank: number;
  link: WorkLink;
}

export const DEPARTMENT_LABELS: Record<PortalDepartment, string> = {
  domestic: '内销',
  finance: '财务',
  purchase: '采购',
  trade: '外贸',
};

export const PORTAL_PERMISSIONS: Record<PortalDepartment, string> = {
  domestic: 'fdmplatform:portal:domestic',
  finance: 'fdmplatform:portal:finance',
  purchase: 'fdmplatform:portal:purchase',
  trade: 'fdmplatform:portal:trade',
};

/** 历史待补齐、盘点导入不是今天要办的事，首页不列。 */
const SKIPPED_TODOS = new Set(['history', 'stocktake']);

export function waitInfo(
  createdAt: unknown,
  now: number,
): undefined | { hours: number; text: string; tone: WaitTone } {
  const time =
    typeof createdAt === 'number' ? createdAt : Date.parse(String(createdAt));
  if (!Number.isFinite(time) || time <= 0) return undefined;
  const hours = Math.max(0, Math.floor((now - time) / 3_600_000));
  if (hours < 1) return { hours, text: '刚刚到达', tone: 'fresh' };
  if (hours < 24) return { hours, text: `等待 ${hours} 小时`, tone: 'normal' };
  const days = Math.floor(hours / 24);
  if (days >= 7) return { hours, text: `等待 ${days} 天`, tone: 'critical' };
  if (days >= 3) return { hours, text: `等待 ${days} 天`, tone: 'warning' };
  return { hours, text: `等待 ${days} 天`, tone: 'normal' };
}

export function bpmItems(tasks: BpmTaskApi.Task[], now: number): WorkItem[] {
  return tasks.map((task) => {
    const wait = waitInfo(task.createTime, now);
    const starter = task.processInstance?.startUser?.nickname;
    return {
      detail: [task.name || '待办理', starter ? `${starter} 发起` : '']
        .filter(Boolean)
        .join(' · '),
      group: 'approval',
      key: `bpm-${task.id}`,
      link: {
        name: 'BpmProcessInstanceDetail',
        query: {
          id: String(task.processInstance?.id || task.processInstanceId || ''),
          taskId: String(task.id),
        },
      },
      rank: -(wait?.hours ?? 0),
      source: '流程审批',
      title: task.processInstance?.name || '流程待办',
      wait: wait && { text: wait.text, tone: wait.tone },
    };
  });
}

export function approvalItems(tasks: ApprovalTask[], now: number): WorkItem[] {
  return tasks.map((task) => {
    const wait = waitInfo(task.openedAt, now);
    return {
      detail: task.overdue ? '已超过处理时限' : '业务单据等待你审批',
      group: 'approval',
      hot: task.overdue,
      key: `approval-${task.id}`,
      link: { path: '/fdmprocurement/platform-approvals' },
      // 超时的排在所有审批前面
      rank: (task.overdue ? -1_000_000 : 0) - (wait?.hours ?? 0),
      source: '业务审批',
      title: task.title,
      wait: task.overdue
        ? { text: '已超时', tone: 'critical' }
        : wait && { text: wait.text, tone: wait.tone },
    };
  });
}

export function portalItems(
  department: PortalDepartment,
  summary: PortalSummary,
): WorkItem[] {
  const definitions = new Map(
    portalDefinitions[department].todos.map((todo) => [todo.key, todo]),
  );
  return (summary.todos ?? [])
    .filter((todo) => !SKIPPED_TODOS.has(todo.key) && Number(todo.count) > 0)
    .flatMap((todo) => {
      const definition = definitions.get(todo.key);
      if (!definition) return [];
      const target = definition.target(todo);
      return [
        {
          count: Number(todo.count),
          detail: todo.preview || definition.empty,
          group: 'business' as const,
          hot: !!definition.hot,
          key: `${department}-${todo.key}`,
          link: { path: target.path, query: target.query },
          rank: definition.hot ? 0 : 1,
          source: DEPARTMENT_LABELS[department],
          title: definition.label,
        },
      ];
    });
}

/** 审批在前（等得久的在前），再是有钱或客户在等的部门待办。 */
export function sortWork(items: WorkItem[]): WorkItem[] {
  const groupOrder: Record<WorkGroup, number> = { approval: 0, business: 1 };
  return items.toSorted(
    (a, b) => groupOrder[a.group] - groupOrder[b.group] || a.rank - b.rank,
  );
}

export function workCount(item: WorkItem) {
  return item.count ?? 1;
}

/** 首页问候下面的一句话。 */
export function summaryLine(options: {
  approvals: number;
  business: number;
  dingTalk: number;
  longestWaitDays: number;
  unread: number;
}) {
  const total = options.approvals + options.business + options.dingTalk;
  if (total === 0) {
    return options.unread > 0
      ? `今天没有待办，有 ${options.unread} 条未读消息。`
      : '今天没有待办，可以专注推进手上的工作。';
  }
  const parts = [`今天有 ${total} 项待处理`];
  if (options.longestWaitDays >= 3) {
    parts.push(`最久的已等待 ${options.longestWaitDays} 天`);
  }
  if (options.unread > 0) parts.push(`${options.unread} 条未读消息`);
  return `${parts.join('，')}。`;
}

export function greetingText(hour: number) {
  if (hour < 6) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function plainText(value?: string) {
  return (value || '')
    .replaceAll(/<style[\s\S]*?<\/style>/gi, ' ')
    .replaceAll(/<script[\s\S]*?<\/script>/gi, ' ')
    .replaceAll(/<[^>]+>/g, ' ')
    .replaceAll(/&nbsp;|&#160;/gi, ' ')
    .replaceAll(/&amp;/gi, '&')
    .replaceAll(/\s+/g, ' ')
    .trim();
}
