import { createApp, h, nextTick, ref } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import FdmAutoComplete from './fdm-auto-complete';

const TARGET_WARNING =
  'Customize `getInputElement` should customize clear and placeholder logic';

describe('FdmAutoComplete', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps placeholder and clear behavior without the vc-select warning', async () => {
    const onClear = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const container = document.createElement('div');
    const value = ref('示例店铺');
    document.body.append(container);

    const app = createApp({
      setup: () => () =>
        h(FdmAutoComplete, {
          allowClear: true,
          onClear,
          'onUpdate:value': (nextValue) => {
            value.value = String(nextValue ?? '');
          },
          placeholder: '输入关键词或选择店铺',
          value: value.value,
        }),
    });
    app.mount(container);

    await nextTick();

    const input = container.querySelector('input');
    expect(input?.getAttribute('placeholder')).toBe('输入关键词或选择店铺');

    input?.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onClear).not.toHaveBeenCalled();

    container
      .querySelector<HTMLElement>('.ant-input-clear-icon')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(onClear).toHaveBeenCalledOnce();
    expect(
      warn.mock.calls.some((args) => args.join(' ').includes(TARGET_WARNING)),
    ).toBe(false);

    app.unmount();
    container.remove();
  });
});
