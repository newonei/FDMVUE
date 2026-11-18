/* eslint-disable vue/one-component-per-file -- Small adapters exercise the actual file archive and upload controls. */
import type { PropType } from 'vue';

import type {
  ProcurementFile,
  ProcurementOrderView,
} from '#/api/fdmplatform/procurement';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { procurementFileGroups } from './order-contract-files';
import OrderContract from './OrderContract.vue';

vi.mock('#/api/fdmplatform/procurement', () => ({
  downloadProcurementFile: vi.fn(),
}));
vi.mock(
  '#/api/fdmplatform/submission-files',
  () => import('../../../../../api/fdmplatform/submission-files'),
);
vi.mock('../../../data', () => ({
  errorText: (error: Error) => error.message,
}));
vi.mock('../../../components/attachment-preview', () => ({
  attachmentTime: (value: unknown) => String(value ?? ''),
}));
vi.mock('../../../components/FilePreviewButton.vue', () => ({
  default: defineComponent({
    props: { disabled: Boolean, name: { type: String, default: '' } },
    setup: (props) => () =>
      h(
        'button',
        { disabled: props.disabled, 'aria-label': `预览 ${props.name}` },
        '预览',
      ),
  }),
}));
vi.mock('../model', () => ({ downloadBlob: vi.fn() }));
vi.mock('ant-design-vue', () => {
  const Wrap = defineComponent({
    setup: (_, ctx) => () => h('div', ctx.slots.default?.()),
  });
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: '' } },
      setup: (props) => () => h('div', { role: 'alert' }, props.message),
    }),
    Button: defineComponent({
      props: { disabled: Boolean, loading: Boolean },
      setup: (props, ctx) => () =>
        h(
          'button',
          { ...ctx.attrs, disabled: props.disabled || props.loading },
          ctx.slots.default?.(),
        ),
    }),
    Select: defineComponent({
      props: {
        value: { type: String, default: '' },
        options: {
          type: Array as PropType<{ label: string; value: string }[]>,
          default: () => [],
        },
        disabled: Boolean,
      },
      emits: ['update:value'],
      setup: (props, ctx) => () =>
        h(
          'select',
          {
            ...ctx.attrs,
            value: props.value,
            disabled: props.disabled,
            onChange: (event: Event) =>
              ctx.emit(
                'update:value',
                (event.target as HTMLSelectElement).value,
              ),
          },
          (props.options ?? []).map(
            (option: { label: string; value: string }) =>
              h('option', { value: option.value }, option.label),
          ),
        ),
    }),
    Space: Wrap,
    Tag: Wrap,
  };
});

function exported(
  id: string,
  revision?: number,
  extra: Partial<ProcurementFile> = {},
): ProcurementFile {
  return {
    id,
    revision,
    name: `${id}.pdf`,
    kind: 'EXPORT',
    size: 1024,
    detailsRevision: 1,
    createdAt: '2026-11-17T01:00:00Z',
    orderId: 'order-1',
    contractId: 'contract-1',
    ...extra,
  };
}
function signed(
  id: string,
  exportId?: string,
  extra: Partial<ProcurementFile> = {},
): ProcurementFile {
  return exported(id, undefined, { kind: 'SIGNED', exportId, ...extra });
}
function order(
  exportFiles: ProcurementFile[] = [],
  files: ProcurementFile[] = exportFiles,
): ProcurementOrderView {
  return {
    id: 'order-1',
    contractId: 'contract-1',
    version: 1,
    companyId: 1,
    companyName: '测试公司',
    contractCode: 'HT001',
    contractName: '测试合同',
    order: { id: 'order-1' },
    details: { clauseIds: [], revision: 1, status: 'CONFIRMED', version: 1 },
    allowedActions: ['UPLOAD_SIGNED', 'DELETE_FILE'],
    blockReasons: [],
    history: [],
    storageEnabled: true,
    exports: exportFiles,
    files,
  };
}

const cleanup: (() => void)[] = [];
beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));
async function settle() {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve();
    await nextTick();
  }
}
async function mount(view = order([exported('latest', 1)]), saving = false) {
  const state = ref({ view, saving });
  const onSigned = vi.fn();
  const onDelete = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () => h(OrderContract, { ...state.value, onSigned, onDelete }),
  });
  app.mount(host);
  cleanup.push(() => {
    app.unmount();
    host.remove();
  });
  await settle();
  return { host, state, onSigned, onDelete };
}
function button(host: HTMLElement, text: string) {
  const result = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim().startsWith(text),
  );
  expect(result).toBeDefined();
  return result!;
}
async function chooseVersion(host: HTMLElement, id: string) {
  const select = host.querySelector<HTMLSelectElement>('select')!;
  select.value = id;
  select.dispatchEvent(new Event('change'));
  await settle();
}
async function pick(
  host: HTMLElement,
  file = new File(['盖章内容'], '供应商盖章.pdf'),
) {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change'));
  await settle();
  return file;
}

