import type { RouteLocationRaw } from 'vue-router';

import type { FdmNeixiaoPatternDesignItemApi } from '#/api/fdmneixiao/pattern/design-item';
import type { UploadTask, UploadTaskRunner } from '#/store/upload-task';

import { computed, markRaw, reactive, ref } from 'vue';

import { uploadFdmNeixiaoPatternDesignItemDesignImage } from '#/api/fdmneixiao/pattern/design-item';
import { createLocalThumbnail } from '#/components/upload-task';
import { isUploadTaskActive, useUploadTaskStore } from '#/store/upload-task';

export const DESIGN_IMAGE_UPLOAD_SOURCE = '内销定制订单';

export interface DesignRow {
  designImageUrl: string;
  file?: File;
  fileName?: string;
  fileSize?: number;
  localThumbUrl?: string;
  packagingMethod?: string;
  previewImageUrl?: string;
  productSpec?: string;
  purchasePrice?: number;
  quantity: number;
  remark?: string;
  rowKey: number;
  /** 手动粘贴原图 URL 的行 */
  sourceType: 'upload' | 'url';
  taskId?: string;
}

export type DesignRowState = 'done' | 'empty' | 'failed' | 'uploading';

/**
 * 新增弹窗的草稿放在模块作用域：弹窗关闭（最小化）甚至离开页面后，
 * 上传仍在全局任务队列里继续，完成后回填到这里，重新打开弹窗即可接着填写。
 */
const draft = reactive({
  formValues: undefined as Record<string, any> | undefined,
  rows: [] as DesignRow[],
});

/** 上传面板请求重新打开新增弹窗；页面可能尚未挂载，所以用标志位而不是事件 */
const openRequested = ref(false);

let rowSeq = 0;

export const uploadDesignImageTask: UploadTaskRunner<FdmNeixiaoPatternDesignItemApi.UploadResp> =
  (file, { onProgress, signal }) =>
    uploadFdmNeixiaoPatternDesignItemDesignImage(
      file,
      (event) => onProgress(event.loaded, event.total),
      // 失败原因在行内和上传面板里展示，不再额外弹全局错误
      { signal, silent: true },
    );

function revokeThumb(row: DesignRow) {
  if (row.localThumbUrl) URL.revokeObjectURL(row.localThumbUrl);
  row.localThumbUrl = undefined;
}

export function usePatternDesignItemCreateDraft() {
  const uploadStore = useUploadTaskStore();

  function getRowTask(row: DesignRow): undefined | UploadTask {
    return uploadStore.getTask(row.taskId);
  }

  function getRowState(row: DesignRow): DesignRowState {
    const task = getRowTask(row);
    if (task && isUploadTaskActive(task)) return 'uploading';
    if (row.designImageUrl.trim()) return 'done';
    if (task?.status === 'error' || task?.status === 'canceled') {
      return 'failed';
    }
    // 任务已从上传面板移除，但文件还在，可重新上传
    return row.file ? 'failed' : 'empty';
  }

  const stats = computed(() => {
    let uploading = 0;
    let failed = 0;
    let done = 0;
    for (const row of draft.rows) {
      const state = getRowState(row);
      if (state === 'uploading') uploading++;
      if (state === 'failed') failed++;
      if (state === 'done') done++;
    }
    return { done, failed, total: draft.rows.length, uploading };
  });

  const hasContent = computed(() =>
    draft.rows.some(
      (row) => row.file || row.taskId || row.designImageUrl.trim(),
    ),
  );

  function startUpload(row: DesignRow, link?: RouteLocationRaw) {
    if (!row.file) return;
    const taskId = uploadStore.add({
      file: row.file,
      link,
      onOpen() {
        openRequested.value = true;
      },
      onSuccess(result) {
        // 上传期间行被替换或删除时，丢弃旧结果
        if (row.taskId !== taskId) return;
        row.designImageUrl = result.designImageUrl ?? '';
        row.previewImageUrl = result.previewImageUrl ?? '';
      },
      source: DESIGN_IMAGE_UPLOAD_SOURCE,
      upload: uploadDesignImageTask,
    });
    row.taskId = taskId;
  }

  function attachFile(row: DesignRow, file: File, link?: RouteLocationRaw) {
    revokeThumb(row);
    Object.assign(row, {
      designImageUrl: '',
      file: markRaw(file),
      fileName: file.name,
      fileSize: file.size,
      previewImageUrl: '',
      sourceType: 'upload',
    } satisfies Partial<DesignRow>);
    startUpload(row, link);
    void createLocalThumbnail(file).then((url) => {
      if (!url) return;
      if (row.file === file) {
        row.localThumbUrl = url;
      } else {
        URL.revokeObjectURL(url);
      }
    });
  }

  function createRow(sourceType: DesignRow['sourceType']) {
    return reactive<DesignRow>({
      designImageUrl: '',
      quantity: 1,
      rowKey: ++rowSeq,
      sourceType,
    });
  }

  function addFiles(files: File[], link?: RouteLocationRaw) {
    for (const file of files) {
      const row = createRow('upload');
      draft.rows.push(row);
      attachFile(row, file, link);
    }
  }

  function addUrlRow() {
    draft.rows.push(createRow('url'));
  }

  function replaceFile(row: DesignRow, file: File, link?: RouteLocationRaw) {
    if (row.taskId) uploadStore.remove(row.taskId);
    attachFile(row, file, link);
  }

  function retryRow(row: DesignRow, link?: RouteLocationRaw) {
    const task = getRowTask(row);
    if (task?.status === 'error' || task?.status === 'canceled') {
      uploadStore.retry(task.id);
      return;
    }
    if (!task) startUpload(row, link);
  }

  function removeRow(row: DesignRow) {
    if (row.taskId) uploadStore.remove(row.taskId);
    revokeThumb(row);
    draft.rows = draft.rows.filter((item) => item.rowKey !== row.rowKey);
  }

  /** 提交或放弃草稿：取消未完成的上传，并把这些任务从上传面板移除 */
  function clear() {
    for (const row of draft.rows) {
      if (row.taskId) uploadStore.remove(row.taskId);
      revokeThumb(row);
    }
    draft.rows = [];
    draft.formValues = undefined;
  }

  return {
    addFiles,
    addUrlRow,
    clear,
    draft,
    getRowState,
    getRowTask,
    hasContent,
    openRequested,
    removeRow,
    replaceFile,
    retryRow,
    stats,
  };
}
