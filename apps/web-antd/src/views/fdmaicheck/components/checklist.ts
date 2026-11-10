import type { FdmAiCheckApi } from '#/api/fdmaicheck';

export type Tone = 'fail' | 'na' | 'pass' | 'pending' | 'unknown' | 'warn';

/** 一行的结论：检查给出的结论，或者 PENDING（配置了但这次还没有结论）。 */
export type RowResult = 'PENDING' | FdmAiCheckApi.VerdictResult;

export const RESULT_META: Record<
  RowResult,
  { label: string; mark: string; tone: Tone }
> = {
  PASS: { label: '通过', mark: '✓', tone: 'pass' },
  FAIL: { label: '不通过', mark: '✕', tone: 'fail' },
  WARN: { label: '有疑问', mark: '!', tone: 'warn' },
  UNKNOWN: { label: '缺资料', mark: '?', tone: 'unknown' },
  NOT_APPLICABLE: { label: '不适用', mark: '—', tone: 'na' },
  PENDING: { label: '未检查', mark: '○', tone: 'pending' },
};

/** 结果条、清单里各结论的先后：先看要处理的，再看缺资料的，然后通过、不适用，最后是还没检查的。 */
export const RESULT_ORDER: RowResult[] = [
  'FAIL',
  'WARN',
  'UNKNOWN',
  'PASS',
  'NOT_APPLICABLE',
  'PENDING',
];

/** 清单里的一行：一个检查点，或者一条不属于任何检查点的问题。 */
export interface CheckRow {
  key: string;
  name: string;
  source: 'AI' | 'RULE';
  group?: null | string;
  result: RowResult;
  basis?: null | string;
  /** 检查什么（配置里写的），还没检查时显示 */
  description?: null | string;
  /** 这个检查点报出的问题 */
  findings: FdmAiCheckApi.Finding[];
  /** 其中还没处理的 */
  open: FdmAiCheckApi.Finding[];
  /** 不属于任何检查点的问题 */
  extra: boolean;
}

export interface Checklist {
  /** 有逐项结论（改版后的检查） */
  hasChecks: boolean;
  /** 不通过、提醒的项：没处理的在前，不通过在提醒前 */
  issues: CheckRow[];
  /** 通过的项 */
  passed: CheckRow[];
  /** 缺资料、没法判断的项 */
  unknown: CheckRow[];
  /** 不适用的项 */
  notApplicable: CheckRow[];
  /** 配置了、但还没有结论的项（没检查过、AI 没跑、检查后新加的） */
  pending: CheckRow[];
  /** 不适用、缺资料的项 */
  others: CheckRow[];
  /** 还有没处理问题的项 */
  openIssues: CheckRow[];
  tally: Record<RowResult, number>;
  total: number;
}

function keyOf(source: string, code?: null | string) {
  return `${source}|${code ?? ''}`;
}

function resultOfFindings(findings: FdmAiCheckApi.Finding[]): RowResult {
  return findings.some((f) => f.severity !== 'INFO') ? 'FAIL' : 'WARN';
}

/**
 * 把逐项结论和问题对到一起。问题按「来源 + 编码」归到检查点；对不上的（AI 的其他发现、没登记的规则、
 * 改版前的检查）各自成一行，放在问题里。
 * items 是当前配置的检查点：没有结论的也列出来，记为未检查，没检查过的单据也能看到要查哪些点。
 */
