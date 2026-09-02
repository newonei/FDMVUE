import { describe, expect, it } from 'vitest';

import {
  cleanOkkiText,
  formatOkkiDateTime,
  formatOkkiPhone,
  stageLabel,
} from './display';

describe('okki import display helpers', () => {
  it('removes all OKKI search highlight markers', () => {
    expect(cleanOkkiText('#{Olivia}# #{Houis}#')).toBe('Olivia Houis');
    expect(cleanOkkiText('Global #{Olivia}# France')).toBe(
      'Global Olivia France',
    );
  });

  it('keeps ordinary hash and brace characters', () => {
    expect(cleanOkkiText('Global #Olivia {Houis}')).toBe(
      'Global #Olivia {Houis}',
    );
  });

  it('accepts numeric scalars without stringifying unsafe OKKI structures', () => {
    expect(cleanOkkiText(102_445)).toBe('102445');
    expect(cleanOkkiText(10_573_235_568_5909n)).toBe('105732355685909');
    expect(cleanOkkiText(false)).toBe('');
    expect(cleanOkkiText(['Olivia', 'secret'])).toBe('');
    expect(cleanOkkiText({ accessToken: 'must-not-render' })).toBe('');
    expect(
      cleanOkkiText({
        toString() {
          throw new Error('must not stringify remote objects');
        },
      }),
    ).toBe('');
  });

  it('formats framework epoch-millis LocalDateTime values', () => {
    const epochMillis = new Date(2026, 7, 28, 14, 12, 40).getTime();
    expect(formatOkkiDateTime(epochMillis)).toBe('2026-08-28 14:12');
    expect(formatOkkiDateTime('2026-08-28T14:12:40')).toBe('2026-08-28 14:12');
    expect(formatOkkiDateTime({ value: epochMillis })).toBe('OKKI 未提供');
    expect(formatOkkiDateTime(Number.NaN, '—')).toBe('—');
  });

  it('formats phone and an explicit empty stage without placeholders', () => {
    expect(formatOkkiPhone('+33', '123 456')).toBe('+33 123 456');
    expect(stageLabel('无')).toBe('无阶段');
    expect(stageLabel(undefined)).toBe('无阶段');
  });
});
