import type { FdmFactorySupplyTaskApi } from '#/api/fdmfactory/supply-task';
import type { FdmWaimaoDemandPlanApi } from '#/api/fdmwaimao/demand-plan';

export const SUPPLY_TASK_AI_PERMISSION_CODES = [
  'fdmfactory:supply-task:query',
  'fdmfactory:supply-task:create',
  'fdmfactory:supply-task:update',
  'fdmdocflow:generation:query',
  'fdmdocflow:generation:create',
  'fdmdocflow:generation:retry',
] as const;

const CONFIDENCES = new Set<FdmFactorySupplyTaskApi.Confidence>([
  'HIGH',
  'LOW',
  'MEDIUM',
]);
const LINE_TOKEN = /^LINE-[0-9]{3}$/;
const FACTORY_TOKEN = /^FACTORY-[0-9]{3}$/;
const RISK_CODE = /^[A-Z0-9][A-Z0-9._:-]{0,63}$/;

export interface SupplyTaskSelectionDraft {
  confidence: FdmFactorySupplyTaskApi.Confidence;
  factoryToken: string;
  lineToken: string;
  reason: string;
  riskCodes: string[];
}

export interface SupplyTaskProposalDraft {
  selections: SupplyTaskSelectionDraft[];
  summary: string;
}

export interface SupplyTaskProposalValidation {
  hasHumanOverrides: boolean;
  issues: string[];
  overrideReason?: string;
  selections: FdmFactorySupplyTaskApi.MaterializeSelectionReq[];
  summary: string;
}

function decimalIsPositive(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return false;
  const normalized = String(value).trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return false;
  if (normalized.startsWith('-')) return false;
  return /[1-9]/.test(normalized.replace(/^[+]?0*/, ''));
}

export function hasFactoryDemand(detail?: FdmWaimaoDemandPlanApi.Detail) {
  return Boolean(
    detail?.lines.some((line) =>
      line.allocations.some(
        (allocation) =>
          allocation.type === 'INTERNAL_FACTORY' &&
          decimalIsPositive(allocation.quantity),
      ),
    ),
  );
}

