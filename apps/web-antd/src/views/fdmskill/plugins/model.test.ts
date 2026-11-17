import type { PluginMarketIndex } from '../../../api/fdmskill/plugins';

import { describe, expect, it } from 'vitest';

import {
  clone,
  displayText,
  editText,
  resolveIndexUrl,
  validateIndex,
  withPlugin,
} from './model';

function index(): PluginMarketIndex {
  return {
    format: 1,
    title: { en: 'FDM plugins', 'zh-cn': '飞德慕插件' },
    metadata: { categories: { office: { title: '办公' } } },
    plugins: [
      {
        name: '@fdm/example',
        title: { en: 'Example', 'zh-cn': '示例', ja: 'サンプル' },
        metadata: { category: 'office', keywords: ['表格'] },
        versions: [
          {
            version: '1.0.0',
            publishTimestamp: 1_700_000_000,
            source: { type: 'npm' },
          },
        ],
      },
    ],
  };
}

describe('plugin market authoring', () => {
  it('changes Chinese titles while preserving other locales and unknown fields', () => {
    const original = index();
    original.plugins[0]!.customExtension = { preserved: true };
    const plugin = clone(original.plugins[0]!);
    plugin.title = editText(plugin.title, '新的中文标题');
    plugin.published = false;
    const result = withPlugin(original, plugin, plugin.name);
    expect(result.plugins[0]!.title).toEqual({
      en: 'Example',
      'zh-cn': '新的中文标题',
      ja: 'サンプル',
    });
    expect(result.plugins[0]!.customExtension).toEqual({ preserved: true });
    expect(original.plugins[0]!.published).toBeUndefined();
    expect(displayText(result.plugins[0]!.title)).toBe('新的中文标题');
    expect(validateIndex(result)).toBe('');
  });

  it('accepts an empty market and npm or immutable Git versions', () => {
    const value = index();
    value.plugins[0]!.versions.push({
      version: '2.0.0-beta.1+build.2',
      publishTimestamp: 1_800_000_000,
      engines: { dsh: '>=1.0.0' },
      source: {
        type: 'git',
        url: 'https://github.com/fdm/plugin',
        commit: 'a'.repeat(40),
        path: 'packages/plugin',
      },
    });
    expect(validateIndex(value)).toBe('');
    value.plugins = [];
    expect(validateIndex(value)).toBe('');
  });

  it('rejects duplicate names/versions, timestamps in milliseconds and unsafe mutable Git sources', () => {
    const duplicate = index();
    duplicate.plugins.push(clone(duplicate.plugins[0]!));
    expect(validateIndex(duplicate)).toContain('包名');
    const value = index();
    const plugin = value.plugins[0]!;
    plugin.versions.push(clone(plugin.versions[0]!));
    expect(validateIndex(value)).toContain('重复');
    plugin.versions.pop();
    plugin.versions[0]!.publishTimestamp *= 1000;
    expect(validateIndex(value)).toContain('毫秒');
    plugin.versions[0]!.publishTimestamp = 1_700_000_000;
    plugin.versions[0]!.source = {
      type: 'git',
      url: 'https://github.com/fdm/plugin',
      commit: 'main',
    };
    expect(validateIndex(value)).toContain('40 位');
    plugin.versions[0]!.source.commit = 'a'.repeat(40);
    plugin.versions[0]!.source.path = '../outside';
    expect(validateIndex(value)).toContain('相对目录');
  });

  it('rejects credential-bearing registries and invalid localized metadata/category references', () => {
    const value = index();
    value.plugins[0]!.versions[0]!.source.registry =
      'https://user:secret@registry.example.com';
    expect(validateIndex(value)).toContain('registry');
    delete value.plugins[0]!.versions[0]!.source.registry;
    value.title = { 'zh-cn': '缺少英语' };
    expect(validateIndex(value)).toContain('en');
    value.title = '市场';
    delete value.metadata!.categories!.office;
    expect(validateIndex(value)).toContain('未声明的分类');
  });

  it('reports malformed JSON shapes without throwing or silently replacing content', () => {
    for (const bad of [
      null,
      [],
      {},
      { ...index(), plugins: [null] },
      { ...index(), plugins: [{ name: 'valid', versions: [null] }] },
    ]) {
      expect(validateIndex(bad)).not.toBe('');
    }
    const value = index();
    value.plugins[0]!.published = 'false' as never;
    expect(validateIndex(value)).toContain('published');
  });
});

describe('desktop plugin index URL', () => {
  const options = {
    apiURL: '/admin-api',
    indexPath: '/plugins/index.json',
    origin: 'http://localhost:5666',
  };

  it('copies the server-provided URL, including an externally configured path', () => {
    expect(
      resolveIndexUrl({
        ...options,
        indexUrl: 'https://market.example.com/fdm/plugins/index.json',
      }),
    ).toBe('https://market.example.com/fdm/plugins/index.json');
  });

  it('uses the backend rather than the Vite dev server for the public endpoint', () => {
    expect(
      resolveIndexUrl({ ...options, backendURL: 'http://127.0.0.1:48080' }),
    ).toBe('http://127.0.0.1:48080/plugins/index.json');
    expect(
      resolveIndexUrl({
        ...options,
        apiURL: 'https://api.example.com/admin-api',
      }),
    ).toBe('https://api.example.com/plugins/index.json');
  });

  it('resolves relative production configuration on the current origin', () => {
    expect(
      resolveIndexUrl({ ...options, origin: 'https://fdm.example.com' }),
    ).toBe('https://fdm.example.com/plugins/index.json');
  });
});
