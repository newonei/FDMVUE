import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, describe, expect, it } from 'vitest';

import AttrFields from './modules/attr-fields.vue';

let unmount: (() => void) | undefined;
afterEach(() => { unmount?.(); document.body.innerHTML = ''; });

describe('thickness input precision', () => {
  it.each([
    { unit: 'mm' as const, initial: 3.25, entered: '3.75' },
    { unit: 'cm' as const, initial: 0.325, entered: '0.375' },
  ])('preserves half-layer thickness in $unit', async ({ unit, initial, entered }) => {
    const attrs = ref<Api.ItemAttrs>({ thickness: 0.325 });
    const options: Api.Options = { colors: [], materials: [], patterns: [], processes: [], rawMaterials: [], recipes: [], stages: [], textures: [] };
    const host = document.createElement('div'); document.body.append(host);
    const app = createApp(defineComponent({ setup: () => () => h(AttrFields, {
      dimensionUnit: unit, fields: ['thickness'], idPrefix: 'precision', modelValue: attrs.value, options,
      'onUpdate:modelValue': (value: Api.ItemAttrs) => { attrs.value = value; },
    }) }));
    app.mount(host); unmount = () => app.unmount(); await nextTick();
    const input = document.querySelector<HTMLInputElement>('#precision-thickness')!;
    expect(Number(input.value)).toBe(initial);
    input.focus(); input.value = entered;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await nextTick();
    expect(attrs.value.thickness).toBe(0.375);
    expect(Number(input.value)).toBe(Number(entered));
  });
});
