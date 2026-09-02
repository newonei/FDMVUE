import type { AiFieldState } from './types';

export function aiFieldValueEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false;
  }
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function displayAiFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未提供';
  if (typeof value !== 'object') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '无法展示的复杂值';
  }
}

export function isAiFieldDraftChanged(field?: AiFieldState): boolean {
  if (!field) return false;
  return !aiFieldValueEquals(field.proposedValue, field.currentValue);
}
