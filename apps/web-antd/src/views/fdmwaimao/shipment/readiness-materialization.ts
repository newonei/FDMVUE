import type { FdmWaimaoShipmentApi } from '#/api/fdmwaimao/shipment';

const READINESS_REQUIRED_BLOCKER_CODES = [
  'SOURCE_DRAFT_CURRENT',
  'CONFIRMED_SOURCE_HASHES_CURRENT',
  'WAREHOUSE_EXPLICIT_AUTHORITY',
  'AT_LEAST_ONE_LINE',
  'CONTROLLED_LINE_SELECTION',
  'PRODUCT_WAREHOUSE_UNIT_LOCKED',
  'PLAN_REMAINING_LIMIT',
  'WAREHOUSE_READY_LINE_LIMIT',
  'WAREHOUSE_POOL_SKU_ATP_AGGREGATE',
  'DRAFT_ONLY',
  'NO_RESERVATION',
  'NO_OUTBOUND',
] as const;

const requiredBlockerCodes = new Set<string>(READINESS_REQUIRED_BLOCKER_CODES);
const lowercaseSha256 = /^[0-9a-f]{64}$/;
const nonNegativeLong = /^(?:0|[1-9]\d*)$/;

/**
 * A client-side fail-closed display gate. The server remains the authority and repeats every
 * source, proposal, rule, quantity, warehouse and evidence validation during materialization.
 */
function canMaterializeReadinessJob(
  job: FdmWaimaoShipmentApi.ReadinessGenerationJob | undefined,
) {
  if (
    !job ||
    job.status !== 'READY' ||
    !job.proposal ||
    !Number.isInteger(job.proposalVersion) ||
    (job.proposalVersion ?? 0) <= 0 ||
    job.proposalSchemaVersion !== '1.0' ||
    !lowercaseSha256.test(job.proposalHash ?? '') ||
    !lowercaseSha256.test(job.sourceSnapshotHash) ||
    !nonNegativeLong.test(job.version) ||
    job.proposal.targetDocumentType !== 'FDM_WAIMAO_SHIPMENT' ||
    job.proposal.targetStatus !== 'DRAFT' ||
    job.proposal.sourceShipmentId !== job.sourceId ||
    String(job.proposal.sourceShipmentVersion) !== job.sourceVersion ||
    job.proposal.lineSelections.length === 0 ||
    job.proposal.effects.materialized ||
    job.proposal.effects.outboundCreated ||
    job.proposal.effects.reservationCreated ||
    job.proposal.effects.stockDeducted ||
    job.rules.length !== requiredBlockerCodes.size
  ) {
    return false;
  }

  const seen = new Set<string>();
  return job.rules.every((rule) => {
    if (
      rule.severity !== 'BLOCKER' ||
      rule.passed !== true ||
      !requiredBlockerCodes.has(rule.ruleCode) ||
      seen.has(rule.ruleCode)
    ) {
      return false;
    }
    seen.add(rule.ruleCode);
    return true;
  });
}

export { canMaterializeReadinessJob, READINESS_REQUIRED_BLOCKER_CODES };
