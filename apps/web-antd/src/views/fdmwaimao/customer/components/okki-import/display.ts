import type { FdmWaimaoCustomerApi } from '#/api/fdmwaimao/customer';

import dayjs from 'dayjs';

const HIGHLIGHT_MARKER = /#\{([^{}]*)}#/g;

/**
 * OKKI 的部分弱类型字段在不同账号下可能返回数字或复杂结构。
 * 这里只接受可安全展示的文本标量，绝不隐式 stringify 对象/数组，避免
 * `[object Object]`、整段远端响应或敏感字段进入页面。
 */
export function cleanOkkiText(value: unknown) {
  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    text = String(value);
  } else if (typeof value === 'bigint') {
    text = value.toString();
  }
  const cleaned = text.replace(HIGHLIGHT_MARKER, '$1').trim();
  return cleaned || '';
}

export function formatOkkiDateTime(value: unknown, fallback = 'OKKI 未提供') {
  if (
    !(
      (typeof value === 'number' && Number.isFinite(value)) ||
      typeof value === 'string'
    )
  ) {
    return fallback;
  }
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') return fallback;
  const parsed = dayjs(normalized);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : fallback;
}

export function formatOkkiPhone(areaCode: unknown, phone: unknown) {
  return [cleanOkkiText(areaCode), cleanOkkiText(phone)]
    .filter(Boolean)
    .join(' ');
}

export function okkiContactKey(
  contact: FdmWaimaoCustomerApi.OkkiContact,
  index: number,
) {
  const contactId = cleanOkkiText(contact.id);
  if (contactId) return `id:${contactId}`;
  return [
    'contact',
    cleanOkkiText(contact.name),
    cleanOkkiText(contact.email).toLowerCase(),
    formatOkkiPhone(contact.telAreaCode, contact.phone),
    index,
  ].join(':');
}

export function stageLabel(value: unknown) {
  const stage = cleanOkkiText(value);
  return !stage || stage === '0' || stage === '无' ? '无阶段' : stage;
}

export function hasContactChannel(contact: FdmWaimaoCustomerApi.OkkiContact) {
  return Boolean(
    cleanOkkiText(contact.email) ||
    formatOkkiPhone(contact.telAreaCode, contact.phone) ||
    cleanOkkiText(contact.whatsapp) ||
    cleanOkkiText(contact.wechat) ||
    cleanOkkiText(contact.linkedin),
  );
}
