// Some older records copied a system number into the subject.
const generatedNumber =
  /^(?:HT-\d{8}-\d{6}|(?:CG|CK|DB|PD|RK|TH)\d{11,}|(?:BG|BX|CB|CG|CGFK|FKJH|FP|QK)-\d{8}-[\dA-F]{6,8})(?=$|[\s·])/i;

export function documentLabel(
  record: null | Record<string, unknown> | undefined,
  fallback: string,
  ...systemNumbers: unknown[]
): string {
  const hidden = new Set([record?.code, record?.id, ...systemNumbers]);
  for (const candidate of [
    record?.internalOrderNo,
    record?.subject,
    record?.name,
  ]) {
    if (typeof candidate !== 'string') continue;
    const title = candidate.trim();
    if (!title || hidden.has(title)) continue;
    const subject = title.replace(generatedNumber, '').replace(/^[\s·]+/, '');
    if (subject) return subject;
  }
  return fallback;
}

export function contractLabel(
  contract: null | undefined | { name?: unknown },
  fallback = '内部单号待补齐',
): string {
  return documentLabel({ name: contract?.name }, fallback);
}

export function documentRowLabel(
  row: {
    code?: unknown;
    contractCode?: unknown;
    name?: unknown;
    record: Record<string, unknown>;
  },
  fallback: string,
): string {
  return documentLabel(
    row.record,
    documentLabel(row, fallback, row.contractCode),
    row.code,
    row.contractCode,
  );
}
