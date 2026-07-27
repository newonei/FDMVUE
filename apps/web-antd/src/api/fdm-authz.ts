import { requestClient } from '#/api/request';

export namespace FdmAuthzApi {
  /** 部门角色配置 */
  export interface DeptRoleConfig {
    affectedUserCount: number;
    deptId: number;
    includeChildren: boolean;
    roleIds: number[];
  }

  /** 保存部门角色配置请求 */
  export interface AssignDeptRoleReqVO {
    deptId: number;
    includeChildren: boolean;
    roleIds: number[];
  }

  /** 用户从部门继承的角色 */
  export interface InheritedRole {
    deptId: number;
    deptName: string;
    includeChildren?: boolean;
    roleId: number;
    roleName: string;
  }

  /** 用户角色来源明细 */
  export interface UserRoleDetail {
    directRoleIds: number[];
    inheritedRoles: InheritedRole[];
    userId: number;
  }
}

/** 查询部门角色配置 */
export function getDeptRoleConfig(deptId: number) {
  return requestClient.get<FdmAuthzApi.DeptRoleConfig>(
    '/fdm-authz/dept-role/get',
    { params: { deptId } },
  );
}

/** 保存部门角色配置 */
export function assignDeptRole(data: FdmAuthzApi.AssignDeptRoleReqVO) {
  return requestClient.post('/fdm-authz/dept-role/assign', data);
}

/** 查询用户的个人角色和部门继承角色 */
export function getUserRoleDetail(userId: number) {
  return requestClient.get<FdmAuthzApi.UserRoleDetail>(
    '/fdm-authz/user-role/detail',
    { params: { userId } },
  );
}
