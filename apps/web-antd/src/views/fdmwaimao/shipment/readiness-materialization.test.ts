import type { FdmWaimaoShipmentApi } from '#/api/fdmwaimao/shipment';

import { describe, expect, it } from 'vitest';

import { readinessGenerationJobFixture } from '#/api/fdmwaimao/shipment/readiness-job.fixture';

import {
  canMaterializeReadinessJob,
  READINESS_REQUIRED_BLOCKER_CODES,
} from './readiness-materialization';

function fixture(): FdmWaimaoShipmentApi.ReadinessGenerationJob {
  return structuredClone(readinessGenerationJobFixture);
}

describe('shipment readiness materialization display gate', () => {
  it('accepts only the complete server-normalized READY proposal and rule set', () => {
    const job = fixture();

    expect(job.rules.map((rule) => rule.ruleCode)).toEqual(
      READINESS_REQUIRED_BLOCKER_CODES,
    );
    expect(canMaterializeReadinessJob(job)).toBe(true);
  });

  it('rejects incomplete, failed and duplicate blocker rules', () => {
    const incomplete = fixture();
    incomplete.rules.pop();

    const failed = fixture();
    failed.rules[0]!.passed = false;

    const duplicate = fixture();
    duplicate.rules[1]!.ruleCode = duplicate.rules[0]!.ruleCode;

    expect(canMaterializeReadinessJob(incomplete)).toBe(false);
    expect(canMaterializeReadinessJob(failed)).toBe(false);
    expect(canMaterializeReadinessJob(duplicate)).toBe(false);
  });

  it('rejects non-READY jobs, unsafe effects and malformed CAS/hash identity', () => {
    const running = fixture();
    running.status = 'GENERATING';

    const sideEffect = fixture();
    (
      sideEffect.proposal!.effects as { reservationCreated: boolean }
    ).reservationCreated = true;

    const numericLikeCas = fixture();
    numericLikeCas.version = '9.5';

    const uppercaseHash = fixture();
    uppercaseHash.sourceSnapshotHash = 'A'.repeat(64);

    expect(canMaterializeReadinessJob(running)).toBe(false);
    expect(canMaterializeReadinessJob(sideEffect)).toBe(false);
    expect(canMaterializeReadinessJob(numericLikeCas)).toBe(false);
    expect(canMaterializeReadinessJob(uppercaseHash)).toBe(false);
  });

  it('requires proposal/source identity and a non-empty DRAFT-only proposal', () => {
    const crossSource = fixture();
    crossSource.proposal!.sourceShipmentId = '9223372036854775700';

    const empty = fixture();
    empty.proposal!.lineSelections = [];

    const wrongTarget = fixture();
    wrongTarget.proposal!.targetStatus = 'CONFIRMED' as 'DRAFT';

    expect(canMaterializeReadinessJob(crossSource)).toBe(false);
    expect(canMaterializeReadinessJob(empty)).toBe(false);
    expect(canMaterializeReadinessJob(wrongTarget)).toBe(false);
  });
});
