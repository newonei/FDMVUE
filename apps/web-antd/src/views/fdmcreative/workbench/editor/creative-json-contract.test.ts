import { describe, expect, it } from 'vitest';

import {
  CREATIVE_SCHEMA_VERSIONS,
  parseCreativeSchemaEnvelope,
} from './creative-json-contract';

describe('creative JSON contracts', () => {
  it('parses an explicit supported schema version', () => {
    const payload = JSON.parse(
      '{"schemaVersion":1,"summary":"safe patch"}',
    ) as unknown;

    expect(parseCreativeSchemaEnvelope(payload, 'canvasPatch')).toEqual({
      schemaVersion: CREATIVE_SCHEMA_VERSIONS.canvasPatch,
      summary: 'safe patch',
    });
  });

  it('rejects missing or unknown schema versions before contract parsing', () => {
    expect(() => parseCreativeSchemaEnvelope({}, 'workflowExport')).toThrow(
      'schemaVersion',
    );
    expect(() =>
      parseCreativeSchemaEnvelope({ schemaVersion: 2 }, 'workflowExport'),
    ).toThrow('schemaVersion');
  });
});