describe('采购单文件分组', () => {
  it('导出版本号优先于创建时间，盖章上传时间不改变最新导出', () => {
    const older = exported('older', 1, { createdAt: '2026-11-17T04:00:00Z' });
    const latest = exported('latest', 3, { createdAt: '2026-11-17T01:00:00Z' });
    const middle = exported('middle', 2);
    const oldSigned = signed('old-signed', 'older', {
      createdAt: '2026-11-17T10:00:00Z',
    });
    const result = procurementFileGroups(
      [older, latest, middle],
      [oldSigned, middle, older, latest],
    );
    expect(result.versions.map((item) => item.export.id)).toEqual([
      'latest',
      'middle',
      'older',
    ]);
    expect(result.versions[2]!.signed.map((file) => file.id)).toEqual([
      'old-signed',
    ]);
  });

  it('缺少版本号或版本号相同时按时间排序，兼容数字、数字字符串和 ISO 时间', () => {
    const oldest = exported('oldest', undefined, { createdAt: 1000 });
    const middle = exported('middle', undefined, { createdAt: '2000' });
    const newest = exported('newest', undefined, {
      createdAt: '2026-11-17T01:00:00Z',
    });
    expect(
      procurementFileGroups([oldest, middle, newest], []).versions.map(
        (item) => item.export.id,
      ),
    ).toEqual(['newest', 'middle', 'oldest']);
  });

  it('合并两个入口的导出稿但不改动输入，保留全部盖章件及找不到来源的文件', () => {
    const old = exported('old', 1);
    const latest = exported('latest', 2);
    const exportFiles = Object.freeze([old, latest]);
    const files = Object.freeze([
      latest,
      signed('signed-1', 'latest'),
      signed('signed-2', 'latest'),
      signed('orphan', 'missing'),
      signed('no-source'),
    ]);
    const before = JSON.stringify({ exportFiles, files });
    const result = procurementFileGroups(exportFiles, files);
    expect(result.versions.map((item) => item.export.id)).toEqual([
      'latest',
      'old',
    ]);
    expect(result.versions[0]!.signed.map((file) => file.id)).toEqual([
      'signed-1',
      'signed-2',
    ]);
    expect(result.unlinked.map((file) => file.id)).toEqual([
      'orphan',
      'no-source',
    ]);
    expect(JSON.stringify({ exportFiles, files })).toBe(before);
  });
});

