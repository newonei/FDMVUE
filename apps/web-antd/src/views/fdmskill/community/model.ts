import type { CommunitySkill } from '../../../api/fdmskill/community';

export function userIdentity(
  info: null | Record<string, unknown> | undefined,
): number | undefined {
  const id = Number(info?.id ?? info?.userId);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function ownsSkill(entry: CommunitySkill, userId?: number): boolean {
  return userId !== undefined && entry.ownerId === userId;
}

export function canManageSkill(
  entry: CommunitySkill,
  userId?: number,
  administrator = false,
): boolean {
  return administrator || ownsSkill(entry, userId);
}

export function filterSkills(
  entries: CommunitySkill[],
  options: { category?: string; query: string; tab: string; userId?: number },
) {
  const term = options.query.trim().toLocaleLowerCase();
  return entries
    .filter(
      (entry) =>
        (options.tab === 'mine'
          ? ownsSkill(entry, options.userId)
          : entry.published) &&
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
