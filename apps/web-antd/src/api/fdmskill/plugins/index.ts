import { requestClient } from '#/api/request';

export type LocalizedText = Record<string, string> | string;

export interface PluginVersion {
  [key: string]: unknown;
  engines?: { [key: string]: unknown; dsh?: string };
  publishTimestamp: number;
  source: {
    [key: string]: unknown;
    commit?: string;
    path?: string;
    registry?: string;
    type: 'git' | 'npm';
    url?: string;
  };
  version: string;
}

export interface MarketPlugin {
  [key: string]: unknown;
  author?: string;
  description?: LocalizedText;
  homepage?: string;
  metadata?: {
    [key: string]: unknown;
    category?: string;
    keywords?: string[];
    labels?: string[];
    sortKeys?: Record<string, number>;
  };
  name: string;
  published?: boolean;
  title?: LocalizedText;
  versions: PluginVersion[];
}

export interface PluginMarketIndex {
  [key: string]: unknown;
  description?: LocalizedText;
  format: 1;
  metadata?: {
    [key: string]: unknown;
    categories?: Record<string, { title: LocalizedText }>;
    labels?: Record<string, { title: LocalizedText }>;
    sortKeys?: Record<string, { order: 'asc' | 'desc'; title: LocalizedText }>;
  };
  plugins: MarketPlugin[];
  title: LocalizedText;
}

export interface PluginMarketState {
  enabled: boolean;
  index: PluginMarketIndex;
  indexPath: string;
  indexUrl?: string;
  revision: string;
}

export function getPluginMarket() {
  return requestClient.get<PluginMarketState>('/fdmskill/plugins/get');
}

export function updatePluginMarket(data: {
  index: PluginMarketIndex;
  revision: string;
}) {
  return requestClient.put<PluginMarketState>('/fdmskill/plugins/update', data);
}
