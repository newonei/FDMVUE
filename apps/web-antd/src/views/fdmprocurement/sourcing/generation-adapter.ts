import type { FdmProcurementSourcingGenerationApi } from '#/api/fdmprocurement/sourcing/generation';
import type {
  AiGenerationJob,
  AiGenerationStage,
  AiValidationIssue,
} from '#/views/fdm-trade-shared/ai-document-generation';

function severity(value: string): AiValidationIssue['severity'] {
  const normalized = value.toUpperCase();
  if (normalized === 'INFO' || normalized === 'WARNING') return normalized;
  return 'BLOCKER';
}

export function adaptSourcingGenerationRules(
  rules: readonly FdmProcurementSourcingGenerationApi.Rule[],
) {
  return rules
    .filter((rule) => !rule.passed || rule.severity.toUpperCase() !== 'INFO')
    .map<AiValidationIssue>((rule) => ({
      code: rule.ruleCode,
      fieldKey: rule.fieldPath || undefined,
      message: rule.message,
      severity: severity(rule.severity),
    }));
}

function stage(
  status: FdmProcurementSourcingGenerationApi.JobStatus,
): AiGenerationStage | null {
  const stages: Partial<
    Record<FdmProcurementSourcingGenerationApi.JobStatus, AiGenerationStage>
  > = {
    CONTEXT_BUILDING: 'EVIDENCE',
    CREATED: 'CONTEXT',
    GENERATING: 'MODEL',
    PARSING: 'PARSING',
    QUEUED: 'CONTEXT',
    VALIDATING: 'VALIDATION',
  };
  return stages[status] || null;
}

export function adaptSourcingGenerationJob(
  job: FdmProcurementSourcingGenerationApi.Job,
): AiGenerationJob<FdmProcurementSourcingGenerationApi.Proposal> {
  return {
    errorMessage: job.errorMessage,
    generatedAt: job.completedAt || undefined,
    id: job.id,
    invocationId: job.invocationId,
    modelId: job.modelId,
    modelName: job.modelName,
    proposal: job.proposal || undefined,
    proposalVersion: job.proposalVersion || undefined,
    sourceVersion: job.sourceVersion,
    stage: stage(job.status),
    status: job.status,
    traceId: job.traceId,
    version: job.version,
  };
}

export function sourcingPlanByToken(
  facts: FdmProcurementSourcingGenerationApi.PreparedFacts,
  planToken?: null | string,
) {
  if (!planToken || planToken === 'NO_AUTOMATIC_PLAN') return undefined;
  return facts.feasiblePlans.find((plan) => plan.planToken === planToken);
}

export function proposalTokenIssues(
  proposal: FdmProcurementSourcingGenerationApi.Proposal,
  facts: FdmProcurementSourcingGenerationApi.PreparedFacts,
) {
  const issues: string[] = [];
  if (
    proposal.recommendedPlanToken === 'NO_AUTOMATIC_PLAN' ||
    !sourcingPlanByToken(facts, proposal.recommendedPlanToken)
  ) {
    issues.push('AI 推荐方案不是当前服务端可行 PLAN token');
  }
  const alternatives = new Set<string>();
  proposal.alternativePlanTokens.forEach((token) => {
    if (
      token === proposal.recommendedPlanToken ||
      token === 'NO_AUTOMATIC_PLAN' ||
      alternatives.has(token) ||
      !sourcingPlanByToken(facts, token)
    ) {
      issues.push(`AI 备选方案 ${token} 不是可用的唯一服务端 PLAN token`);
    }
    alternatives.add(token);
  });
  return issues;
}
