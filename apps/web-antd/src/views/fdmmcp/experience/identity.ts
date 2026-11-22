import { computed } from 'vue';

import { useAccessStore, useUserStore } from '@vben/stores';

export function useExperienceIdentity() {
  const access = useAccessStore();
  const user = useUserStore();
  return computed(() =>
    JSON.stringify([
      !!access.accessToken,
      access.tenantId,
      access.visitTenantId,
      user.userInfo?.id ?? user.userInfo?.userId ?? null,
    ]),
  );
}
