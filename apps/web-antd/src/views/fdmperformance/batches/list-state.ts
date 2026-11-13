import type { JixiaoApi } from '#/api/fdmperformance';

import { PERFORMANCE_PAGE_SIZE_OPTIONS } from '../shared/constants';
import { defaultManagementScope, managementScopes } from '../shared/workspace';

export interface ManagementListState {
  activeTab: string;
  appliedQuery: JixiaoApi.InstancePageParams;
  creatorOptions: { label: string; value: number }[];
  draftQuery: JixiaoApi.InstancePageParams;
  scrollTop: number;
}

export type ManagementQuery = JixiaoApi.InstancePageParams & {
  pageNo: number;
  pageSize: number;
};

export function defaultManagementQuery(
  scope: JixiaoApi.Scope = 'INITIATED',
): ManagementQuery {
  return {
    creatorUserId: undefined,
    deptId: undefined,
    pageNo: 1,
    pageSize: 10,
    periodKey: undefined,
    scope,
    status: undefined,
    userName: undefined,
  };
}

function positiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

/** Restore only list navigation state, and validate it against current permissions. */
export function restoreManagementListState(
  saved: null | ManagementListState,
  access: JixiaoApi.Access,
): ManagementListState {
  const scopes = managementScopes(access);
  function restoreQuery(value?: JixiaoApi.InstancePageParams) {
    const scope = scopes.includes(value?.scope as JixiaoApi.Scope)
      ? value!.scope!
      : defaultManagementScope(access);
    return {
      ...defaultManagementQuery(scope),
      creatorUserId:
        scope === 'INITIATED'
          ? undefined
          : positiveInteger(value?.creatorUserId),
      deptId: positiveInteger(value?.deptId),
      pageNo: positiveInteger(value?.pageNo) || 1,
      pageSize: PERFORMANCE_PAGE_SIZE_OPTIONS.includes(String(value?.pageSize))
        ? Number(value!.pageSize)
        : 10,
      periodKey:
        typeof value?.periodKey === 'string' &&
        /^\d{4}-(0[1-9]|1[0-2])$/.test(value.periodKey)
          ? value.periodKey
          : undefined,
      status: [1, 2, 3].includes(value?.status ?? 0)
        ? value!.status
        : undefined,
      userName:
        typeof value?.userName === 'string' ? value.userName : undefined,
    };
  }
  const appliedQuery = restoreQuery(saved?.appliedQuery);
  const draftQuery = restoreQuery(saved?.draftQuery);
  // Scope tabs apply immediately; an unsubmitted filter draft cannot change scope.
  draftQuery.scope = appliedQuery.scope;
  if (draftQuery.scope === 'INITIATED') draftQuery.creatorUserId = undefined;
  const allowedTabs = ['instances'];
  if (access.canConfigure) allowedTabs.push('hr-review');
  if (access.canManageTemplate) allowedTabs.push('templates');
  const creatorIds = [draftQuery.creatorUserId, appliedQuery.creatorUserId];
  return {
    activeTab: allowedTabs.includes(saved?.activeTab ?? '')
      ? saved!.activeTab
      : 'instances',
    appliedQuery,
    creatorOptions: Array.isArray(saved?.creatorOptions)
      ? saved.creatorOptions.filter(
          (option) =>
            option &&
            positiveInteger(option.value) &&
            creatorIds.includes(option.value) &&
            typeof option.label === 'string',
        )
      : [],
    draftQuery,
    scrollTop:
      typeof saved?.scrollTop === 'number' &&
      Number.isFinite(saved.scrollTop) &&
      saved.scrollTop >= 0
        ? saved.scrollTop
        : 0,
  };
}
