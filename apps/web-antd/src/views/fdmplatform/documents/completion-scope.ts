/** Imported records that still need completion stay out of daily lists and wait in their own queue. */
export type CompletionScope = 'all' | 'current' | 'pending';

export function completionFilter(scope: CompletionScope): boolean | undefined {
  if (scope === 'all') return undefined;
  return scope === 'pending';
}

/** Portal links may preselect a scope with `?scope=`. */
export function scopeFromQuery(value: unknown): CompletionScope | undefined {
  return value === 'all' || value === 'current' || value === 'pending'
    ? value
    : undefined;
}

/** A contract context shows every record of that contract, including ones still to be completed. */
export function defaultCompletionScope(contractId?: string): CompletionScope {
  return contractId ? 'all' : 'current';
}
