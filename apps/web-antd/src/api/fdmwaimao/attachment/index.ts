import type { AxiosProgressEvent } from '#/api/fdmstorage/object';

import { FDM_OBJECT_UPLOAD_TIMEOUT } from '#/api/fdmstorage/object';
import { requestClient } from '#/api/request';

export namespace FdmWaimaoAttachmentApi {
  export type AttachmentStatus = 'BOUND' | 'PENDING';
  export type BusinessType =
    | 'CONSUMPTION_RECORD'
    | 'CONTRACT_ORDER'
    | 'CUSTOMER'
    | 'FULFILLMENT_PLAN'
    | 'ORDER_EXPENSE'
    | 'RECEIPT_RECORD'
    | 'SHIPMENT';
  export type DateTimeValue = number | string;

  /** 外贸业务附件。所有 Long 标识在浏览器中按字符串处理。 */
  export interface Attachment {
    businessId?: string;
    businessType: BusinessType;
    createTime?: DateTimeValue;
    fileName: string;
    fileSize?: number;
    id: string;
    mimeType?: string;
    status: AttachmentStatus;
    uploaderName?: string;
  }
}

const BASE_URL = '/fdmwaimao/attachment';

/** 上传一个待绑定附件。文件内容与业务类型使用 multipart/form-data 提交。 */
export function uploadFdmWaimaoAttachment(
  file: File,
  businessType: FdmWaimaoAttachmentApi.BusinessType,
  onUploadProgress?: AxiosProgressEvent,
) {
  return requestClient.upload<FdmWaimaoAttachmentApi.Attachment>(
    `${BASE_URL}/upload`,
    { businessType, file },
    {
      onUploadProgress,
      timeout: FDM_OBJECT_UPLOAD_TIMEOUT,
    },
  );
}

/** 删除尚未绑定到业务单据的附件。BOUND 附件必须由业务更新事务处理。 */
export function deletePendingFdmWaimaoAttachment(id: string) {
  return requestClient.delete<boolean>(`${BASE_URL}/delete-pending`, {
    params: { id },
  });
}

/**
 * 查询已绑定到业务单据的附件元数据。
 *
 * 下载地址不随列表返回，点击下载时再按附件 ID 获取短时地址。
 */
export function getFdmWaimaoAttachmentList(
  businessType: FdmWaimaoAttachmentApi.BusinessType,
  businessId: string,
) {
  return requestClient.get<FdmWaimaoAttachmentApi.Attachment[]>(
    `${BASE_URL}/list`,
    {
      params: { businessId, businessType },
    },
  );
}

/** 获取经过业务权限与数据范围校验的短时下载地址。 */
export function getFdmWaimaoAttachmentDownloadUrl(id: string) {
  return requestClient.get<string>(`${BASE_URL}/download-url`, {
    params: { id },
  });
}
