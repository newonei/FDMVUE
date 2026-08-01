import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmcaiwuMouldProfileApi {
  export type DecimalValue = number | string;

  export interface Profile {
    blockedReason?: string;
    boardLengthMm: DecimalValue;
    boardThicknessMm: DecimalValue;
    boardWidthMm: DecimalValue;
    createTime?: string;
    elasticChargeWeightKg?: DecimalValue;
    enabled: boolean;
    id: number;
    lightChargeWeightKg?: DecimalValue;
    mouldLengthMm: DecimalValue;
    mouldThicknessMm: DecimalValue;
    mouldWidthMm: DecimalValue;
    profileCode: string;
    profileName: string;
    regularChargeWeightKg?: DecimalValue;
    sourceLocation?: string;
    sourceVersion?: string;
    superElasticChargeWeightKg?: DecimalValue;
    updateTime?: string;
  }

  export interface PageReq extends PageParam {
    enabled?: boolean;
    keyword?: string;
  }

  export type SaveReq = Omit<
    Profile,
    'createTime' | 'id' | 'sourceLocation' | 'sourceVersion' | 'updateTime'
  > & { id?: number };
}

export function getMouldProfilePage(params: FdmcaiwuMouldProfileApi.PageReq) {
  return requestClient.get<PageResult<FdmcaiwuMouldProfileApi.Profile>>(
    '/fdmcaiwu/mould-profile/page',
    { params },
  );
}

export function getMouldProfile(id: number) {
  return requestClient.get<FdmcaiwuMouldProfileApi.Profile>(
    '/fdmcaiwu/mould-profile/get',
    { params: { id } },
  );
}

export function createMouldProfile(data: FdmcaiwuMouldProfileApi.SaveReq) {
  return requestClient.post<number>('/fdmcaiwu/mould-profile/create', data);
}

export function updateMouldProfile(data: FdmcaiwuMouldProfileApi.SaveReq) {
  return requestClient.put<boolean>('/fdmcaiwu/mould-profile/update', data);
}

export function deleteMouldProfile(id: number) {
  return requestClient.delete<boolean>('/fdmcaiwu/mould-profile/delete', {
    params: { id },
  });
}
