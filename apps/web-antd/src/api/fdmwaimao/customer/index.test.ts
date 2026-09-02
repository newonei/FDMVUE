import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatOkkiError,
  getBusinessErrorCode,
  getCustomer,
  getCustomerFilterOptions,
  getCustomerPage,
  importOkkiCustomer,
  previewOkkiCustomer,
  refreshCustomerFromOkki,
  searchOkkiCustomers,
  transferCustomer,
  updateCustomerLevel,
  updateCustomerProfile,
} from './index';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({
  requestClient: requestMocks,
}));

describe('fdmwaimao customer API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the real customer read endpoints and preserves string IDs', async () => {
    requestMocks.get.mockResolvedValue({ list: [], total: 0 });

    await getCustomerPage({
      pageNo: 2,
      pageSize: 20,
      ownerUserId: '9007199254740993',
    });
    await getCustomer('9007199254740993');
    await getCustomerFilterOptions();

    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/customer/page',
      {
        params: {
          ownerUserId: '9007199254740993',
          pageNo: 2,
          pageSize: 20,
        },
      },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/customer/get',
      { params: { id: '9007199254740993' } },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      3,
      '/fdmwaimao/customer/filter-options',
    );
  });

  it('keeps OKKI calls server-side, silent, and limited to search/preview/import/refresh', async () => {
    requestMocks.get.mockResolvedValue({ list: [], total: 0 });
    requestMocks.post.mockResolvedValue({ created: true, customerId: '1' });
    requestMocks.put.mockResolvedValue(true);

    await searchOkkiCustomers({
      keyword: 'Nova',
      pageNo: 1,
      pageSize: 20,
      searchField: 'name',
    });
    await previewOkkiCustomer('okki-company-1');
    await importOkkiCustomer({
      attachmentIds: ['9223372036854775804'],
      confirmPotentialDuplicate: true,
      okkiCompanyId: 'okki-company-1',
      previewHash:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      profile: {
        contacts: [],
        countryCode: 'FR',
        name: 'Nova France',
      },
    });
    await refreshCustomerFromOkki('local-customer-1');

    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/customer/okki/search',
      {
        params: {
          keyword: 'Nova',
          pageNo: 1,
          pageSize: 20,
          searchField: 'name',
        },
        silent: true,
      },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/customer/okki/preview',
      { params: { companyId: 'okki-company-1' }, silent: true },
    );
    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmwaimao/customer/import-from-okki',
      {
        attachmentIds: ['9223372036854775804'],
        confirmPotentialDuplicate: true,
        okkiCompanyId: 'okki-company-1',
        previewHash:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        profile: {
          contacts: [],
          countryCode: 'FR',
          name: 'Nova France',
        },
      },
      { silent: true },
    );
    expect(requestMocks.put).toHaveBeenCalledWith(
      '/fdmwaimao/customer/refresh-from-okki',
      null,
      { params: { id: 'local-customer-1' }, silent: true },
    );
  });

  it('uses local-only update endpoints and exposes only sanitized backend OKKI errors', async () => {
    requestMocks.put.mockResolvedValue(true);

    await updateCustomerLevel({ id: '1', level: 'A' });
    await updateCustomerProfile({
      expectedProfileVersion: 7,
      id: '1',
      profile: { contacts: [], name: 'Nova France SARL' },
    });
    await transferCustomer({ id: '1', ownerUserId: '2' });

    expect(requestMocks.put).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/customer/update-level',
      { id: '1', level: 'A' },
    );
    expect(requestMocks.put).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/customer/update-profile',
      {
        expectedProfileVersion: 7,
        id: '1',
        profile: { contacts: [], name: 'Nova France SARL' },
      },
    );
    expect(requestMocks.put).toHaveBeenNthCalledWith(
      3,
      '/fdmwaimao/customer/transfer',
      { id: '1', ownerUserId: '2' },
    );

    const backendError = {
      response: {
        data: { code: 1_206_002_004, msg: 'OKKI 服务暂时不可用，请稍后重试' },
        headers: { 'trace-id': 'trace-123' },
      },
    };
    expect(getBusinessErrorCode(backendError)).toBe(1_206_002_004);
    expect(formatOkkiError(backendError)).toBe(
      'OKKI 服务暂时不可用，请稍后重试（追踪编号：trace-123）',
    );
    expect(
      formatOkkiError({
        response: {
          data: { msg: '脱敏错误' },
          headers: { 'trace-id': '<script>secret</script>' },
        },
      }),
    ).toBe('脱敏错误');
  });
});
