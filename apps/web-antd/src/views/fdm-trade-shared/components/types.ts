import type { RouteLocationRaw } from 'vue-router';

export type TradeStatusTone =
  | 'danger'
  | 'default'
  | 'info'
  | 'processing'
  | 'success'
  | 'warning';

export interface TradeActiveFilter {
  closable?: boolean;
  key: string;
  label: string;
  value?: string;
}

export interface TradeSummaryItem {
  key: string;
  label: string;
  tone?: TradeStatusTone;
  value: string;
}

export interface RelationChainMetric {
  key: string;
  label: string;
  note?: string;
  tone?: TradeStatusTone;
  value: string;
}

export interface RelationChainDocument {
  disabled?: boolean;
  key: string;
  status?: string;
  statusTone?: TradeStatusTone;
  subtitle?: string;
  title: string;
}

export interface TradeSummaryMetric {
  help?: string;
  key: string;
  label: string;
  tone?: TradeStatusTone;
  to?: RouteLocationRaw;
  value: string;
}

export interface TradeRelationLink {
  description?: string;
  disabled?: boolean;
  icon?: string;
  key: string;
  label: string;
  meta?: string;
  status?: string;
  statusTone?: TradeStatusTone;
  to?: RouteLocationRaw;
  type: string;
}
