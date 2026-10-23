import type { AxiosRequestConfig } from '@vben/request';

import { h } from 'vue';

import { Modal, Progress } from 'ant-design-vue';

import { formatBytes } from './format';

/** 大文件上传、下载不设请求超时上限过短，按 1GB 在慢速网络下的耗时预留 */
export const LARGE_FILE_TIMEOUT = 60 * 60 * 1000;
/** 小于这个大小的上传一闪而过，不弹进度框 */
const SHOW_PROGRESS_FROM_BYTES = 2 * 1024 * 1024;
/** antd 确认框默认层级低于 vben 弹窗（2000），在弹窗里上传时需要抬高 */
const PROGRESS_Z_INDEX = 2100;

export type UploadProgressHandler = NonNullable<
  AxiosRequestConfig['onUploadProgress']
>;

function totalSize(files: readonly Pick<File, 'size'>[]) {
  return files.reduce((sum, file) => sum + file.size, 0);
}

/**
 * 附件随请求上传时显示进度弹窗：浏览器发送完毕后服务端还要转存到对象存储，
 * 此时显示「正在保存」直到请求返回。
 */
export async function withUploadProgress<T>(
  files: readonly Pick<File, 'size'>[],
  run: (onUploadProgress: UploadProgressHandler) => Promise<T>,
  title = '正在上传附件',
): Promise<T> {
  const total = totalSize(files);
  if (total < SHOW_PROGRESS_FROM_BYTES) return run(() => {});
  let loaded = 0;
  const content = () => {
    const percent = Math.min(100, Math.floor((loaded / total) * 100));
    const text =
      percent >= 100
        ? '已上传，正在保存到文件存储，请勿关闭页面…'
        : `已上传 ${formatBytes(loaded)} / ${formatBytes(total)}，请勿关闭页面`;
    return h('div', [
      h(Progress, { percent, status: 'active' }),
      h('div', { style: 'color: var(--ant-color-text-secondary)' }, text),
    ]);
  };
  const dialog = Modal.info({
    title,
    content: content(),
    closable: false,
    keyboard: false,
    maskClosable: false,
    footer: '',
    zIndex: PROGRESS_Z_INDEX,
  });
  try {
    return await run((event) => {
      loaded = Math.min(total, event.loaded);
      dialog.update({ content: content() });
    });
  } finally {
    dialog.destroy();
  }
}
