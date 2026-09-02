import { describe, expect, it } from 'vitest';

import {
  adoptAiAlternative,
  createAiFieldStateMap,
  markAiFieldManual,
  mergeAiFieldStateMaps,
  restoreAiField,
} from './field-state';

describe('aI field provenance state', () => {
  const proposal = [
    {
      alternatives: [{ id: 'alt-1', label: '备选', value: '8.5' }],
      fieldKey: 'quantity',
      label: '数量',
      origin: 'AI_INFERRED' as const,
      proposedValue: '10',
    },
  ];

  it('marks edits and restores the latest AI value', () => {
    const initial = createAiFieldStateMap(proposal);
    const edited = markAiFieldManual(initial, 'quantity', '9');
    expect(edited.quantity?.origin).toBe('HUMAN_EDIT');
    expect(edited.quantity?.currentValue).toBe('9');

    const restored = restoreAiField(edited, 'quantity');
    expect(restored?.value).toBe('10');
    expect(restored?.fields.quantity?.origin).toBe('AI_INFERRED');
  });

  it('does not mark an unchanged proposal value as a human edit', () => {
    const initial = createAiFieldStateMap(proposal);
    const unchanged = markAiFieldManual(initial, 'quantity', '10');
    expect(unchanged.quantity?.origin).toBe('AI_INFERRED');
  });

  it('never overwrites human edits during regeneration', () => {
    const edited = markAiFieldManual(
      createAiFieldStateMap(proposal),
      'quantity',
      '9',
    );
    const merged = mergeAiFieldStateMaps(edited, [
      { ...proposal[0]!, proposedValue: '12' },
    ]);

    expect(merged.quantity?.currentValue).toBe('9');
    expect(merged.quantity?.proposedValue).toBe('12');
    expect(merged.quantity?.origin).toBe('HUMAN_EDIT');
  });

  it('adopts alternatives as an explicit human decision', () => {
    const adopted = adoptAiAlternative(
      createAiFieldStateMap(proposal),
      'quantity',
      'alt-1',
    );
    expect(adopted?.value).toBe('8.5');
    expect(adopted?.fields.quantity?.origin).toBe('HUMAN_EDIT');
  });
});