describe('采购单文件归档与盖章上传', () => {
  it('默认关联最高版本并只展开最新导出，忽略服务端数组顺序', async () => {
    const old = exported('旧稿', 1, { createdAt: '2026-11-17T05:00:00Z' });
    const latest = exported('最新稿', 3);
    const middle = exported('中间稿', 2);
    const { host, onSigned } = await mount(order([old, latest, middle]));
    expect(host.querySelector<HTMLSelectElement>('select')!.value).toBe(
      latest.id,
    );
    expect(host.querySelector('.version-group')!.textContent).toContain(
      '最新稿.pdf',
    );
    expect(host.querySelector('.version-group')!.textContent).not.toContain(
      '旧稿.pdf',
    );
    const file = await pick(host);
    expect(onSigned).toHaveBeenCalledExactlyOnceWith(file, latest.id);
  });

  it('历史展开保留旧稿的多个盖章件，孤立盖章件始终可见', async () => {
    const old = exported('旧稿', 1);
    const latest = exported('最新稿', 2);
    const files = [
      old,
      latest,
      signed('旧盖章甲', old.id),
      signed('旧盖章乙', old.id),
      signed('孤立盖章', 'missing'),
    ];
    const { host } = await mount(order([old, latest], files));
    expect(host.textContent).toContain('孤立盖章.pdf');
    expect(host.textContent).not.toContain('旧盖章甲.pdf');
    button(host, '展开历史导出').click();
    await settle();
    const oldGroup = [...host.querySelectorAll('.version-group')].find((item) =>
      item.textContent?.includes('旧稿.pdf'),
    )!;
    expect(oldGroup.textContent).toContain('旧盖章甲.pdf');
    expect(oldGroup.textContent).toContain('旧盖章乙.pdf');
    expect(oldGroup.textContent).toContain('已回传盖章件 2 份');
    expect(button(host, '收起历史导出').getAttribute('aria-expanded')).toBe(
      'true',
    );
    button(host, '收起历史导出').click();
    await settle();
    expect(host.textContent).not.toContain('旧盖章乙.pdf');
    expect(host.textContent).toContain('孤立盖章.pdf');
  });

  it('选择旧版上传使用其 ID，收到盖章上传结果或新增导出后保留主动选择', async () => {
    const old = exported('old', 1);
    const latest = exported('latest', 2);
    const { host, state, onSigned } = await mount(order([old, latest]));
    await chooseVersion(host, old.id);
    const file = await pick(host);
    expect(onSigned).toHaveBeenCalledExactlyOnceWith(file, old.id);
    const newer = exported('newer', 3);
    state.value.view = order(
      [newer, latest, old],
      [newer, latest, old, signed('回签', old.id)],
    );
    await settle();
    expect(host.querySelector<HTMLSelectElement>('select')!.value).toBe(old.id);
    expect(button(host, '补传盖章件').disabled).toBe(false);
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('');
  });

  it('所选历史稿被删除后回退最新稿，切换采购单时重置选择和历史展开', async () => {
    const old = exported('old', 1);
    const latest = exported('latest', 2);
    const { host, state, onSigned } = await mount(order([old, latest]));
    await chooseVersion(host, old.id);
    button(host, '展开历史导出').click();
    state.value.view = order([latest]);
    await settle();
    await pick(host);
    expect(onSigned.mock.calls[0]![1]).toBe(latest.id);
    state.value.view = { ...order([old, latest]), id: 'order-2' };
    await settle();
    expect(host.querySelector<HTMLSelectElement>('select')!.value).toBe(
      latest.id,
    );
    expect(button(host, '展开历史导出').getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('没有导出稿时显示引导，禁用盖章上传', async () => {
    const { host, onSigned } = await mount(order());
    expect(host.textContent).toContain('还没有采购单文件');
    expect(button(host, '上传供应商盖章件').disabled).toBe(true);
    await pick(host);
    expect(onSigned).not.toHaveBeenCalled();
  });

  it.each([
    { name: '存储不可用', saving: false, storageEnabled: false },
    { name: '正在保存', saving: true, storageEnabled: true },
  ])('$name 时禁止盖章上传', async ({ saving, storageEnabled }) => {
    const view = { ...order([exported('latest', 1)]), storageEnabled };
    const { host, onSigned } = await mount(view, saving);
    expect(button(host, '上传供应商盖章件').disabled).toBe(true);
    await pick(host);
    expect(onSigned).not.toHaveBeenCalled();
  });

  it('没有上传或删除权限时隐藏对应入口，并阻止残留选择事件上传', async () => {
    const { host, state, onSigned } = await mount();
    state.value.view = { ...state.value.view, allowedActions: [] };
    await settle();
    expect(host.textContent).not.toContain('上传供应商盖章件');
    expect(
      [...host.querySelectorAll('button')].some(
        (item) => item.textContent === '删除',
      ),
    ).toBe(false);
    await pick(host);
    expect(onSigned).not.toHaveBeenCalled();
  });

  it('有回签的导出稿不能删除，盖章件可删除；保存时预览下载删除均禁用', async () => {
    const latest = exported('latest', 1);
    const signature = signed('signature', latest.id);
    const { host, state, onDelete } = await mount(
      order([latest], [latest, signature]),
    );
    const rows = [...host.querySelectorAll('.file-row')];
    const exportDelete = button(rows[0] as HTMLElement, '删除');
    const signedDelete = button(rows[1] as HTMLElement, '删除');
    expect(exportDelete.disabled).toBe(true);
    expect(exportDelete.title).toContain('先删除对应的供应商盖章件');
    signedDelete.click();
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(signature);
    state.value.saving = true;
    await settle();
    expect(
      [
        ...host.querySelectorAll<HTMLButtonElement>('.file-actions button'),
      ].every((item) => item.disabled),
    ).toBe(true);
  });

  it('盖章件严格执行 20 MB 上限，边界大小仍能上传', async () => {
    const { host, onSigned } = await mount();
    const tooLarge = new File(['sample'], '过大盖章.pdf');
    Object.defineProperty(tooLarge, 'size', { value: 20 * 1024 * 1024 + 1 });
    await pick(host, tooLarge);
    expect(onSigned).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain(
      '不能超过 20 MB',
    );
    const boundary = new File(['sample'], '盖章.pdf');
    Object.defineProperty(boundary, 'size', { value: 20 * 1024 * 1024 });
    await pick(host, boundary);
    expect(onSigned).toHaveBeenCalledExactlyOnceWith(boundary, 'latest');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('空文件与不支持格式显示明确错误，不调用上传', async () => {
    const { host, onSigned } = await mount();
    await pick(host, new File([], '空盖章.pdf'));
    expect(host.querySelector('[role="alert"]')!.textContent).toContain(
      '大小须大于 0',
    );
    await pick(host, new File(['sample'], '盖章.exe'));
    expect(host.querySelector('[role="alert"]')!.textContent).toContain(
      '不支持',
    );
    expect(onSigned).not.toHaveBeenCalled();
  });
});
