import type { FdmAiCheckApi } from '#/api/fdmaicheck';

export type Tone = 'fail' | 'na' | 'pass' | 'warn';

export const RESULT_META: Record<
  FdmAiCheckApi.VerdictResult,
  { label: string; mark: string; tone: Tone }
> = {
  PASS: { label: '通过', mark: '✓', tone: 'pass' },
  FAIL: { label: '不通过', mark: '✕', tone: 'fail' },
  WARN: { label: '提醒', mark: '!', tone: 'warn' },
  NOT_APPLICABLE: { label: '不适用', mark: '—', tone: 'na' },
  UNKNOWN: { label: '资料不足', mark: '?', tone: 'na' },
};

/** 清单里的一行：一个检查点，或者一条不属于任何检查点的问题。 */
export interface CheckRow {
  key: string;
  name: string;
  source: 'AI' | 'RULE';
  group?: null | string;
  result: FdmAiCheckApi.VerdictResult;
  basis?: null | string;
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
  /** 不适用、资料不足的项 */
  others: CheckRow[];
  /** 还有没处理问题的项 */
  openIssues: CheckRow[];
  tally: Record<FdmAiCheckApi.VerdictResult, number>;
  total: number;
}

function keyOf(source: string, code?: null | string) {
  return `${source}|${code ?? ''}`;
}

function resultOfFindings(
  findings: FdmAiCheckApi.Finding[],
): FdmAiCheckApi.VerdictResult {
  return findings.some((f) => f.severity !== 'INFO') ? 'FAIL' : 'WARN';
}

/**
 * 把逐项结论和问题对到一起。问题按「来源 + 编码」归到检查点；对不上的（AI 的其他发现、没登记的规则、
 * 改版前的检查）各自成一行，放在问题里。
 */
export function buildChecklist(
  checks: FdmAiCheckApi.Verdict[] | null | undefined,
  findings: FdmAiCheckApi.Finding[],
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
  const tally: Record<FdmAiCheckApi.VerdictResult, number> = {
    PASS: 0,
    FAIL: 0,
    WARN: 0,
    NOT_APPLICABLE: 0,
    UNKNOWN: 0,
  };
  for (const r of rows) tally[r.result] += 1;
  return {
    hasChecks: (checks ?? []).length > 0,
    issues,
    passed: rows.filter((r) => r.result === 'PASS'),
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
 * 默认展开还是收起：上次手动选过就按上次的；否则有没处理的需核对及以上问题时展开，只有提醒或全部通过时收起。
 */
export function defaultExpanded(list: Checklist, stored?: null | string) {
  if (stored === '1') return true;
  if (stored === '0') return false;
  return list.openIssues.some((r) => r.open.some((f) => f.severity !== 'INFO'));
}

export type DrawerFilter = 'ALL' | 'FAIL' | 'OTHER' | 'PASS' | 'WARN';

/** 全部依据抽屉的筛选和搜索。 */
export function filterRows(
  list: Checklist,
  filter: DrawerFilter,
  keyword = '',
) {
  const all = [...list.issues, ...list.passed, ...list.others];
  const word = keyword.trim();
  return all.filter((r) => {
    if (word && !r.name.includes(word)) return false;
    switch (filter) {
      case 'FAIL':
      case 'PASS':
      case 'WARN': {
        return r.result === filter;
      }
      case 'OTHER': {
        return r.result === 'NOT_APPLICABLE' || r.result === 'UNKNOWN';
      }
      default: {
        return true;
      }
    }
  });
}

/** 比例条各段宽度（百分比）。 */
export function segments(list: Checklist) {
  const total = list.total || 1;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  return {
    fail: pct(list.tally.FAIL),
    warn: pct(list.tally.WARN),
    pass: pct(list.tally.PASS),
  };
}
