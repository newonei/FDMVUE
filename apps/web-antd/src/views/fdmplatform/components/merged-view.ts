import type { InjectionKey } from 'vue';

import { inject } from 'vue';

export const mergedViewKey: InjectionKey<boolean> = Symbol(
  'fdmplatform.mergedView',
);

/** 合并页签里，页签已经写明当前单据类型；内容区只留一行说明，不再重复大标题。 */
export function useInMergedView() {
  return inject(mergedViewKey, false);
}
