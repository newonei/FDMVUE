/* eslint-disable vue/one-component-per-file -- UI adapters exercise the real sharing workflow without browser dependencies. */
import type { App } from 'vue';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Community from './index.vue';
import { skill } from './test-fixtures';

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  detail: vi.fn(),
  upload: vi.fn(),
  publish: vi.fn(),
  remove: vi.fn(),
  download: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  save: vi.fn(),
  user: { userInfo: { id: 7 }, userRoles: [] as string[] },
}));
vi.mock('#/api/fdmskill/community', () => ({
  getCommunityCatalog: mocks.catalog,
  getCommunityDetail: mocks.detail,
  uploadCommunitySkill: mocks.upload,
  publishCommunitySkill: mocks.publish,
  deleteCommunitySkill: mocks.remove,
  downloadCommunityArchive: mocks.download,
}));
vi.mock('@vben/stores', () => ({ useUserStore: () => mocks.user }));
vi.mock('@vben/utils', () => ({ downloadFileFromBlobPart: mocks.save }));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup: (_, context) => () => h('main', context.slots.default?.()),
  }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup: (_, context) => () =>
      h('div', context.attrs, context.slots.default?.()),
  });
  const button = defineComponent({
    props: { disabled: Boolean },
    setup: (props, context) => () =>
      h(
        'button',
        { ...context.attrs, disabled: props.disabled },
        context.slots.default?.(),
      ),
  });
  const input = defineComponent({
    props: { value: { type: String, default: '' }, disabled: Boolean },
    emits: ['update:value'],
    setup: (props, context) => () =>
      h('input', {
        ...context.attrs,
        value: props.value,
        disabled: props.disabled,
        onInput: (event: Event) =>
          context.emit(
            'update:value',
            (event.target as HTMLInputElement).value,
          ),
      }),
  });
  const modal = Object.assign(
    defineComponent({
      props: {
        open: Boolean,
        title: { type: String, default: '' },
        okText: { type: String, default: '' },
        confirmLoading: Boolean,
      },
      emits: ['ok'],
      setup: (props, context) => () =>
        props.open
          ? h('section', { 'aria-label': props.title }, [
              context.slots.default?.(),
              props.okText
                ? h(
                    'button',
                    {
                      disabled: props.confirmLoading,
                      onClick: () => context.emit('ok'),
                    },
                    props.okText,
                  )
                : null,
            ])
          : null,
    }),
    { confirm: mocks.confirm },
  );
  return {
    Alert: defineComponent({
      props: {
        message: { type: String, default: '' },
        description: { type: String, default: '' },
      },
      setup: (props) => () =>
        h('aside', `${props.message} ${props.description}`),
    }),
    Button: button,
    Card: block,
    Descriptions: block,
    DescriptionsItem: block,
    Empty: block,
    Form: block,
    FormItem: block,
    Input: input,
    Modal: modal,
    Select: block,
    Space: block,
    Spin: block,
    Tag: block,
    Tabs: defineComponent({
      props: { activeKey: { type: String, default: 'square' } },
      emits: ['update:activeKey'],
      setup: (_, context) => () =>
        h('nav', [
          h(
            'button',
            { onClick: () => context.emit('update:activeKey', 'square') },
            '技能广场',
          ),
          h(
            'button',
            { onClick: () => context.emit('update:activeKey', 'mine') },
            '我的技能',
          ),
        ]),
    }),
    TabPane: block,
    message: { success: mocks.success, error: mocks.error },
  };
});

