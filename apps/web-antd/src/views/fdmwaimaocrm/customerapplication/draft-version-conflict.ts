export interface DraftVersionConflictConfirmConfig {
  autoFocusButton: 'cancel';
  cancelText: string;
  content: string;
  okText: string;
  okType: 'danger';
  onCancel: () => void;
  onOk: () => Promise<void>;
  title: string;
}

interface ConfirmDraftVersionConflictOptions {
  confirm: (config: DraftVersionConflictConfirmConfig) => unknown;
  loadLatest: () => Promise<boolean>;
  onLoadError: () => void;
  onLoaded: () => void;
}

/**
 * 在用户明确确认前保留本地输入。安全的“保留”操作拥有默认焦点，
 * 载入最新版是唯一会放弃未保存内容的显式操作。
 */
export function confirmDraftVersionConflict({
  confirm,
  loadLatest,
  onLoadError,
  onLoaded,
}: ConfirmDraftVersionConflictOptions) {
  return new Promise<void>((resolve) => {
    confirm({
      autoFocusButton: 'cancel',
      cancelText: '保留当前输入',
      content:
        '服务器上已有新版本。当前输入已保留；只有选择“载入最新版”才会放弃这些未保存修改。',
      okText: '载入最新版',
      okType: 'danger',
      onCancel: resolve,
      async onOk() {
        try {
          if (await loadLatest()) {
            onLoaded();
          }
        } catch {
          onLoadError();
        } finally {
          resolve();
        }
      },
      title: '草稿已被其他操作更新',
    });
  });
}
