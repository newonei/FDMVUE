import type { DocumentType } from '../domain/types';
import type { TradePageKey } from '../page-config';

export type TradeAiPageKey = 'workbench' | TradePageKey;
export type TradeAiDocumentType = 'SUPPLIER' | 'WRITE_OFF_ITEM' | DocumentType;

export type TradeAiIntent =
  | 'EXPLAIN'
  | 'NEXT_ACTIONS'
  | 'OVERVIEW'
  | 'RECOMMEND'
  | 'RISK'
  | 'TRACE';

export type TradeAiTone = 'danger' | 'info' | 'success' | 'warning';

export interface TradeAiQuestion {
  id: string;
  intent: TradeAiIntent;
  label: string;
  prompt: string;
}

export interface TradeAiPageProfile {
  department: string;
  greeting: string;
  pageKey: TradeAiPageKey;
  questions: TradeAiQuestion[];
  role: string;
  scope: string;
  title: string;
}

export interface TradeAiSelectedDocument {
  id: string;
  label?: string;
  type?: TradeAiDocumentType;
}

export interface TradeAiRequest {
  activeTab?: string;
  now?: string;
  pageKey: TradeAiPageKey;
  query?: string;
  questionId?: string;
  selectedDocument?: TradeAiSelectedDocument;
}

export interface TradeAiEvidence {
  detail?: string;
  documentId?: string;
  documentType?: DocumentType;
  label: string;
  route?: string;
  tone?: TradeAiTone;
  value: string;
}

export type TradeAiPriority = 'HIGH' | 'LOW' | 'MEDIUM';

export interface TradeAiRecommendation {
  description: string;
  documentId?: string;
  documentType?: DocumentType;
  priority: TradeAiPriority;
  route?: string;
  title: string;
}

export interface TradeAiGuardrail {
  allowedNextStep: string;
  mode: 'BLOCKED' | 'CONFIRMATION_REQUIRED';
  prohibitedAction?: string;
  reason: string;
  title: string;
}

export interface TradeAiResponse {
  dataScopeNotice: string;
  evidence: TradeAiEvidence[];
  generatedAt: string;
  guardrail?: TradeAiGuardrail;
  id: string;
  pageKey: TradeAiPageKey;
  question: string;
  recommendations: TradeAiRecommendation[];
  summary: string;
  title: string;
  tone: TradeAiTone;
}

export interface FdmAiChatHistoryItem {
  content: string;
  role: 'assistant' | 'user';
}

/**
 * 外贸页面 AI 只允许浏览器提交对象身份、显式模型与问题。
 * 页面快照、路由、策略、敏感级别均由服务端按 pageKey 重新构造。
 */
export interface FdmWaimaoAssistantChatRequest {
  businessId: string;
  companyId: string;
  history?: FdmAiChatHistoryItem[];
  idempotencyKey: string;
  modelId: string;
  pageKey: string;
  question: string;
}

/** 产品中心仍使用它自己的浏览器上下文协议，不能与外贸请求混用。 */
export interface FdmProductAssistantChatRequest extends FdmWaimaoAssistantChatRequest {
  context?: Record<string, unknown>;
  pageTitle: string;
}

export interface FdmAiConversationIdentity {
  businessId: string;
  companyId: string;
  domainKey: 'fdmproduct' | 'fdmwaimao';
  modelId: string;
  pageKey: string;
  storageKey: string;
  viewKey: string;
}

export interface FdmAiPendingQuestionCommand {
  history: FdmAiChatHistoryItem[];
  idempotencyKey: string;
  identity: FdmAiConversationIdentity;
  pageTitle?: string;
  productContext?: Record<string, unknown>;
  question: string;
  userMessageId: string;
}

export function fdmAiConversationIdentityKey(
  identity: FdmAiConversationIdentity,
): string {
  return JSON.stringify([
    identity.domainKey,
    identity.pageKey,
    identity.businessId,
    identity.companyId,
    identity.modelId,
    identity.storageKey,
    identity.viewKey,
  ]);
}

export function fdmAiPendingQuestionKey(
  identity: FdmAiConversationIdentity,
  question: string,
): string {
  return `${fdmAiConversationIdentityKey(identity)}:${JSON.stringify(question)}`;
}

export function isSameFdmAiConversationIdentity(
  left: FdmAiConversationIdentity,
  right: FdmAiConversationIdentity,
): boolean {
  return (
    fdmAiConversationIdentityKey(left) === fdmAiConversationIdentityKey(right)
  );
}
