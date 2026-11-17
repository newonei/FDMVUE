import type {
  LocalizedText,
  MarketPlugin,
  PluginMarketIndex,
  PluginVersion,
} from '../../../api/fdmskill/plugins';

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function displayText(value?: LocalizedText): string {
  return typeof value === 'string'
    ? value
    : (value?.['zh-cn'] ?? value?.zh ?? value?.en ?? '');
}

/** Change the Chinese text without flattening the other localized values. */
export function editText(previous: LocalizedText | undefined, value: string) {
  const text = value.trim();
  if (previous && typeof previous === 'object') {
    const result = { ...previous };
    if (text) result['zh-cn'] = text;
    else delete result['zh-cn'];
    return result;
  }
  return text || undefined;
}

export function newVersion(): PluginVersion {
  return {
    version: '1.0.0',
    publishTimestamp: Math.floor(Date.now() / 1000),
    source: { type: 'npm' },
  };
}

export function newPlugin(): MarketPlugin {
  return { name: '', title: '', published: false, versions: [newVersion()] };
}

export function resolveIndexUrl(options: {
  apiURL: string;
  backendURL?: string;
  indexPath: string;
  indexUrl?: string;
  origin: string;
}): string {
  const base = options.backendURL || options.apiURL || options.origin;
  try {
    return new URL(
      options.indexUrl || options.indexPath,
      new URL(base, options.origin).origin,
    ).href;
  } catch {
    return '';
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function localized(value: unknown): boolean {
  return typeof value === 'string'
    ? Boolean(value.trim())
    : object(value) &&
        typeof value.en === 'string' &&
        Object.entries(value).every(
          ([key, text]) =>
            /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/.test(key) &&
            typeof text === 'string' &&
            Boolean(text.trim()),
        );
}

function validUrl(value: unknown, git = false): boolean {
  if (typeof value !== 'string' || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      value.includes('?') ||
      value.includes('#')
    )
      return false;
    return (
      !git ||
      (url.protocol === 'https:' &&
        url.href === value &&
        /^(?:\/[^/]+){2,}$/.test(url.pathname) &&
        !/\.(?:tgz|tar\.gz)$/i.test(url.pathname))
    );
  } catch {
    return false;
  }
}

function validPath(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value
      .split('/')
      .every(
        (segment) =>
          segment !== '.' &&
          segment !== '..' &&
          /^[A-Za-z0-9._@+-]+$/.test(segment),
      )
  );
}

const numeric = '(?:0|[1-9][0-9]*)';
const prerelease = `(?:${numeric}|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)`;
const versionPattern = new RegExp(
  `^${numeric}\\.${numeric}\\.${numeric}(?:-${prerelease}(?:\\.${prerelease})*)?(?:\\+[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*)?$`,
);

