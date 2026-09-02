/**
 * 后端的全局 Long 序列化策略会把 JavaScript 安全范围内的 Long 输出为
 * number，超过安全范围的 Long 输出为 string。采购领域在 API 边界统一转成
 * string，组件层不得再感知 number|string 的双态身份。
 */
export function normalizeId(value: unknown, fieldName = 'id'): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`${fieldName} 超出 JavaScript 安全整数范围`);
    }
    return String(value);
  }
  if (typeof value === 'string' && value.length > 0) return value;
  throw new TypeError(`${fieldName} 不是有效身份标识`);
}

export function normalizeNullableId(
  value: unknown,
  fieldName = 'id',
): null | string | undefined {
  if (value === null || value === undefined) return value;
  return normalizeId(value, fieldName);
}
