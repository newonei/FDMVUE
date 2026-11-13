import type { ManagementListState } from '../views/fdmperformance/batches/list-state';

import { computed, ref, watch } from 'vue';

import { useAccessStore, useTabbarStore, useUserStore } from '@vben/stores';

import { defineStore } from 'pinia';

/** Session-only navigation state. Assessment rows and permissions are never persisted. */
export const usePerformanceManagementStore = defineStore(
  'fdm-performance-management',
  () => {
    const accessStore = useAccessStore();
    const userStore = useUserStore();
    const tabbarStore = useTabbarStore();
    const saved = ref<ManagementListState | null>(null);
    const owner = ref('');
    const identity = computed(() =>
      accessStore.accessToken &&
      userStore.userInfo?.id !== undefined &&
      userStore.userInfo.id !== null
        ? JSON.stringify([
            userStore.userInfo.id,
            accessStore.tenantId,
            accessStore.visitTenantId,
          ])
        : '',
    );
    let closed = false;

    function clear() {
      saved.value = null;
    }
    function ensureOwner() {
      if (owner.value !== identity.value) clear();
      owner.value = identity.value;
    }
    // These watchers belong to the store scope, so closing an inactive page also clears it.
    watch(identity, ensureOwner, { flush: 'sync' });
    watch(
      () =>
        tabbarStore.tabs.some((tab) => tab.path === '/fdmperformance/batches'),
      (open, wasOpen) => {
        if (wasOpen && !open) clear();
        closed = !open;
      },
      { flush: 'sync' },
    );

    function restore() {
      // Persistence is hydrated after setup; recheck its owner before using it.
      ensureOwner();
      return saved.value;
    }
    function save(state: ManagementListState, expectedOwner: string) {
      if (!identity.value || identity.value !== expectedOwner || closed) return;
      ensureOwner();
      saved.value = state;
    }
    function $reset() {
      clear();
      owner.value = '';
    }
    return { $reset, clear, identity, owner, restore, save, saved };
  },
  { persist: { pick: ['owner', 'saved'], storage: sessionStorage } },
);
