import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { useAccessStore, useUserStore } from '@vben/stores';

import { createEventHook } from '@vueuse/core';

import { getCurrentFactoryId } from '#/api/fdmgongchang/factory';
import { getOrderBoardShortageCount } from '#/api/fdmgongchang/order-board';

import { FACTORY_ROUTES } from '../shared/routes';

const refresh = createEventHook();

export function refreshOrderBoardShortageBadge() {
  void refresh.trigger();
}

export function useOrderBoardShortageBadge() {
  const router = useRouter();
  const accessStore = useAccessStore();
  const userStore = useUserStore();
  const { hasAccessByCodes } = useAccess();

  const menu = computed(() => {
    const route = FACTORY_ROUTES.orderBoard;
    if (
      !accessStore.isAccessChecked ||
      accessStore.loginExpired ||
      !hasAccessByCodes(['fdmgongchang:order-board:query']) ||
      !router.hasRoute(route.name)
    ) {
      return;
    }
    return accessStore.getMenuByPath(router.resolve(route).path);
  });

  watch(
    [
      menu,
      getCurrentFactoryId,
      () => userStore.userInfo?.id,
      () => accessStore.visitTenantId ?? accessStore.tenantId,
    ],
    ([item, factoryId, userId], _, onCleanup) => {
      if (!item || !userId) return;

      const original = {
        badge: item.badge,
        badgeType: item.badgeType,
        badgeVariants: item.badgeVariants,
      };
      const controller = new AbortController();
      let loading = false;

      async function update() {
        if (loading || controller.signal.aborted || document.hidden) return;
        loading = true;
        try {
          const count = await getOrderBoardShortageCount(
            factoryId,
            controller.signal,
          );
          if (!controller.signal.aborted && item) {
            Object.assign(item, {
              badge: count > 0 ? String(count) : undefined,
              badgeType: 'normal',
              badgeVariants: 'destructive',
            });
          }
        } catch {
          // 短暂的请求失败保留当前数量，下一次自动刷新时重试。
        } finally {
          loading = false;
        }
      }

      const timer = window.setInterval(update, 60_000);
      window.addEventListener('focus', update);
      const { off } = refresh.on(update);
      onCleanup(() => {
        controller.abort();
        window.clearInterval(timer);
        window.removeEventListener('focus', update);
        off();
        Object.assign(item, original);
      });
      void update();
    },
    { immediate: true },
  );
}
