import type { DingTalkInteractiveCardApi } from '#/api/fdmdingtalk/interactive-card';

export interface CardRecipient {
  id?: number;
  nickname: string;
  username: string;
  status?: number;
}

export interface CardTestForm {
  systemUserId?: number;
  title: string;
  content: string;
}

export function cardRecipientOptions(users: CardRecipient[]) {
  return users
    .filter(
      (user) =>
        Number.isSafeInteger(user.id) &&
        user.id! > 0 &&
        (user.status === undefined || user.status === 0),
    )
    .map((user) => ({
      value: user.id!,
      label: `${user.nickname || user.username}（${user.username || user.id}）`,
    }));
}

/** A retry of the same request reuses its key after a lost HTTP response. */
export function buildInteractiveCardSendAttempt(
  form: CardTestForm,
  previous: DingTalkInteractiveCardApi.SendParams | undefined,
  makeKey: () => string,
): DingTalkInteractiveCardApi.SendParams {
  const title = form.title.trim();
  const content = form.content.trim();
  if (!Number.isSafeInteger(form.systemUserId) || form.systemUserId! <= 0) {
    throw new Error('请从系统用户中选择一位收件人');
  }
  if (!title || title.length > 100) {
    throw new Error('标题需要填写 1 至 100 个字符');
  }
  if (!content || content.length > 1000) {
    throw new Error('正文需要填写 1 至 1000 个字符');
  }
  const payload = {
    systemUserId: form.systemUserId!,
    title,
    content,
  };
  return {
    ...payload,
    requestKey:
      previous?.systemUserId === payload.systemUserId &&
      previous.title === payload.title &&
      previous.content === payload.content
        ? previous.requestKey
        : makeKey(),
  };
}

export function cardSendBlockReason(
  settings: DingTalkInteractiveCardApi.Settings | undefined,
  appEnabled: boolean,
  appDirty: boolean,
  cardDirty: boolean,
) {
  if (appDirty) return '请先保存应用连接中的修改';
  if (!appEnabled) return '请先启用并保存钉钉应用';
  if (!settings) return '请先读取互动卡片配置';
  if (cardDirty) return '请先保存互动卡片配置';
  if (!settings.enabled) return '请先启用互动卡片并保存';
  if (!(settings.templateId || '').trim()) return '请填写已发布的卡片模板 ID';
  if (!(settings.robotCode || '').trim()) return '请先配置应用机器人的 RobotCode';
  if (!settings.streamEnabled || !settings.streamRunning) {
    return '请先连接 Stream，以接收卡片内的确认事件';
  }
  return '';
}

export function cardStatusLabel(status: DingTalkInteractiveCardApi.Status) {
  return (
    {
      ACKNOWLEDGED: '用户已确认',
      DELIVERED: '钉钉已接受投放',
      FAILED: '发送失败',
      SENDING: '发送中',
      UNKNOWN: '结果待核实',
    }[status] || status
  );
}

export function cloudUpdateStatusLabel(
  status: DingTalkInteractiveCardApi.CloudUpdateStatus,
) {
  return (
    {
      FAILED: '原卡片更新失败',
      NONE: '尚无更新',
      PENDING: '原卡片更新中',
      SYNCED: '原卡片已更新',
    }[status] || status
  );
}
