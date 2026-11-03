import type {
  ApprovalNodeUser,
  ApprovalProgressNode,
  DocumentApprovalView,
} from '#/api/fdmplatform/document-approval';

export const USER_STATE_LABELS: Record<ApprovalNodeUser['state'], string> = {
  AGREE: '已同意',
  CANCELED: '无需审批',
  DONE: '已结束',
  REDIRECTED: '已转交',
  REFUSE: '已拒绝',
  RUNNING: '审批中',
  WAITING: '未开始',
};

export const NODE_STATE_LABELS: Record<ApprovalProgressNode['state'], string> =
  {
    AGREE: '已通过',
    CANCELED: '未执行',
    REFUSE: '已拒绝',
    RUNNING: '审批中',
    WAITING: '未开始',
  };

export const NODE_STATE_COLORS: Record<ApprovalProgressNode['state'], string> =
  {
    AGREE: 'green',
    CANCELED: 'gray',
    REFUSE: 'red',
    RUNNING: 'orange',
    WAITING: 'gray',
  };

export function nodeModeLabel(node: ApprovalProgressNode) {
  if (node.users.length <= 1) return '';
  return node.actionType === 'AND' ? '会签' : '或签';
}

/** 面板标题右侧的总体状态。 */
export function overallLabel(view: DocumentApprovalView) {
  if (view.status === 'STARTING')
    return view.lastError ? '发起失败，系统重试中' : '正在发起';
  if (view.status === 'CANCEL_REQUESTED' || view.status === 'CANCELLED')
    return '已撤回';
  if (view.status === 'STALE') return '已失效';
  switch (view.state) {
    case 'AGREED': {
      return '已通过';
    }
    case 'REFUSED': {
      return '已拒绝';
    }
    case 'TERMINATED': {
      return '已撤销';
    }
    default: {
      return '审批中';
    }
  }
}

/** 已办人数 / 总节点，像金智的 0/3。 */
export function progressText(view: DocumentApprovalView) {
  const done = view.nodes.filter((node) => node.state === 'AGREE').length;
  return `${done}/${view.nodes.length}`;
}

export function waitedText(from: number | undefined, now: number) {
  if (!from) return '';
  const minutes = Math.max(0, Math.floor((now - from) / 60_000));
  if (minutes < 60) return `已等待 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `已等待 ${hours} 小时 ${minutes % 60} 分钟`;
  return `已等待 ${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
}

export function timeText(value?: number) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 钉钉审批记录类型，未知类型原样显示。 */
export function recordLabel(type?: null | string, result?: null | string) {
  const value = String(type ?? '').toUpperCase();
  if (value === 'START_PROCESS_INSTANCE') return '发起审批';
  if (value === 'TERMINATE_PROCESS_INSTANCE') return '撤销审批';
  if (value === 'ADD_REMARK') return '评论';
  if (value === 'REDIRECT_TASK' || value === 'REDIRECT_PROCESS') return '转交';
  if (value.startsWith('EXECUTE_TASK')) {
    const decision = String(result ?? '').toUpperCase();
    if (decision === 'AGREE') return '同意';
    if (decision === 'REFUSE') return '拒绝';
    return '审批';
  }
  if (value === 'PROCESS_CC') return '抄送';
  return value || '记录';
}

/** 拒绝必须写原因；同意可以不写。 */
export function remarkProblem(agree: boolean, remark: string) {
  if (remark.trim().length > 1024) return '审批意见不能超过 1024 个字';
  if (!agree && !remark.trim()) return '拒绝时请填写原因';
  return '';
}
