export const PERIOD_OPTIONS = [
  { label: '月度', value: 'MONTH' },
  { label: '季度', value: 'QUARTER' },
  { label: '半年度', value: 'HALF_YEAR' },
  { label: '年度', value: 'YEAR' },
  { label: '试用期', value: 'PROBATION' },
];

export const SCORE_METHOD_OPTIONS = [
  { label: '百分制', value: 'NUMBER' },
  { label: '等级换算', value: 'LEVEL' },
  { label: '加分项', value: 'BONUS' },
  { label: '扣分项', value: 'DEDUCT' },
];

export const GRADE_OPTIONS = ['A+', 'A', 'B', 'C+', 'C'].map((value) => ({
  label: value,
  value,
}));

export const TEMPLATE_STATUS_MAP: Record<
  number,
  { color: string; text: string }
> = {
  0: { color: 'default', text: '草稿' },
  1: { color: 'green', text: '启用' },
  2: { color: 'red', text: '停用' },
};

export const INSTANCE_STATUS_MAP: Record<
  number,
  { color: string; text: string }
> = {
  1: { color: 'processing', text: '进行中' },
  2: { color: 'green', text: '已完成' },
  3: { color: 'red', text: '已取消' },
};

export const REVIEW_STATUS_MAP: Record<
  number,
  { color: string; text: string }
> = {
  0: { color: 'orange', text: '待主管填写' },
  1: { color: 'processing', text: '待员工确认' },
  2: { color: 'default', text: '已关闭' },
  3: { color: 'green', text: '已完成' },
};

export const TASK_LABELS: Record<string, string> = {
  JIXIAO_EMPLOYEE_CONFIRM: '员工确认',
  JIXIAO_HR_REVIEW: '人事审核',
  JIXIAO_INDICATOR_CONFIRM: '指标确认',
  JIXIAO_SELF_SCORE: '员工自评',
  JIXIAO_SUPERVISOR_SCORE: '主管评分',
  JIXIAO_MANAGER_SCORE: '上级评分',
};
