import type { FdmAiCheckApi } from '#/api/fdmaicheck';

export const SEVERITY_OPTIONS = [
  { label: '高风险', value: 'HIGH' },
  { label: '需核对', value: 'WARNING' },
  { label: '提示', value: 'INFO' },
];

/** 检查点「不通过时」的严重程度；INFO 表示这一项只提醒。 */
export const ITEM_SEVERITY_OPTIONS = [
  { label: '高风险', value: 'HIGH' },
  { label: '需核对', value: 'WARNING' },
  { label: '只提醒', value: 'INFO' },
];

export const ITEM_SEVERITY_LABELS: Record<string, string> = {
  HIGH: '高风险',
  WARNING: '需核对',
  INFO: '只提醒',
};

/** 编辑用的草稿：从草稿、当前版本或出厂默认复制一份，改动不影响原数据。 */
export function draftFrom(
  prompt?: FdmAiCheckApi.Prompt | null,
): FdmAiCheckApi.Draft {
  return {
    items: (prompt?.items ?? []).map((item) => ({ ...item })),
    departmentNotes: { ...prompt?.departmentNotes },
    notes: prompt?.notes ?? '',
  };
}

/** 新检查点：编码留空，保存时由系统生成。 */
export function newItem(group?: string): FdmAiCheckApi.Item {
  return {
    name: '',
    severity: 'WARNING',
    description: '',
    enabled: true,
    failWhen: '',
    warnWhen: '',
    group: group ?? '',
  };
}

/** 保存前在页面上先查一遍，提示更直接；后端仍会校验。返回第一条问题，没有问题返回空。 */
export function draftProblem(draft: FdmAiCheckApi.Draft) {
  const names = new Set<string>();
  for (const [index, item] of draft.items.entries()) {
    const name = item.name.trim();
    if (!name) return `第 ${index + 1} 个检查点还没有填名称`;
    if (names.has(name)) return `检查点「${name}」重名了`;
    names.add(name);
  }
  return '';
}

/** 提交给后端：去掉首尾空白，空的字段不传。 */
export function normalizeDraft(
  draft: FdmAiCheckApi.Draft,
): FdmAiCheckApi.Draft {
  const departmentNotes: Record<string, string> = {};
  for (const [key, value] of Object.entries(draft.departmentNotes)) {
    if (value?.trim()) departmentNotes[key] = value.trim();
  }
  return {
    items: draft.items.map((item) => ({
      ...item,
      code: item.code?.trim().toUpperCase() || undefined,
      name: item.name.trim(),
      description: item.description?.trim() || undefined,
      failWhen: item.failWhen?.trim() || undefined,
      warnWhen: item.warnWhen?.trim() || undefined,
      group: item.group?.trim() || undefined,
    })),
    departmentNotes,
    notes: draft.notes?.trim() || undefined,
  };
}

export function versionLabel(prompt?: FdmAiCheckApi.Prompt | null) {
  if (!prompt) return '';
  return prompt.promptId === 0 || !prompt.versionNo
    ? '出厂默认'
    : `第 ${prompt.versionNo} 版`;
}

export const UNGROUPED = '未分组';

/** 按分组排列，分组按第一次出现的顺序，没分组的放最后；index 是在原列表里的位置。 */
export function groupItems(items: FdmAiCheckApi.Item[]) {
  const groups = new Map<
    string,
    { index: number; item: FdmAiCheckApi.Item }[]
  >();
  for (const [index, item] of items.entries()) {
    const name = item.group?.trim() || UNGROUPED;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push({ index, item });
  }
  const list = [...groups.entries()].map(([name, rows]) => ({ name, rows }));
  return [
    ...list.filter((g) => g.name !== UNGROUPED),
    ...list.filter((g) => g.name === UNGROUPED),
  ];
}

/**
 * 新建或编辑一个分组：选中的检查点归到 name 这组（和已有同名分组合并）；原来在 from 组、
 * 这次没选中的退回未分组。返回的问题为空表示改好了。
 */
export function applyGroup(
  items: FdmAiCheckApi.Item[],
  from: null | string,
  name: string,
  selected: Set<number>,
) {
  const target = name.trim();
  if (!target) return '请填写分组名称';
  if (target === UNGROUPED) return `「${UNGROUPED}」不能当分组名称`;
  for (const [index, item] of items.entries()) {
    if (selected.has(index)) item.group = target;
    else if (from && item.group?.trim() === from) item.group = '';
  }
  return '';
}

/** 近 30 天误报多的检查点：误报至少 2 次且占报出问题的三成以上。 */
export function manyFalsePositives(stats?: FdmAiCheckApi.ItemStats) {
  if (!stats || stats.falsePositive < 2) return false;
  return stats.falsePositive >= Math.max(1, stats.fail + stats.warn) * 0.3;
}
