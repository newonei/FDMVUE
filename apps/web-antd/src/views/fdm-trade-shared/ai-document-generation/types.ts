export type AiGenerationPhase = 'GENERATING' | 'READY' | 'START';

export type AiGenerationJobStatus =
  | 'CANCELLED'
  | 'CONTEXT_BUILDING'
  | 'CREATED'
  | 'EXPIRED'
  | 'FAILED'
  | 'GENERATING'
  | 'MATERIALIZED'
  | 'PARSING'
  | 'QUEUED'
  | 'READY'
  | 'RULE_BLOCKED'
  | 'STALE'
  | 'VALIDATING';

export type AiGenerationStage =
  | 'CONTEXT'
  | 'EVIDENCE'
  | 'MODEL'
  | 'PARSING'
  | 'VALIDATION';

export type AiFieldOrigin =
  | 'AI_INFERRED'
  | 'CONFLICT'
  | 'HUMAN_EDIT'
  | 'MASTER_DATA'
  | 'MISSING'
  | 'RULE_DEFAULT'
  | 'SOURCE_DOCUMENT';

export type AiFieldConfidence = 'HIGH' | 'LOW' | 'MEDIUM';
export type AiValidationSeverity = 'BLOCKER' | 'INFO' | 'WARNING';

export interface AiModelOption {
  capabilities: string[];
  code: string;
  enabled: boolean;
  id: string;
  name: string;
}

export interface AiEvidence {
  capturedAt?: number | string;
  detail?: string;
  documentId?: string;
  documentNo?: string;
  documentType?: string;
  id: string;
  label: string;
  route?: string;
  sourceVersion?: number | string;
  value?: null | string;
}

export interface AiAlternative {
  confidence?: AiFieldConfidence;
  id: string;
  impact?: string;
  label: string;
  reason?: string;
  value: unknown;
}

export interface AiFieldMeta {
  alternatives?: AiAlternative[];
  confidence?: AiFieldConfidence;
  evidence?: AiEvidence[];
  fieldKey: string;
  label: string;
  origin: AiFieldOrigin;
  proposedValue?: unknown;
  sourceValue?: unknown;
}

export interface AiFieldState extends AiFieldMeta {
  currentValue?: unknown;
  originalOrigin: AiFieldOrigin;
}

export type AiFieldStateMap = Record<string, AiFieldState>;

export interface AiValidationIssue {
  code: string;
  fieldKey?: string;
  message: string;
  severity: AiValidationSeverity;
}

export interface AiGenerationJob<TProposal = unknown> {
  errorMessage?: null | string;
  generatedAt?: number | string;
  id: string;
  invocationId?: null | string;
  modelId: string;
  modelName?: null | string;
  proposal?: TProposal;
  proposalVersion?: number | string;
  sourceVersion: number | string;
  stage?: AiGenerationStage | null;
  status: AiGenerationJobStatus;
  traceId?: null | string;
  version?: number | string;
}

export interface AiGenerationDataSource<TStartReq, TProposal> {
  cancel?(
    id: string,
    expectedVersion: number | string,
  ): Promise<AiGenerationJob<TProposal>>;
  getJob(id: string): Promise<AiGenerationJob<TProposal>>;
  retry?(
    id: string,
    expectedVersion: number | string,
  ): Promise<AiGenerationJob<TProposal>>;
  start(req: TStartReq): Promise<AiGenerationJob<TProposal>>;
}

export interface AiGenerationStartBlocker {
  code: string;
  message: string;
}
