import { requestClient } from '#/api/request';

/** 单据 AI 风险检查（Issue #91）。读权限跟单据本身走：能看单据就能看它的风险。 */
export namespace FdmAiCheckApi {
  export type DocType = 'CONTRACT' | 'PURCHASE_ORDER';
  export type Severity = 'HIGH' | 'INFO' | 'NONE' | 'WARNING';
  export type FindingStatus =
    | 'FALSE_POSITIVE'
    | 'IGNORED'
    | 'OPEN'
    | 'RESOLVED';

  export interface Finding {
    id: number;
    source: 'AI' | 'RULE';
    checkCode?: string;
    severity: Exclude<Severity, 'NONE'>;
    message: string;
    suggestion?: string;
    evidenceIds: string[];
    status: FindingStatus;
    handledBy?: number;
    handledReason?: string;
    handledTime?: string;
  }

  export interface Task {
    id: number;
    triggerType: string;
    status: string;
    /** SUCCEEDED / FAILED / NOT_CONFIGURED / TOO_LARGE / UNAVAILABLE */
    aiStatus?: string;
    riskLevel?: Severity;
    summary?: string;
    errorMessage?: string;
    createTime?: string;
    finishedTime?: string;
  }

  export interface Result {
    docType: DocType;
    docId: string;
    /** 待处理风险里最高的等级；从没检查过为空 */
    riskLevel?: Severity;
    openCount?: number;
    running: boolean;
    latest?: Task;
    lastError?: string;
    findings: Finding[];
  }

  export interface Item {
    code: string;
    name: string;
    severity: Exclude<Severity, 'NONE'>;
    description?: string;
    enabled: boolean;
  }

  export interface Prompt {
    promptId: number;
    versionNo?: number;
    items: Item[];
    departmentNotes: Record<string, string>;
    notes?: string;
  }

  export interface Profile {
    docType: DocType;
    docTypeName: string;
    enabled: boolean;
    modelId?: number;
    triggerOnCreate: boolean;
    triggerOnUpdate: boolean;
    includeBatch: boolean;
    notifyLevel: Exclude<Severity, 'NONE'>;
    publishedVersionNo?: number;
    hasDraft: boolean;
  }

  export interface Version {
    id: number;
    versionNo?: number;
    status: 'ARCHIVED' | 'DRAFT' | 'PUBLISHED';
    publishedBy?: number;
    publishedTime?: string;
    updateTime?: string;
  }

  export interface ProfileDetail {
    profile: Profile;
    published: Prompt;
    draft?: null | Prompt;
    defaultItems: Item[];
    departments: Record<string, string>;
    versions: Version[];
  }

  export interface Settings {
    enabled?: boolean;
    modelId?: null | number;
    triggerOnCreate?: boolean;
    triggerOnUpdate?: boolean;
    includeBatch?: boolean;
    notifyLevel?: string;
  }

  export interface Draft {
    items: Item[];
    departmentNotes: Record<string, string>;
    notes?: string;
  }

  export interface ModelOption {
    id: number;
    code: string;
    name: string;
    allowed: boolean;
    structured: boolean;
  }

  export interface DocOption {
    docId: string;
    parentId?: string;
    code?: string;
    title?: string;
  }

  export interface DryRun {
    task: Task;
    docCode?: string;
    findings: Finding[];
  }
}

const base = '/fdmaicheck';

export function getAiCheckResult(
  docType: FdmAiCheckApi.DocType,
  docId: string,
) {
  return requestClient.get<FdmAiCheckApi.Result>(`${base}/check/result`, {
    params: { docType, docId },
  });
}

export function recheckAiCheck(docType: FdmAiCheckApi.DocType, docId: string) {
  return requestClient.post<boolean>(`${base}/check/recheck`, {
    docType,
    docId,
  });
}

/** 一批单据的风险等级；没检查过的单据不在结果里。 */
export function getAiCheckLevels(
  docType: FdmAiCheckApi.DocType,
  docIds: string[],
) {
  return requestClient.post<Record<string, FdmAiCheckApi.Severity>>(
    `${base}/check/levels`,
    { docType, docIds },
  );
}

export function handleAiCheckFinding(
  id: number,
  status: FdmAiCheckApi.FindingStatus,
  reason?: string,
) {
  return requestClient.post<boolean>(`${base}/check/handle`, {
    id,
    status,
    reason,
  });
}

export function getAiCheckProfiles() {
  return requestClient.get<FdmAiCheckApi.Profile[]>(`${base}/profile/list`);
}

export function getAiCheckProfile(docType: string) {
  return requestClient.get<FdmAiCheckApi.ProfileDetail>(`${base}/profile/get`, {
    params: { docType },
  });
}

export function updateAiCheckSettings(
  docType: string,
  settings: FdmAiCheckApi.Settings,
) {
  return requestClient.put<boolean>(`${base}/profile/settings`, {
    docType,
    settings,
  });
}

export function saveAiCheckDraft(docType: string, draft: FdmAiCheckApi.Draft) {
  return requestClient.put<number>(`${base}/profile/draft`, { docType, draft });
}

export function discardAiCheckDraft(docType: string) {
  return requestClient.delete<boolean>(`${base}/profile/draft`, {
    params: { docType },
  });
}

export function publishAiCheckDraft(docType: string) {
  return requestClient.post<boolean>(`${base}/profile/publish`, undefined, {
    params: { docType },
  });
}

/** promptId 为 0 恢复出厂默认检查项。 */
export function rollbackAiCheckPrompt(docType: string, promptId: number) {
  return requestClient.post<boolean>(`${base}/profile/rollback`, {
    docType,
    promptId,
  });
}

export function getAiCheckModels() {
  return requestClient.get<FdmAiCheckApi.ModelOption[]>(
    `${base}/profile/models`,
  );
}

export function searchAiCheckDocs(docType: string, keyword?: string) {
  return requestClient.get<FdmAiCheckApi.DocOption[]>(`${base}/profile/docs`, {
    params: { docType, keyword },
  });
}

export function startAiCheckDryRun(docType: string, docId: string) {
  return requestClient.post<number>(`${base}/profile/dry-run`, {
    docType,
    docId,
  });
}

export function getAiCheckDryRun(id: number) {
  return requestClient.get<FdmAiCheckApi.DryRun>(`${base}/profile/dry-run`, {
    params: { id },
  });
}
