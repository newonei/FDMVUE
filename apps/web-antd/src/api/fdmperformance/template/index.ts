import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmPerformanceTemplateApi {
  export type TemplatePageParams = PageParam & {
    groupId?: number;
    name?: string;
    periodType?: number;
    status?: number;
  };

  export interface Participant {
    deptId?: number;
    deptName?: string;
    postId?: number;
    postName?: string;
    userId: number;
    userName?: string;
  }

  export interface TemplateIndicator {
    fieldValueJson?: string;
    id?: number;
    indicatorId?: number;
    name: string;
    requiredFlag?: boolean;
    scoreLowerLimit?: number;
    scoreUpperLimit?: number;
    scorerRuleJson?: string;
    scoringMethod?: number;
    sort?: number;
    standard?: string;
    status?: number;
    weight?: number;
  }

  export interface Dimension {
    allowCopy?: boolean;
    allowIndicatorImport?: boolean;
    allowManualAdd?: boolean;
    allowTemplateIndicatorDelete?: boolean;
    description?: string;
    dimensionType?: number;
    fieldConfigJson?: string;
    id?: number;
    indicators: TemplateIndicator[];
    limitRuleJson?: string;
    name: string;
    scoringConfigJson?: string;
    sort?: number;
    status?: number;
    templateId?: number;
    weight?: number;
  }

  export interface FlowNode {
    assigneeType?: number;
    assigneeUserIds?: number[];
    id?: number;
    nodeConfigJson?: string;
    nodeKey?: string;
    nodeName?: string;
    requiredFlag?: boolean;
    scoreWeight?: number;
    sort?: number;
    stageType?: number;
    taskType?: number;
  }

  export interface GradeRule {
    coefficient?: number;
    gradeName?: string;
    id?: number;
    includeMax?: boolean;
    includeMin?: boolean;
    maxScore?: number;
    minScore?: number;
    sort?: number;
  }

  export interface Template {
    autoLaunch?: boolean;
    communicationFeedback?: boolean;
    createTime?: string;
    dimensions: Dimension[];
    excludedParticipants?: Participant[];
    fieldConfigJson?: string;
    flowNodes?: FlowNode[];
    gradeEnabled?: boolean;
    gradeRules?: GradeRule[];
    groupId?: number;
    groupName?: string;
    id?: number;
    launchRuleJson?: string;
    managerUserIds?: number[];
    name: string;
    participants: Participant[];
    periodType: number;
    remark?: string;
    resultVisibleRule?: number;
    reuseIndicator?: boolean;
    scoreViewPermission?: number;
    simpleFlowJson?: string;
    status?: number;
    updateTime?: string;
  }

  export type TemplateSaveReq = Omit<Template, 'createTime' | 'updateTime'>;

  export type FlowPresetPageParams = PageParam & {
    name?: string;
    status?: number;
  };

  export interface FlowPreset {
    createTime?: string;
    flowNodes?: FlowNode[];
    id?: number;
    name: string;
    remark?: string;
    simpleFlowJson: string;
    sort?: number;
    status?: number;
    updateTime?: string;
  }

  export type FlowPresetSaveReq = Omit<FlowPreset, 'createTime' | 'updateTime'>;

  export interface SimpleTemplate {
    groupId?: number;
    groupName?: string;
    id: number;
    name: string;
    periodType?: number;
    status?: number;
  }

  export interface TemplateGroup {
    id: number;
    name: string;
    sort?: number;
  }

  export interface TemplateGroupSaveReq {
    name: string;
    sort?: number;
  }
}

export function getFdmPerformanceTemplatePage(
  params: FdmPerformanceTemplateApi.TemplatePageParams,
) {
  return requestClient.get<PageResult<FdmPerformanceTemplateApi.Template>>(
    '/fdmperformance/template/page',
    { params },
  );
}

export function getFdmPerformanceTemplate(id: number) {
  return requestClient.get<FdmPerformanceTemplateApi.Template>(
    `/fdmperformance/template/get?id=${id}`,
  );
}

export function getFdmPerformanceTemplateSimpleList() {
  return requestClient.get<FdmPerformanceTemplateApi.SimpleTemplate[]>(
    '/fdmperformance/template/simple-list',
  );
}

export function getFdmPerformanceTemplateGroupSimpleList() {
  return requestClient.get<FdmPerformanceTemplateApi.TemplateGroup[]>(
    '/fdmperformance/template/group/simple-list',
  );
}

export function createFdmPerformanceTemplateGroup(
  data: FdmPerformanceTemplateApi.TemplateGroupSaveReq,
) {
  return requestClient.post<number>('/fdmperformance/template/group/create', data);
}

export function deleteFdmPerformanceTemplateGroup(id: number) {
  return requestClient.delete<boolean>(
    `/fdmperformance/template/group/delete?id=${id}`,
  );
}

export function createFdmPerformanceTemplate(
  data: FdmPerformanceTemplateApi.TemplateSaveReq,
) {
  return requestClient.post<number>('/fdmperformance/template/create', data);
}

export function updateFdmPerformanceTemplate(
  data: FdmPerformanceTemplateApi.TemplateSaveReq,
) {
  return requestClient.put<boolean>('/fdmperformance/template/update', data);
}

export function duplicateFdmPerformanceTemplate(id: number) {
  return requestClient.post<number>(`/fdmperformance/template/duplicate?id=${id}`);
}

export function deleteFdmPerformanceTemplate(id: number) {
  return requestClient.delete<boolean>(`/fdmperformance/template/delete?id=${id}`);
}

export function getFdmPerformanceFlowPresetPage(
  params: FdmPerformanceTemplateApi.FlowPresetPageParams,
) {
  return requestClient.get<PageResult<FdmPerformanceTemplateApi.FlowPreset>>(
    '/fdmperformance/flow-preset/page',
    { params },
  );
}

export function getFdmPerformanceFlowPreset(id: number) {
  return requestClient.get<FdmPerformanceTemplateApi.FlowPreset>(
    `/fdmperformance/flow-preset/get?id=${id}`,
  );
}

export function getFdmPerformanceFlowPresetSimpleList() {
  return requestClient.get<FdmPerformanceTemplateApi.FlowPreset[]>(
    '/fdmperformance/flow-preset/simple-list',
  );
}

export function createFdmPerformanceFlowPreset(
  data: FdmPerformanceTemplateApi.FlowPresetSaveReq,
) {
  return requestClient.post<number>('/fdmperformance/flow-preset/create', data);
}

export function updateFdmPerformanceFlowPreset(
  data: FdmPerformanceTemplateApi.FlowPresetSaveReq,
) {
  return requestClient.put<boolean>('/fdmperformance/flow-preset/update', data);
}

export function deleteFdmPerformanceFlowPreset(id: number) {
  return requestClient.delete<boolean>(`/fdmperformance/flow-preset/delete?id=${id}`);
}
