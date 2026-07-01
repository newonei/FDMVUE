import { requestClient } from '#/api/request';

export namespace FdmPerformanceSettingApi {
  export interface Setting {
    id?: number;
    settingKey: string;
    settingName: string;
    settingValue?: string;
    sort?: number;
    remark?: string;
    updateTime?: string;
  }

  export interface SettingSaveReq {
    settingKey: string;
    settingName: string;
    settingValue?: string;
    sort?: number;
    remark?: string;
  }
}

export function getFdmPerformanceSettingList() {
  return requestClient.get<FdmPerformanceSettingApi.Setting[]>(
    '/fdmperformance/setting/list',
  );
}

export function getFdmPerformanceSetting(settingKey: string) {
  return requestClient.get<FdmPerformanceSettingApi.Setting>(
    '/fdmperformance/setting/get',
    { params: { settingKey } },
  );
}

export function saveFdmPerformanceSetting(
  data: FdmPerformanceSettingApi.SettingSaveReq,
) {
  return requestClient.put<boolean>('/fdmperformance/setting/save', data);
}

export function batchSaveFdmPerformanceSetting(
  data: FdmPerformanceSettingApi.SettingSaveReq[],
) {
  return requestClient.put<boolean>(
    '/fdmperformance/setting/batch-save',
    data,
  );
}
