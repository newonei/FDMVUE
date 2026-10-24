import type { FdmAiCheckApi } from '#/api/fdmaicheck';

export const CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

export const SEVERITY_OPTIONS = [
  { label: '高风险', value: 'HIGH' },
  { label: '需核对', value: 'WARNING' },
  { label: '提示', value: 'INFO' },
];

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

export function newItem(existing: FdmAiCheckApi.Item[]): FdmAiCheckApi.Item {
  let index = existing.length + 1;
  const codes = new Set(existing.map((item) => item.code));
  while (codes.has(`CUSTOM_${index}`)) index += 1;
  return {
    code: `CUSTOM_${index}`,
    name: '',
    severity: 'WARNING',
    description: '',
    enabled: true,
  };
}

/** 保存前在页面上先查一遍，提示更直接；后端仍会校验。返回第一条问题，没有问题返回空。 */
export function draftProblem(draft: FdmAiCheckApi.Draft) {
  const codes = new Set<string>();
  for (const item of draft.items) {
    const code = item.code.trim().toUpperCase();
    if (!CODE_PATTERN.test(code))
      return `检查项编码「${item.code}」须以大写字母开头，只含大写字母、数字和下划线`;
    if (codes.has(code)) return `检查项编码「${code}」重复`;
    codes.add(code);
    if (!item.name.trim()) return `检查项「${code}」还没有填名称`;
  }
  return '';
}

/** 提交给后端：编码转大写、去掉空白的部门说明。 */
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
      code: item.code.trim().toUpperCase(),
      name: item.name.trim(),
      description: item.description?.trim() || undefined,
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
