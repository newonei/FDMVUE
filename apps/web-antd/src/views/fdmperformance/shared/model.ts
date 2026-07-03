import type { SimpleFlowNode } from '#/views/bpm/components/simple-process-design';

import { BpmNodeTypeEnum } from '@vben/constants';

export type BatchStatus =
  | 'canceled'
  | 'executing'
  | 'finished'
  | 'hrReview'
  | 'indicatorConfirm'
  | 'pendingPublish'
  | 'resultVisible'
  | 'scoring';

export type InstanceStatus =
  | 'canceled'
  | 'executing'
  | 'finished'
  | 'hrReview'
  | 'indicatorConfirm'
  | 'pendingPublish'
  | 'resultVisible'
  | 'selfScore'
  | 'supervisorScore';

export interface Employee {
  dept: string;
  id: number;
  managerId?: number;
  name: string;
  post: string;
}

export interface Indicator {
  dimension: string;
  dimensionId?: number;
  dimensionType?: number;
  dimensionWeight?: number;
  id: number;
  name: string;
  scoreMode: string;
  standard: string;
  status: 'enabled' | 'stopped';
  tags: string[];
  templateIndicatorId?: number;
  weight: number;
}

export interface ParticipantScope {
  deptNames: string[];
  mode: 'department' | 'people' | 'role' | 'userGroup';
  peopleIds: number[];
  roleNames: string[];
  userGroupNames: string[];
}

export interface AssessmentTemplate {
  admins: string[];
  autoLaunch: boolean;
  customDimensions?: string[];
  flowNode: SimpleFlowNode;
  group: string;
  id: number;
  indicatorIds: number[];
  name: string;
  participantScope?: ParticipantScope;
  participants: number[];
  periodType: string;
  scorerRules?: Record<number, string>;
  scorerStrategy?: 'byIndicator' | 'unified';
  scoringRule: string;
  status: 'draft' | 'enabled';
  updatedAt: string;
}

export interface IndicatorScoreState {
  attachmentIds?: string;
  final?: number;
  histories?: Record<string, { comment?: string; score?: number }>;
  remark?: string;
  self?: number;
  scoreComment?: string;
  supervisor?: number;
}

export interface ScoreSummary {
  comment?: string;
  nodeKey?: string;
  nodeName?: string;
  scoreWeight?: number;
  scorerRoleType?: number;
  scorerUserId?: number;
  submitTime?: string;
  taskId?: number;
  taskType?: number;
  totalScore?: number;
}

export interface InterviewRecord {
  conclusion: string;
  createdAt: string;
  id: number;
  owner: string;
}

export interface FlowStage {
  id: string;
  name: string;
  owner: string;
}

export interface AssessmentInstance {
  currentExecutor?: string;
  employeeId: number;
  finalScore?: number;
  flowSnapshot?: FlowStage[];
  grade?: string;
  id: number;
  indicatorScores?: Record<number, IndicatorScoreState>;
  interviewRecords?: InterviewRecord[];
  nodeName: string;
  progress: number;
  resultConfirmed?: boolean;
  resultObjection?: string;
  resultVisible: boolean;
  scoreSummaries?: ScoreSummary[];
  selfScore?: number;
  status: InstanceStatus;
  stayTime: string;
  supervisorScore?: number;
  templateId?: number;
}

export interface AssessmentBatch {
  id: number;
  instances: AssessmentInstance[];
  name: string;
  period: string;
  status: BatchStatus;
  templateId: number;
}

export interface GoalMapItem {
  dept: string;
  id: number;
  linkedIndicators: number[];
  name: string;
  owner: string;
  progress: number;
  status: 'atRisk' | 'done' | 'normal';
  targetValue: string;
}

export type GoalMapDraft = Omit<GoalMapItem, 'id'> & { id?: number };

export interface ActionPlanTask {
  assignee: string;
  deadline: string;
  id: number;
  linkedGoalId?: number;
  linkedInstanceId?: number;
  name: string;
  progress: number;
  status: 'done' | 'failed' | 'pending' | 'processing';
}

export interface PerformanceDataRecord {
  avgScore: number;
  dept: string;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  headcount: number;
  published: number;
}

export const batchStatusMetaMap: Record<BatchStatus, { color: string; label: string }> = {
  canceled: { color: 'red', label: '已取消' },
  executing: { color: 'blue', label: '执行中' },
  finished: { color: 'green', label: '已结束' },
  hrReview: { color: 'purple', label: '人事审核' },
  indicatorConfirm: { color: 'cyan', label: '指标确认' },
  pendingPublish: { color: 'orange', label: '待公示' },
  resultVisible: { color: 'green', label: '已公示' },
  scoring: { color: 'gold', label: '评分中' },
};

export const instanceStatusMetaMap: Record<InstanceStatus, { color: string; label: string }> = {
  canceled: { color: 'red', label: '已取消' },
  executing: { color: 'blue', label: '执行中' },
  finished: { color: 'green', label: '已结束' },
  hrReview: { color: 'purple', label: '人事审核' },
  indicatorConfirm: { color: 'cyan', label: '指标确认' },
  pendingPublish: { color: 'orange', label: '待公示' },
  resultVisible: { color: 'green', label: '已公示' },
  selfScore: { color: 'gold', label: '员工自评' },
  supervisorScore: { color: 'orange', label: '主管评分' },
};

export const defaultTemplateFlowNode: SimpleFlowNode = {
  childNode: {
    childNode: {
      childNode: {
        childNode: {
          childNode: {
            id: 'EndEvent',
            name: '结束',
            type: BpmNodeTypeEnum.END_EVENT_NODE,
          },
          id: 'Performance_Result_Confirm',
          name: '结果确认',
          showText: '被考核人',
          type: BpmNodeTypeEnum.USER_TASK_NODE,
        },
        id: 'Performance_Hr_Approve',
        name: '人事审核',
        showText: '绩效管理员',
        type: BpmNodeTypeEnum.USER_TASK_NODE,
      },
      id: 'Performance_Manager_Score',
      name: '主管评分',
      showText: '直接主管',
      type: BpmNodeTypeEnum.USER_TASK_NODE,
    },
    id: 'Performance_Self_Score',
    name: '员工自评',
    showText: '被考核人',
    type: BpmNodeTypeEnum.USER_TASK_NODE,
  },
  id: 'StartUserNode',
  name: '发起人',
  type: BpmNodeTypeEnum.START_USER_NODE,
};