let app: App | undefined;
let host: HTMLDivElement;
async function flush() {
  for (let step = 0; step < 6; step++) {
    await Promise.resolve();
    await nextTick();
  }
}
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(Community);
  app.mount(host);
  await flush();
}
function findButton(text: string, container: ParentNode = host) {
  const button = [...container.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Missing button ${text}`);
  return button;
}
function card(id: string) {
  return host.querySelector<HTMLElement>(`[data-skill-id="${id}"]`)!;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.userRoles = [];
  mocks.catalog.mockResolvedValue({
    revision: 'r1',
    entries: [
      skill({ id: 'foreign', ownerId: 9 }),
      skill({ id: 'draft', published: false }),
    ],
  });
  mocks.detail.mockResolvedValue({
    entry: skill({ id: 'foreign', ownerId: 9 }),
    readme: '<script>alert("unsafe")</script>\n# 说明',
  });
  mocks.download.mockResolvedValue(
    new Blob(['zip'], { type: 'application/zip' }),
  );
});
afterEach(() => {
  app?.unmount();
  host?.remove();
});

describe('company skill sharing page', () => {
  it('limits owner controls and separates published square from own drafts', async () => {
    await mount();
    expect(card('foreign')).toBeTruthy();
    expect(card('foreign').textContent).not.toContain('删除');
    expect(card('draft')).toBeNull();
    findButton('我的技能').click();
    await flush();
    expect(card('draft')).toBeTruthy();
    expect(card('foreign')).toBeNull();
    findButton('发布', card('draft')).click();
    expect(mocks.publish).not.toHaveBeenCalled();
    mocks.publish.mockResolvedValue(skill({ id: 'draft', published: true }));
    await mocks.confirm.mock.calls[0]![0].onOk();
    await flush();
    expect(mocks.publish).toHaveBeenCalledWith('draft', true);
    expect(card('draft').textContent).toContain('已发布');
  });

  it('gives moderation controls to administrators and preserves rows on delete errors', async () => {
    mocks.user.userRoles = ['super_admin'];
    await mount();
    findButton('删除', card('foreign')).click();
    mocks.remove.mockRejectedValueOnce({ data: { msg: '删除被拒绝' } });
    await mocks.confirm.mock.calls[0]![0].onOk();
    await flush();
    expect(card('foreign')).toBeTruthy();
    expect(host.textContent).toContain('删除被拒绝');
  });

  it('uploads selected ZIP as a draft and switches to my skills without publishing', async () => {
    await mount();
    findButton('上传技能').click();
    await flush();
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['zip'], 'skill.zip', { type: 'application/zip' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    mocks.upload.mockResolvedValueOnce(
      skill({ id: 'uploaded', published: false }),
    );
    findButton('上传为草稿').click();
    await flush();
    expect(mocks.upload).toHaveBeenCalledWith({
      file,
      title: '',
      version: '1.0.0',
      category: '通用',
      license: '未声明',
    });
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(card('uploaded')).toBeTruthy();
    expect(card('foreign')).toBeNull();
  });

  it('keeps upload failure and file selection available for retry', async () => {
    await mount();
    findButton('上传技能').click();
    await flush();
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', {
      value: [new File(['zip'], 'bad.zip')],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    mocks.upload.mockRejectedValueOnce({ data: { msg: '缺少 SKILL.md' } });
    findButton('上传为草稿').click();
    await flush();
    expect(host.querySelector('[aria-label="上传技能包"]')).toBeTruthy();
    expect(host.textContent).toContain('缺少 SKILL.md');
    expect(host.textContent).toContain('bad.zip');
  });

  it('renders README as text and saves only valid ZIP responses', async () => {
    await mount();
    findButton('查看说明', card('foreign')).click();
    await flush();
    expect(
      host.querySelector('[data-testid="skill-readme"]')!.textContent,
    ).toContain('<script>');
    expect(host.querySelector('script')).toBeNull();
    findButton('下载技能包', card('foreign')).click();
    await flush();
    expect(mocks.save).toHaveBeenCalledWith({
      fileName: 'office-skill-1.0.0.zip',
      source: expect.any(Blob),
    });
    mocks.download.mockResolvedValueOnce(
      new Blob(['zip'], { type: 'application/json' }),
    );
    findButton('下载技能包', card('foreign')).click();
    await flush();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('下载内容');
  });

  it('preserves an already loaded catalog when refresh fails', async () => {
    await mount();
    mocks.catalog.mockRejectedValueOnce(new Error('暂时不可用'));
    findButton('刷新').click();
    await flush();
    expect(card('foreign')).toBeTruthy();
    expect(host.textContent).toContain('暂时不可用');
  });
});
