import type { FdmCreativeApi } from '#/api/fdmcreative';

import { sha256Hex } from '@vben/utils';

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/**
 * Produces the same order-independent JSON representation as the server's
 * `WorkflowDefinitionHash`: object keys are sorted recursively, array order is
 * preserved, and numeric spelling is normalized before the SHA-256 is made.
 *
 * The workbench only persists JSON values. Keeping this helper deliberately
 * strict prevents a browser-only value such as `undefined` or `Infinity` from
 * silently receiving a hash that differs from the JSON request body.
 */
export function canonicalWorkflowDefinitionJson(
  definition: FdmCreativeApi.WorkflowDefinition,
) {
  return canonicalizeJson(
    materializeWorkflowDefinitionTransportDefaults(definition),
    '$',
  );
}

export function normalizeWorkflowDefinitionForTransport(
  definition: FdmCreativeApi.WorkflowDefinition,
) {
  return JSON.parse(
    canonicalWorkflowDefinitionJson(definition),
  ) as FdmCreativeApi.WorkflowDefinition;
}

/**
 * Mirrors defaults that Jackson applies while binding the save request. In
 * particular, a missing `Port.required` becomes `false` on the Java model and
 * consequently participates in the server-owned definition hash. Materialize
 * it before both serializing and hashing so the two sides fingerprint the same
 * document.
 *
 * Only a missing value is materialized. Explicit JSON `null` remains subject
 * to the existing JSON contract rather than being silently changed to `false`.
 */
function materializeWorkflowDefinitionTransportDefaults(
  definition: FdmCreativeApi.WorkflowDefinition,
): FdmCreativeApi.WorkflowDefinition {
  return {
    ...definition,
    nodes: definition.nodes.map((node) => ({
      ...node,
      ports: node.ports.map((port) =>
        port.required === undefined
          ? { ...port, required: false }
          : { ...port },
      ),
    })),
  };
}

export async function hashWorkflowDefinition(
  definition: FdmCreativeApi.WorkflowDefinition,
) {
  const canonical = canonicalWorkflowDefinitionJson(definition);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return sha256Hex(canonical);
  }
  const encoder = new TextEncoder();
  const payload = encoder.encode(canonical);
  const digest = await subtle.digest('SHA-256', payload);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function canonicalizeJson(
  value: unknown,
  path: string,
  arrayMember = false,
): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean': {
      return value ? 'true' : 'false';
    }
    case 'number': {
      return canonicalizeNumber(value, path);
    }
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value
          .map((item, index) =>
            canonicalizeJson(item, `${path}[${index}]`, true),
          )
          .join(',')}]`;
      }
      return `{${Object.keys(value as Record<string, unknown>)
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .toSorted()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${canonicalizeJson(
              (value as Record<string, unknown>)[key],
              `${path}.${key}`,
            )}`,
        )
        .join(',')}}`;
    }
    case 'string': {
      return JSON.stringify(value);
    }
    case 'undefined': {
      if (arrayMember) return 'null';
      throw new TypeError(`${path} 不能包含 undefined`);
    }
    default: {
      throw new TypeError(`${path} 只能包含 JSON 值`);
    }
  }
}

/**
 * Java's BigDecimal.stripTrailingZeros().toPlainString() does not use an
 * exponent. Convert JavaScript's exponent form into its plain decimal form so
 * `120`, `120.0` and values emitted by a browser use the same fingerprint.
 */
function canonicalizeNumber(value: number, path: string) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${path} 不能包含非有限数字`);
  }
  if (Object.is(value, -0) || value === 0) return '0';
  const source = String(value).toLowerCase();
  if (!source.includes('e')) return source;

  const exponentParts = source.split('e');
  const coefficient = exponentParts[0];
  const exponent = Number(exponentParts[1]);
  if (!coefficient || !Number.isInteger(exponent)) {
    throw new TypeError(`${path} 不能规范化数字`);
  }
  const negative = coefficient.startsWith('-');
  const unsigned = negative ? coefficient.slice(1) : coefficient;
  const [whole = '', fraction = ''] = unsigned.split('.');
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '');
  const decimalIndex = whole.length + exponent;
  let result: string;
  if (decimalIndex <= 0) {
    result = `0.${'0'.repeat(-decimalIndex)}${digits}`;
  } else if (decimalIndex >= digits.length) {
    result = `${digits}${'0'.repeat(decimalIndex - digits.length)}`;
  } else {
    result = `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  }
  result = result.replace(/(?:\.0+|(?:(\.\d*?[1-9])0+))$/, '$1');
  return negative ? `-${result}` : result;
}

export function isJsonValue(value: unknown): value is JsonValue {
  try {
    canonicalizeJson(value, '$');
    return true;
  } catch {
    return false;
  }
}
