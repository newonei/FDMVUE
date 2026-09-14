import { onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { errorText } from '../data';
import { referenceId, withoutDetailQuery } from './navigation';
import { useRouteOwner } from './useRouteOwner';

export function useEntityDetail<T>(
  key: string,
  load: (id: string) => Promise<T>,
  show: (value: T | undefined) => void,
  close: () => void,
  fail: (message: string) => void,
) {
  const route = useRoute();
  const router = useRouter();
  const active = useRouteOwner();
  let sequence = 0;
  async function locate() {
    const run = ++sequence;
    close();
    if (!active.value) return;
    const id = referenceId(route.query[key]);
    if (!id) {
      if (route.query[key] !== undefined)
        fail('关联资料链接无效，请从来源单据重新打开');
      return;
    }
    try {
      const value = await load(id);
      if (run === sequence && active.value) show(value);
    } catch (error) {
      if (run === sequence) fail(`无法打开关联资料：${errorText(error)}`);
    }
  }
  onBeforeUnmount(() => {
    sequence++;
  });
  watch(
    () => [route.query[key], active.value],
    () => {
      void locate();
    },
    { immediate: true, flush: 'post' },
  );
  return {
    invalidatePending() {
      sequence++;
    },
    open(id?: string) {
      if (id) {
        if (route.query[key] === id) void locate();
        else void router.push({ query: { ...route.query, [key]: id } });
      } else {
        sequence++;
        void router
          .replace({ query: withoutDetailQuery(route.query, key) })
          .then(() => show(undefined));
      }
    },
    close() {
      sequence++;
      close();
      if (active.value)
        void router.replace({ query: withoutDetailQuery(route.query, key) });
    },
  };
}