/** Fast form feedback; the server remains authoritative for the complete index. */
export function validateIndex(value: unknown): string {
  if (!object(value) || value.format !== 1 || !Array.isArray(value.plugins)) {
    return '索引必须为 format: 1，且 plugins 为数组';
  }
  if (!localized(value.title)) return '索引标题不能为空；多语言标题必须包含 en';
  if (value.description !== undefined && !localized(value.description))
    return '索引描述格式不正确';
  if (value.metadata !== undefined && !object(value.metadata))
    return 'metadata 必须为对象';
  const metadata = (value.metadata ?? {}) as Record<string, unknown>;
  for (const key of ['categories', 'labels', 'sortKeys']) {
    if (metadata[key] === undefined) continue;
    if (!object(metadata[key])) return `metadata.${key} 必须为对象`;
    for (const [id, declaration] of Object.entries(metadata[key])) {
      if (!id || !object(declaration) || !localized(declaration.title))
        return `metadata.${key}.${id} 需要有效标题`;
      if (
        key === 'sortKeys' &&
        !['asc', 'desc'].includes(String(declaration.order))
      )
        return `排序 ${id} 的 order 必须为 asc 或 desc`;
    }
  }
  const names = new Set<string>();
  for (const [position, plugin] of value.plugins.entries()) {
    const at = `第 ${position + 1} 个插件`;
    if (
      !object(plugin) ||
      typeof plugin.name !== 'string' ||
      plugin.name.length > 214 ||
      !/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/.test(plugin.name)
    )
      return `${at}的包名不符合 npm 命名规则`;
    if (names.has(plugin.name)) return `插件包名 ${plugin.name} 重复`;
    names.add(plugin.name);
    for (const key of ['title', 'description']) {
      if (plugin[key] !== undefined && !localized(plugin[key]))
        return `${plugin.name} 的 ${key} 格式不正确`;
    }
    if (plugin.published !== undefined && typeof plugin.published !== 'boolean')
      return `${plugin.name} 的 published 必须为布尔值`;
    if (plugin.metadata !== undefined && !object(plugin.metadata))
      return `${plugin.name} 的 metadata 必须为对象`;
    const pm = (plugin.metadata ?? {}) as Record<string, unknown>;
    if (
      pm.category !== undefined &&
      (!object(metadata.categories) ||
        typeof pm.category !== 'string' ||
        !Object.hasOwn(metadata.categories, pm.category))
    )
      return `${plugin.name} 引用了未声明的分类`;
    if (
      pm.keywords !== undefined &&
      (!Array.isArray(pm.keywords) ||
        pm.keywords.some((keyword) => typeof keyword !== 'string'))
    )
      return `${plugin.name} 的 keywords 必须为字符串数组`;
    if (pm.labels !== undefined) {
      if (
        !Array.isArray(pm.labels) ||
        pm.labels.some(
          (label) =>
            typeof label !== 'string' ||
            !object(metadata.labels) ||
            !Object.hasOwn(metadata.labels, label),
        )
      )
        return `${plugin.name} 的 labels 必须引用已声明的标签`;
      if (new Set(pm.labels).size !== pm.labels.length)
        return `${plugin.name} 的 labels 不能重复`;
    }
    if (
      pm.sortKeys !== undefined &&
      (!object(pm.sortKeys) ||
        Object.entries(pm.sortKeys).some(
          ([key, number]) =>
            !object(metadata.sortKeys) ||
            !Object.hasOwn(metadata.sortKeys, key) ||
            typeof number !== 'number' ||
            !Number.isFinite(number),
        ))
    )
      return `${plugin.name} 的 sortKeys 必须引用已声明的排序项并提供数值`;
    if (!Array.isArray(plugin.versions) || plugin.versions.length === 0)
      return `${plugin.name} 至少需要一个版本`;
    const versions = new Set<string>();
    for (const [i, version] of plugin.versions.entries()) {
      const prefix = `${plugin.name} 第 ${i + 1} 个版本`;
      if (
        !object(version) ||
        typeof version.version !== 'string' ||
        !versionPattern.test(version.version)
      )
        return `${prefix}需要精确 SemVer 版本号（如 1.0.0）`;
      if (versions.has(version.version))
        return `${plugin.name} 的版本 ${version.version} 重复`;
      versions.add(version.version);
      if (
        typeof version.publishTimestamp !== 'number' ||
        !Number.isInteger(version.publishTimestamp) ||
        version.publishTimestamp < 0 ||
        version.publishTimestamp >= 1e11
      )
        return `${prefix}的发布时间必须为 Unix 秒数，不能填写毫秒`;
      if (version.engines !== undefined && !object(version.engines))
        return `${prefix}的 engines 必须为对象`;
      if (
        object(version.engines) &&
        version.engines.dsh !== undefined &&
        (typeof version.engines.dsh !== 'string' ||
          !version.engines.dsh.trim() ||
          version.engines.dsh.startsWith('workspace:'))
      )
        return `${prefix}的 DSH 版本范围无效`;
      if (!object(version.source)) return `${prefix}需要来源`;
      const source = version.source;
      if (source.type === 'npm') {
        if (source.registry !== undefined && !validUrl(source.registry))
          return `${prefix}的 npm registry 必须为无账号、查询参数或片段的 HTTP(S) 地址`;
      } else if (source.type === 'git') {
        if (!validUrl(source.url, true))
          return `${prefix}需要规范 HTTPS Git 仓库地址（如 https://github.com/org/repo）`;
        if (
          typeof source.commit !== 'string' ||
          !/^[0-9a-f]{40}$/.test(source.commit)
        )
          return `${prefix}需要 40 位小写十六进制 commit`;
        if (source.path !== undefined && !validPath(source.path))
          return `${prefix}的包路径必须为相对目录，不含 . 或 .. 段`;
      } else return `${prefix}的来源必须为 npm 或 git`;
    }
  }
  if (new TextEncoder().encode(JSON.stringify(value)).length > 4 * 1024 * 1024)
    return '索引超过 4 MiB 限制';
  return '';
}

export function withPlugin(
  index: PluginMarketIndex,
  plugin: MarketPlugin,
  originalName?: string,
) {
  const next = clone(index);
  const position = originalName
    ? next.plugins.findIndex((row) => row.name === originalName)
    : -1;
  if (position < 0) next.plugins.push(clone(plugin));
  else next.plugins.splice(position, 1, clone(plugin));
  return next;
}
