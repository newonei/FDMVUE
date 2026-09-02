export const CC_SWITCH_CODEX_MODEL = 'gpt-5.5';
export const CC_SWITCH_PROVIDER_NAME = 'Sub2API';
export const CC_SWITCH_USAGE_QUERY_INTERVAL_MINUTES = 30;

/**
 * CC Switch executes this script locally to query the Sub2API balance. Keep it
 * self-contained because it is transferred as part of the deep link payload.
 */
export const CC_SWITCH_USAGE_SCRIPT = `({
  request: {
    url: "{{baseUrl}}/v1/usage",
    method: "GET",
    headers: { "Authorization": "Bearer {{apiKey}}" }
  },
  extractor: function(response) {
    const remaining = response?.remaining ?? response?.quota?.remaining ?? response?.balance;
    const unit = response?.unit ?? response?.quota?.unit ?? "USD";
    return {
      isValid: response?.is_active ?? response?.isValid ?? true,
      remaining,
      unit
    };
  }
})`;

export interface CcSwitchImportDeeplinkInput {
  apiKey: string;
  baseUrl: string;
  providerName?: string;
}

/**
 * Builds the official CC Switch V1 provider-import deep link entirely in the
 * browser. The one-time API Key is neither sent to another FDM endpoint nor
 * stored in the page DOM.
 */
export function buildCcSwitchImportDeeplink(
  input: CcSwitchImportDeeplinkInput,
) {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('CC Switch import requires an API base URL');
  }
  if (!input.apiKey) {
    throw new Error('CC Switch import requires an API Key');
  }

  const params = new URLSearchParams([
    ['resource', 'provider'],
    ['app', 'codex'],
    ['model', CC_SWITCH_CODEX_MODEL],
    ['name', input.providerName?.trim() || CC_SWITCH_PROVIDER_NAME],
    ['homepage', baseUrl],
    ['endpoint', baseUrl],
    ['apiKey', input.apiKey],
    ['configFormat', 'json'],
    ['usageEnabled', 'true'],
    ['usageScript', btoa(CC_SWITCH_USAGE_SCRIPT)],
    ['usageAutoInterval', String(CC_SWITCH_USAGE_QUERY_INTERVAL_MINUTES)],
  ]);

  return `ccswitch://v1/import?${params.toString()}`;
}
