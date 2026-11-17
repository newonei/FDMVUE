import { requestClient } from '#/api/request';

export interface CommunitySkill {
  archiveBytes: number;
  category: string;
  createdAt: string;
  description: string;
  fileCount: number;
  id: string;
  license: string;
  name: string;
  ownerId: number;
  published: boolean;
  publisher: string;
  sha256: string;
  title: string;
  totalBytes: number;
  updatedAt: string;
  version: string;
}

export interface CommunityCatalog {
  entries: CommunitySkill[];
  revision: string;
}

export interface SkillUpload {
  category: string;
  file: File;
  license: string;
  title?: string;
  version: string;
}

const base = '/fdmskill/community';

export function getCommunityCatalog() {
  return requestClient.get<CommunityCatalog>(`${base}/catalog`);
}

export function getCommunityDetail(id: string) {
  return requestClient.get<{ entry: CommunitySkill; readme: string }>(
    `${base}/detail/${encodeURIComponent(id)}`,
  );
}

export function uploadCommunitySkill(data: SkillUpload) {
  return requestClient.upload<CommunitySkill>(
    `${base}/upload`,
    {
      file: data.file,
      title: data.title?.trim() || undefined,
      version: data.version.trim(),
      category: data.category.trim() || '通用',
      license: data.license.trim() || '未声明',
    },
    { timeout: 5 * 60 * 1000 },
  );
}

export function publishCommunitySkill(id: string, published: boolean) {
  return requestClient.put<CommunitySkill>(
    `${base}/publish/${encodeURIComponent(id)}`,
    { published },
  );
}

export function deleteCommunitySkill(id: string) {
  return requestClient.delete<boolean>(
    `${base}/entries/${encodeURIComponent(id)}`,
  );
}

export function downloadCommunityArchive(entry: CommunitySkill) {
  if (!/^[0-9a-f]{64}$/.test(entry.sha256))
    throw new Error('技能包校验信息无效，请刷新后重试');
  return requestClient.download<Blob>(
    `${base}/archive/${encodeURIComponent(entry.id)}`,
    {
      headers: { 'If-Match': `"${entry.sha256}"` },
      timeout: 5 * 60 * 1000,
    },
  );
}