export function buildChecklist(
  checks: FdmAiCheckApi.Verdict[] | null | undefined,
  findings: FdmAiCheckApi.Finding[],
  items?: FdmAiCheckApi.CheckPoint[] | null,
): Checklist {
  const rows: CheckRow[] = [];
  const byKey = new Map<string, CheckRow>();
  for (const v of checks ?? []) {
    const key = keyOf(v.source, v.checkCode);
    if (byKey.has(key)) continue;
    const row: CheckRow = {
      key,
      name: v.name,
      source: v.source,
      group: v.group,
      result: v.result,
      basis: v.basis,
      findings: [],
      open: [],
      extra: false,
    };
    byKey.set(key, row);
    rows.push(row);
  }
  const described = new Map(
    (items ?? []).map((i) => [keyOf(i.source, i.checkCode), i]),
  );
  for (const row of rows)
    row.description = described.get(row.key)?.description ?? null;
  for (const item of items ?? []) {
    const key = keyOf(item.source, item.checkCode);
    if (byKey.has(key)) continue;
    const row: CheckRow = {
      key,
      name: item.name,
      source: item.source,
      group: item.group,
      result: 'PENDING',
      description: item.description,
      findings: [],
      open: [],
      extra: false,
    };
    byKey.set(key, row);
    rows.push(row);
  }
  for (const f of findings) {
    const row = f.checkCode ? byKey.get(keyOf(f.source, f.checkCode)) : null;
    if (row) {
      row.findings.push(f);
      continue;
    }
    rows.push({
      key: `finding-${f.id}`,
      name: f.source === 'RULE' ? '系统规则' : 'AI 其他发现',
      source: f.source,
      result: resultOfFindings([f]),
      findings: [f],
      open: [],
      extra: true,
    });
  }
  for (const row of rows) {
    row.open = row.findings.filter((f) => f.status === 'OPEN');
    // 结论以问题为准：报了问题的检查点不会显示通过
    if (
      row.findings.length > 0 &&
      row.result !== 'FAIL' &&
      row.result !== 'WARN'
    )
      row.result = resultOfFindings(row.findings);
  }
  const order = new Map(rows.map((r, i) => [r.key, i]));
  const issues = rows
    .filter((r) => r.result === 'FAIL' || r.result === 'WARN')
    .toSorted(
      (a, b) =>
        Number(a.open.length === 0) - Number(b.open.length === 0) ||
        Number(a.result !== 'FAIL') - Number(b.result !== 'FAIL') ||
        order.get(a.key)! - order.get(b.key)!,
    );
  const tally: Record<RowResult, number> = {
    PASS: 0,
    FAIL: 0,
    WARN: 0,
    NOT_APPLICABLE: 0,
    UNKNOWN: 0,
    PENDING: 0,
  };
  for (const r of rows) tally[r.result] += 1;
  return {
    hasChecks: (checks ?? []).length > 0,
    issues,
    passed: rows.filter((r) => r.result === 'PASS'),
    unknown: rows.filter((r) => r.result === 'UNKNOWN'),
    notApplicable: rows.filter((r) => r.result === 'NOT_APPLICABLE'),
    pending: rows.filter((r) => r.result === 'PENDING'),
    others: rows.filter(
      (r) => r.result === 'NOT_APPLICABLE' || r.result === 'UNKNOWN',
    ),
    openIssues: issues.filter((r) => r.open.length > 0),
    tally,
    total: rows.length,
  };
}

/** 收起时那一行里的问题标题。 */
export function headline(list: Checklist) {
  const first = list.openIssues[0];
  if (!first) return '';
  const text = first.open[0]?.message ?? first.name;
  return list.openIssues.length > 1
    ? `${text} 等 ${list.openIssues.length} 项需处理`
    : text;
}

/**
 * 默认展开还是收起：上次手动选过就按上次的；否则有结论就展开，通过的项也要直接看得到。
 */
export function defaultExpanded(list: Checklist, stored?: null | string) {
  if (stored === '1') return true;
  if (stored === '0') return false;
  return list.total > 0;
}

export type DrawerFilter =
  | 'ALL'
  | 'FAIL'
  | 'NOT_APPLICABLE'
  | 'PASS'
  | 'PENDING'
  | 'UNKNOWN'
  | 'WARN';

/** 全部依据抽屉的筛选和搜索。 */
export function filterRows(
  list: Checklist,
  filter: DrawerFilter,
  keyword = '',
) {
  const all = [
    ...list.issues,
    ...list.unknown,
    ...list.passed,
    ...list.notApplicable,
    ...list.pending,
  ];
  const word = keyword.trim();
  return all.filter(
    (r) =>
      (!word || r.name.includes(word)) &&
      (filter === 'ALL' || r.result === filter),
  );
}

/** 比例条各段宽度（百分比）。 */
export function segments(list: Checklist) {
  const total = list.total || 1;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  return {
    fail: pct(list.tally.FAIL),
    warn: pct(list.tally.WARN),
    unknown: pct(list.tally.UNKNOWN),
    pass: pct(list.tally.PASS),
  };
}

/**
 * 表格里的行顺序：没处理的问题、已处理的问题、缺资料、通过、不适用、未检查。
 * 和收起时结果条的顺序一致，要处理的总在最上面。
 */
export function tableRows(list: Checklist): CheckRow[] {
  return [
    ...list.issues.filter((r) => r.open.length > 0),
    ...list.issues.filter((r) => r.open.length === 0),
    ...list.unknown,
    ...list.passed,
    ...list.notApplicable,
    ...list.pending,
  ];
}

/** 表格「说明」列的一行摘要：有问题写问题，没问题写依据，没检查写检查什么。 */
export function rowSummary(row: CheckRow): string {
  const findings = row.open.length > 0 ? row.open : row.findings;
  if (findings.length > 0) {
    const text = findings[0]!.message;
    return findings.length > 1 ? `${text}（共 ${findings.length} 条）` : text;
  }
  if (row.basis) return row.basis;
  switch (row.result) {
    case 'NOT_APPLICABLE': {
      return '没有写原因';
    }
    case 'PENDING': {
      return row.description || '还没有检查这一项';
    }
    default: {
      return row.source === 'RULE' ? '系统规则没有发现问题' : '没有写依据';
    }
  }
}

/** 展开后的「依据」：和第一条问题说的一样就不重复写。 */
export function rowBasis(row: CheckRow): string {
  if (!row.basis || row.basis === row.findings[0]?.message) return '';
  return row.basis;
}
