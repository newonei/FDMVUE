import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteCommunitySkill,
  downloadCommunityArchive,
  getCommunityCatalog,
  getCommunityDetail,
  publishCommunitySkill,
  uploadCommunitySkill,
} from '../../../api/fdmskill/community';
import { skill } from './test-fixtures';

const requests = vi.hoisted(() => ({
  get: vi.fn(),
  upload: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  download: vi.fn(),
}));
vi.mock('#/api/request', () => ({ requestClient: requests }));
beforeEach(() => vi.clearAllMocks());

describe('company skill API contracts', () => {
  it('uploads a File through the multipart helper and omits all identity/tenant fields', async () => {
    const file = new File(['zip'], 'skill.zip', { type: 'application/zip' });
    requests.upload.mockResolvedValue(skill({ published: false }));
    await uploadCommunitySkill({
      file,
      version: ' 1.0.0 ',
      title: ' ',
      category: '',
      license: ' ',
    });
    expect(requests.upload).toHaveBeenCalledWith(
      '/fdmskill/community/upload',
      {
        file,
        title: undefined,
        version: '1.0.0',
        category: '通用',
        license: '未声明',
      },
      { timeout: 300_000 },
    );
  });

  it('uses unwrapped catalog/detail and explicit publish state without arbitrary tenant selection', async () => {
    requests.get.mockResolvedValue({ revision: 'r1', entries: [] });
    await getCommunityCatalog();
    await getCommunityDetail('entry/id');
    await publishCommunitySkill('entry/id', false);
    await deleteCommunitySkill('entry/id');
    expect(requests.get).toHaveBeenCalledWith('/fdmskill/community/catalog');
    expect(requests.get).toHaveBeenCalledWith(
      '/fdmskill/community/detail/entry%2Fid',
    );
    expect(requests.put).toHaveBeenCalledWith(
      '/fdmskill/community/publish/entry%2Fid',
      { published: false },
    );
    expect(requests.delete).toHaveBeenCalledWith(
      '/fdmskill/community/entries/entry%2Fid',
    );
  });

  it('pins archive download to the listed SHA with If-Match and propagates failures', async () => {
    const archive = new Blob(['zip'], { type: 'application/zip' });
    requests.download.mockResolvedValueOnce(archive);
    await expect(downloadCommunityArchive(skill())).resolves.toBe(archive);
    expect(requests.download).toHaveBeenCalledWith(
      '/fdmskill/community/archive/entry-1',
      { headers: { 'If-Match': `"${'a'.repeat(64)}"` }, timeout: 300_000 },
    );
    expect(() =>
      downloadCommunityArchive(skill({ sha256: 'invalid' })),
    ).toThrow('校验');
    requests.download.mockRejectedValueOnce({ response: { status: 412 } });
    await expect(downloadCommunityArchive(skill())).rejects.toEqual({
      response: { status: 412 },
    });
  });
});
