import type { CommunitySkill } from '../../../api/fdmskill/community';

export function skill(overrides: Partial<CommunitySkill> = {}): CommunitySkill {
  return {
    id: 'entry-1',
    name: 'office-skill',
    title: '办公技能',
    description: '生成表格',
    version: '1.0.0',
    publisher: '张三',
    ownerId: 7,
    category: '办公',
    license: '内部使用',
    sha256: 'a'.repeat(64),
    archiveBytes: 3,
    fileCount: 1,
    totalBytes: 10,
    published: true,
    createdAt: '2026-11-17T00:00:00Z',
    updatedAt: '2026-11-17T00:00:00Z',
    ...overrides,
  };
}
