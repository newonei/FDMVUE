import { describe, expect, it } from 'vitest';

import {
  archiveFileName,
  assertArchiveDownload,
  departmentOptions,
  errorText,
  filterSkills,
  ownsSkill,
  uploadError,
  userIdentity,
} from './model';
import { skill } from './test-fixtures';

describe('company skill visibility and ownership', () => {
  it('shows published entries in the square and only the current user entries in mine', () => {
    const entries = [
      skill(),
      skill({ id: 'own-draft', published: false }),
      skill({
        id: 'own-private',
        visibility: { scope: 'PRIVATE', departmentIds: [] },
      }),
      skill({ id: 'other', ownerId: 9 }),
      skill({ id: 'other-draft', ownerId: 9, published: false }),
    ];
    expect(
      filterSkills(entries, { query: '', tab: 'square', userId: '7' }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['entry-1', 'other']);
    expect(
      filterSkills(entries, { query: '', tab: 'mine', userId: '7' }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['entry-1', 'own-draft', 'own-private']);
    expect(filterSkills(entries, { query: '', tab: 'mine' })).toEqual([]);
  });

  it('filters name, description, publisher and category while preserving the source list', () => {
    const entries = [
      skill(),
      skill({
        id: 'other',
        category: '设计',
        publisher: '李四',
        name: 'design-kit',
      }),
    ];
    expect(
      filterSkills(entries, {
        query: 'DESIGN',
        tab: 'square',
        category: '设计',
      }).map((entry) => entry.id),
    ).toEqual(['other']);
    expect(
      filterSkills(entries, { query: '张三', tab: 'square' }),
    ).toHaveLength(1);
    expect(
      filterSkills(entries, { query: '表格', tab: 'square' }),
    ).toHaveLength(2);
    expect(entries).toHaveLength(2);
  });

  it('resolves actual FDM user IDs and never gives anonymous visitors owner actions', () => {
    expect(userIdentity({ id: 7 })).toBe('7');
    expect(userIdentity({ userId: '7' })).toBe('7');
    expect(userIdentity(null)).toBeUndefined();
    expect(userIdentity({ id: 'bad' })).toBeUndefined();
    expect(ownsSkill(skill(), '7')).toBe(true);
    expect(ownsSkill(skill(), '9')).toBe(false);
    expect(ownsSkill(skill(), undefined)).toBe(false);
    expect(
      ownsSkill(skill({ ownerId: '9007199254740993' }), '9007199254740993'),
    ).toBe(true);
  });

  it('labels departments by their parent path while retaining their exact IDs', () => {
    expect(
      departmentOptions([
        { id: '1', name: '公司', parentId: null },
        { id: '9007199254740993', name: '运营部', parentId: '1' },
      ]),
    ).toEqual([
      { value: '1', label: '公司' },
      { value: '9007199254740993', label: '公司 / 运营部' },
    ]);
  });
});

describe('skill ZIP boundaries', () => {
  it('requires a nonempty ZIP and an exact SemVer', () => {
    const zip = new File(['zip'], 'skill.zip', { type: 'application/zip' });
    expect(uploadError(undefined, '1.0.0')).toContain('请选择');
    expect(uploadError(new File(['x'], 'SKILL.md'), '1.0.0')).toContain('ZIP');
    expect(uploadError(new File([], 'skill.zip'), '1.0.0')).toContain(
      '不能为空',
    );
    expect(uploadError(zip, '^1.0.0')).toContain('SemVer');
    expect(uploadError(zip, '01.0.0')).toContain('SemVer');
    expect(uploadError(zip, '1.0.0-rc.1+build.2')).toBe('');
  });

  it('rejects JSON errors, HTML and changed-size responses before saving', () => {
    expect(() =>
      assertArchiveDownload(
        new Blob(['zip'], { type: 'application/zip' }),
        skill(),
      ),
    ).not.toThrow();
    for (const value of [
      null,
      { code: 403 },
      new Blob(['zip'], { type: 'application/json' }),
      new Blob(['zip'], { type: 'text/html' }),
      new Blob(['different']),
    ]) {
      expect(() => assertArchiveDownload(value, skill())).toThrow('下载内容');
    }
    expect(archiveFileName(skill({ name: '../../unsafe/name' }))).not.toContain(
      '/',
    );
  });

  it('shows service failures and useful content-change guidance', () => {
    expect(errorText({ response: { status: 412 } }, '失败')).toContain('刷新');
    expect(errorText({ data: { msg: '包缺少 SKILL.md' } }, '失败')).toBe(
      '包缺少 SKILL.md',
    );
    expect(errorText(null, '失败')).toBe('失败');
  });
});
