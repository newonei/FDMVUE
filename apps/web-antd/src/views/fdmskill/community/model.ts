import type {
  CommunitySkill,
  SkillDepartment,
  SkillVisibility,
  SkillVisibilityScope,
} from '../../../api/fdmskill/community';

export const visibilityLabels: Record<SkillVisibilityScope, string> = {
  COMPANY: '全公司',
  DEPARTMENTS: '指定部门',
  PRIVATE: '仅自己',
};

function positiveId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
    return String(value);
  return typeof value === 'string' && /^[1-9]\d*$/.test(value)
    ? value
    : undefined;
}

export function userIdentity(
  info: null | Record<string, unknown> | undefined,
): string | undefined {
  return positiveId(info?.id ?? info?.userId);
}

export function ownsSkill(entry: CommunitySkill, userId?: string): boolean {
  return userId !== undefined && positiveId(entry.ownerId) === userId;
}

export function skillVisibility(entry: CommunitySkill): SkillVisibility {
  return entry.visibility ?? { scope: 'COMPANY', departmentIds: [] };
}

export function isSharedSkill(entry: CommunitySkill): boolean {
  return entry.published && skillVisibility(entry).scope !== 'PRIVATE';
}

export function departmentOptions(departments: SkillDepartment[]) {
  const byId = new Map(departments.map((dept) => [dept.id, dept]));
  return departments.map(({ id, name, parentId }) => {
    const path = [name];
    const visited = new Set([id]);
    let parent = parentId ? byId.get(parentId) : undefined;
    while (parent && !visited.has(parent.id)) {
      path.push(parent.name);
      visited.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return { label: path.toReversed().join(' / '), value: id };
  });
}

export function filterSkills(
  entries: CommunitySkill[],
  options: { category?: string; query: string; tab: string; userId?: string },
) {
  const term = options.query.trim().toLocaleLowerCase();
  return entries
    .filter(
      (entry) =>
        (options.tab === 'mine'
          ? ownsSkill(entry, options.userId)
          : isSharedSkill(entry)) &&
        (!options.category || entry.category === options.category) &&
        (!term ||
          [entry.title, entry.name, entry.description, entry.publisher]
            .join(' ')
            .toLocaleLowerCase()
            .includes(term)),
    )
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function errorText(error: unknown, fallback: string): string {
  const value = error as null | {
    data?: { msg?: string };
    message?: string;
    msg?: string;
    response?: { data?: { msg?: string }; status?: number };
  };
  if (value?.response?.status === 412)
    return '技能包已发生变化，请刷新列表后重新下载';
  return (
    value?.response?.data?.msg ||
    value?.data?.msg ||
    value?.msg ||
    value?.message ||
    fallback
  );
}

const numeric = '(?:0|[1-9][0-9]*)';
const prerelease = `(?:${numeric}|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)`;
const semver = new RegExp(
  `^${numeric}\\.${numeric}\\.${numeric}(?:-${prerelease}(?:\\.${prerelease})*)?(?:\\+[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*)?$`,
);

export function uploadError(file: File | undefined, version: string): string {
  if (!file) return '请选择包含 SKILL.md 的 ZIP 文件';
  if (!/\.zip$/i.test(file.name)) return '请选择 ZIP 格式的技能包';
  if (file.size === 0) return '技能包不能为空';
  if (!semver.test(version.trim()))
    return '版本号需要使用精确 SemVer 格式，例如 1.0.0';
  return '';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function archiveFileName(entry: CommunitySkill): string {
  return `${entry.name.replaceAll(/[^a-z0-9._-]/gi, '_')}-${entry.version.replaceAll(/[^a-z0-9._+-]/gi, '_')}.zip`;
}

export function assertArchiveDownload(
  value: unknown,
  entry: CommunitySkill,
): asserts value is Blob {
  if (
    !(value instanceof Blob) ||
    value.size !== entry.archiveBytes ||
    /(?:json|html|text\/)/i.test(value.type)
  ) {
    throw new Error('下载内容与技能包不一致，请刷新列表后重试');
  }
}
