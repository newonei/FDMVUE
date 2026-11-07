import type { FdmAiCheckApi } from '#/api/fdmaicheck';

import { describe, expect, it } from 'vitest';

import {
  buildChecklist,
  defaultExpanded,
  filterRows,
  headline,
} from './checklist';

const verdict = (
  checkCode: string,
  result: FdmAiCheckApi.VerdictResult,
  source: 'AI' | 'RULE' = 'AI',
): FdmAiCheckApi.Verdict => ({
  source,
  checkCode,
  name: checkCode,
  result,
  basis: `${checkCode} 依据`,
  evidenceIds: [],
});

const finding = (
  id: number,
  checkCode: string | undefined,
  severity: 'HIGH' | 'INFO' | 'WARNING' = 'WARNING',
  status: FdmAiCheckApi.FindingStatus = 'OPEN',
  source: 'AI' | 'RULE' = 'AI',
): FdmAiCheckApi.Finding => ({
  id,
  source,
  checkCode,
  severity,
  status,
  message: `问题 ${id}`,
  evidenceIds: [],
});

describe('aI 检查清单', () => {
  it('groups verdicts and attaches findings by source and code', () => {
    const list = buildChecklist(
      [
        verdict('PRICE_MISSING', 'PASS', 'RULE'),
        verdict('ATTACH', 'FAIL'),
        verdict('PRICE', 'PASS'),
        verdict('TERMS', 'NOT_APPLICABLE'),
        verdict('SPEC', 'WARN'),
      ],
      [
        finding(1, 'ATTACH'),
        finding(2, 'PRICE', 'INFO'),
        finding(3, undefined, 'HIGH'),
        finding(4, 'SPEC', 'INFO', 'FALSE_POSITIVE'),
      ],
    );
    expect(list.hasChecks).toBe(true);
    expect(list.issues.map((r) => r.key)).toEqual([
      'AI|ATTACH',
      'finding-3',
      'AI|PRICE',
      'AI|SPEC',
    ]);
    expect(list.issues.find((r) => r.key === 'AI|PRICE')?.result).toBe('WARN');
    expect(list.passed.map((r) => r.key)).toEqual(['RULE|PRICE_MISSING']);
    expect(list.others.map((r) => r.key)).toEqual(['AI|TERMS']);
    expect(list.openIssues).toHaveLength(3);
    expect(list.tally).toEqual({
      PASS: 1,
      FAIL: 2,
      WARN: 2,
      NOT_APPLICABLE: 1,
      UNKNOWN: 0,
      PENDING: 0,
    });
    expect(headline(list)).toBe('问题 1 等 3 项需处理');
  });

  it('shows old checks as plain findings', () => {
    const list = buildChecklist(undefined, [finding(1, 'X')]);
    expect(list.hasChecks).toBe(false);
    expect(list.issues).toHaveLength(1);
    expect(list.issues[0]!.extra).toBe(true);
  });

  it('opens whenever there are results unless the user chose otherwise', () => {
    const serious = buildChecklist([verdict('A', 'FAIL')], [finding(1, 'A')]);
    const mild = buildChecklist(
      [verdict('A', 'WARN')],
      [finding(1, 'A', 'INFO')],
    );
    const clean = buildChecklist([verdict('A', 'PASS')], []);
    expect(defaultExpanded(serious)).toBe(true);
    expect(defaultExpanded(mild)).toBe(true);
    expect(defaultExpanded(clean)).toBe(true);
    expect(defaultExpanded(buildChecklist([], []))).toBe(false);
    expect(defaultExpanded(clean, '1')).toBe(true);
    expect(defaultExpanded(serious, '0')).toBe(false);
    expect(headline(clean)).toBe('');
  });

  it('filters the drawer by result and name', () => {
    const list = buildChecklist(
      [
        verdict('附件', 'FAIL'),
        verdict('单价', 'PASS'),
        verdict('交期', 'UNKNOWN'),
      ],
      [finding(1, '附件')],
    );
    expect(filterRows(list, 'ALL')).toHaveLength(3);
    expect(filterRows(list, 'PASS').map((r) => r.name)).toEqual(['单价']);
    expect(filterRows(list, 'UNKNOWN').map((r) => r.name)).toEqual(['交期']);
    expect(filterRows(list, 'ALL', '附').map((r) => r.name)).toEqual(['附件']);
  });

  it('lists configured check points even before any check', () => {
    const items: FdmAiCheckApi.CheckPoint[] = [
      { source: 'RULE', checkCode: 'PRICE_MISSING', name: '单价已填写' },
      {
        source: 'AI',
        checkCode: 'ATTACH',
        name: '附件和合同对不上',
        group: '附件',
        description: '核对附件',
      },
    ];
    const never = buildChecklist(undefined, [], items);
    expect(never.total).toBe(2);
    expect(never.pending.map((r) => r.key)).toEqual([
      'RULE|PRICE_MISSING',
      'AI|ATTACH',
    ]);
    expect(never.pending[1]?.description).toBe('核对附件');
    expect(defaultExpanded(never)).toBe(true);

    // AI 没跑：规则有结论，AI 检查点仍列为未检查；报了问题的检查点不算未检查
    const rulesOnly = buildChecklist(
      [verdict('PRICE_MISSING', 'PASS', 'RULE')],
      [],
      items,
    );
    expect(rulesOnly.tally.PASS).toBe(1);
    expect(rulesOnly.tally.PENDING).toBe(1);
    expect(filterRows(rulesOnly, 'PENDING').map((r) => r.key)).toEqual([
      'AI|ATTACH',
    ]);
    const withFinding = buildChecklist(
      undefined,
      [finding(1, 'ATTACH')],
      items,
    );
    expect(withFinding.pending.map((r) => r.key)).toEqual([
      'RULE|PRICE_MISSING',
    ]);
    expect(withFinding.issues.map((r) => r.key)).toEqual(['AI|ATTACH']);
  });
});