export function canGenerateSupplyTask(
  detail: FdmWaimaoDemandPlanApi.Detail | undefined,
  hasPermission: (code: string) => boolean,
) {
  return Boolean(
    detail?.status === 'CONFIRMED' &&
    hasFactoryDemand(detail) &&
    SUPPLY_TASK_AI_PERMISSION_CODES.every((code) => hasPermission(code)),
  );
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function requiredString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

export function parseSupplyTaskProposal(
  normalizedJson?: null | string,
): FdmFactorySupplyTaskApi.NormalizedProposal | undefined {
  if (!normalizedJson) return undefined;
  try {
    const root = object(JSON.parse(normalizedJson));
    if (!root || !Array.isArray(root.lineSelections)) return undefined;
    const sourcePlanId = requiredString(root.sourcePlanId);
    const authorityHash = requiredString(root.authorityHash);
    const confirmedPlanSnapshotHash = requiredString(
      root.confirmedPlanSnapshotHash,
    );
    if (
      !sourcePlanId ||
      !/^\d+$/.test(sourcePlanId) ||
      !authorityHash ||
      !/^[\da-f]{64}$/i.test(authorityHash) ||
      !confirmedPlanSnapshotHash ||
      !/^[\da-f]{64}$/i.test(confirmedPlanSnapshotHash) ||
      !Number.isSafeInteger(root.sourcePlanVersion) ||
      Number(root.sourcePlanVersion) < 0 ||
      typeof root.summary !== 'string' ||
      root.summary.length > 2000
    ) {
      return undefined;
    }
    const seen = new Set<string>();
    const lineSelections: FdmFactorySupplyTaskApi.ProposalSelection[] = [];
    for (const rawSelection of root.lineSelections) {
      const selection = object(rawSelection);
      if (!selection) return undefined;
      const lineToken = requiredString(selection.lineToken);
      const factoryToken = requiredString(selection.factoryToken);
      const reason = requiredString(selection.reason);
      const confidence = requiredString(selection.confidence) as
        | FdmFactorySupplyTaskApi.Confidence
        | undefined;
      if (
        !lineToken ||
        !LINE_TOKEN.test(lineToken) ||
        seen.has(lineToken) ||
        !factoryToken ||
        !FACTORY_TOKEN.test(factoryToken) ||
        reason === undefined ||
        reason.length > 1000 ||
        !confidence ||
        !CONFIDENCES.has(confidence) ||
        !Array.isArray(selection.riskCodes) ||
        selection.riskCodes.length > 20 ||
        selection.riskCodes.some(
          (code) => typeof code !== 'string' || !RISK_CODE.test(code),
        )
      ) {
        return undefined;
      }
      const riskCodes = selection.riskCodes as string[];
      if (new Set(riskCodes).size !== riskCodes.length) return undefined;
      seen.add(lineToken);
      lineSelections.push({
        confidence,
        factoryToken,
        lineToken,
        reason,
        riskCodes: [...riskCodes],
      });
    }
    return {
      authorityHash,
      confirmedPlanSnapshotHash,
      lineSelections,
      sourcePlanId,
      sourcePlanVersion: Number(root.sourcePlanVersion),
      summary: root.summary,
    };
  } catch {
    return undefined;
  }
}

export function proposalDraft(
  proposal: FdmFactorySupplyTaskApi.NormalizedProposal,
): SupplyTaskProposalDraft {
  return {
    selections: proposal.lineSelections.map((selection) => ({
      ...selection,
      riskCodes: [...selection.riskCodes],
    })),
    summary: proposal.summary,
  };
}

export function hasSupplyTaskProposalOverrides(
  proposal: FdmFactorySupplyTaskApi.NormalizedProposal,
  draft: SupplyTaskProposalDraft,
) {
  if (proposal.summary.trim() !== draft.summary.trim()) return true;
  if (proposal.lineSelections.length !== draft.selections.length) return true;
  const originals = new Map(
    proposal.lineSelections.map((selection) => [
      selection.lineToken,
      selection,
    ]),
  );
  return draft.selections.some((selection) => {
    const original = originals.get(selection.lineToken);
    if (!original) return true;
    const riskCodes = selection.riskCodes
      .map((code) => code.trim())
      .filter(Boolean);
    return (
      original.factoryToken !== selection.factoryToken ||
      original.reason.trim() !== selection.reason.trim() ||
      original.confidence !== selection.confidence ||
      original.riskCodes.length !== riskCodes.length ||
      original.riskCodes.some((code, index) => code !== riskCodes[index])
    );
  });
}

function candidateLines(detail: FdmFactorySupplyTaskApi.GenerationDetail) {
  const lines = detail.proposal?.evidence?.candidateLines;
  return Array.isArray(lines) ? lines : [];
}

export function validateSupplyTaskProposalDraft(options: {
  detail: FdmFactorySupplyTaskApi.GenerationDetail;
  draft: SupplyTaskProposalDraft;
  overrideReason?: string;
  sourcePlanId: string;
  sourcePlanVersion: number;
}): SupplyTaskProposalValidation {
  const { detail, draft, sourcePlanId, sourcePlanVersion } = options;
  const issues: string[] = [];
  const proposal = parseSupplyTaskProposal(detail.proposal?.normalizedJson);
  if (detail.status !== 'READY') issues.push('生成任务尚未处于 READY 状态');
  if (detail.generationType !== 'DEMAND_TO_SUPPLY_TASK') {
    issues.push('生成任务类型不是内部工厂供货任务');
  }
  if (detail.source.type !== 'FULFILLMENT_PLAN') {
    issues.push('生成任务来源不是履约需求计划');
  }
  if (
    detail.source.id !== sourcePlanId ||
    detail.source.version !== String(sourcePlanVersion)
  ) {
    issues.push('生成任务来源与当前履约计划版本不一致');
  }
  if (!proposal) {
    issues.push('READY 提案格式无效，不能安全物化');
  } else if (
    proposal.sourcePlanId !== sourcePlanId ||
    proposal.sourcePlanVersion !== sourcePlanVersion
  ) {
    issues.push('READY 提案中的来源版本与当前履约计划不一致');
  }
  if (detail.proposal?.missingData?.length) {
    issues.push('READY 提案仍包含缺失的权威数据');
  }
  if (
    detail.rules.some((rule) => rule.severity === 'BLOCKER' && !rule.passed)
  ) {
    issues.push('READY 提案仍有未通过的服务端阻断规则');
  }
  const lines = candidateLines(detail);
  if (lines.length === 0) issues.push('服务端未返回可编辑的工厂候选证据');
  if (
    proposal &&
    detail.proposal?.evidence?.authorityHash !== proposal.authorityHash
  ) {
    issues.push('工厂候选证据与 READY 提案权威快照不一致');
  }
  if (draft.summary.trim().length > 2000) {
    issues.push('方案摘要不能超过 2000 字');
  }
  const hasHumanOverrides = proposal
    ? hasSupplyTaskProposalOverrides(proposal, draft)
    : false;
  const overrideReason = options.overrideReason?.trim() || undefined;
  if (hasHumanOverrides && !overrideReason) {
    issues.push('已调整 AI 原提案，请填写人工调整原因');
  }
  if (overrideReason && overrideReason.length > 1000) {
    issues.push('人工调整原因不能超过 1000 字');
  }

  const expectedTokens = new Set(lines.map((line) => line.lineToken));
  const seen = new Set<string>();
  const selections: FdmFactorySupplyTaskApi.MaterializeSelectionReq[] = [];
  for (const selection of draft.selections) {
    if (
      !expectedTokens.has(selection.lineToken) ||
      seen.has(selection.lineToken)
    ) {
      issues.push(`需求行 ${selection.lineToken} 不属于当前候选快照或重复出现`);
      continue;
    }
    seen.add(selection.lineToken);
    const line = lines.find((item) => item.lineToken === selection.lineToken);
    const candidate = line?.candidates.find(
      (item) => item.factoryToken === selection.factoryToken,
    );
    if (!candidate || !candidate.selectable) {
      issues.push(`需求行 ${selection.lineToken} 请选择服务端标记为可用的工厂`);
    }
    const reason = selection.reason.trim();
    if (reason.length > 1000) {
      issues.push(`需求行 ${selection.lineToken} 的选择理由不能超过 1000 字`);
    }
    if (!CONFIDENCES.has(selection.confidence)) {
      issues.push(`需求行 ${selection.lineToken} 的信心等级无效`);
    }
    const risks = selection.riskCodes
      .map((code) => code.trim())
      .filter(Boolean);
    if (
      risks.length > 20 ||
      new Set(risks).size !== risks.length ||
      risks.some((code) => !RISK_CODE.test(code))
    ) {
      issues.push(`需求行 ${selection.lineToken} 的风险代码格式无效或重复`);
    }
    selections.push({
      confidence: selection.confidence,
      factoryToken: selection.factoryToken,
      lineToken: selection.lineToken,
      reason,
      riskCodes: risks,
    });
  }
  if (seen.size !== expectedTokens.size) {
    issues.push('工厂选择必须且只能覆盖每一条内部生产需求');
  }
  return {
    hasHumanOverrides,
    issues,
    overrideReason: hasHumanOverrides ? overrideReason : undefined,
    selections,
    summary: draft.summary.trim(),
  };
}

export function supplyTaskStatusMeta(status?: string) {
  const values: Record<string, { color: string; label: string }> = {
    CANCELLED: { color: 'default', label: '已取消' },
    CONFIRMED: { color: 'cyan', label: '已确认草稿' },
    DRAFT: { color: 'blue', label: '任务草稿' },
    FAILED: { color: 'red', label: '处理失败' },
    HANDED_OFF: { color: 'green', label: '已交接生产执行' },
  };
  return values[status || ''] || { color: 'default', label: status || '未知' };
}

export function atpStatusMeta(status?: null | string) {
  const values: Record<string, { color: string; label: string }> = {
    AVAILABLE: { color: 'green', label: 'ATP 可用' },
    UNAVAILABLE: { color: 'red', label: '不可用' },
    UNKNOWN: { color: 'orange', label: 'ATP 未知' },
    ZERO: { color: 'default', label: 'ATP 为零' },
  };
  return (
    values[status || ''] || { color: 'default', label: status || '未提供' }
  );
}
