import type { JixiaoApi } from '#/api/fdmperformance';

import { ref } from 'vue';

import { getPerformanceAccess } from '#/api/fdmperformance';

/** Each page loads its own server capabilities; never retain them across accounts. */
export function usePerformanceAccess() {
  const access = ref<JixiaoApi.Access>();
  const accessLoading = ref(false);
  async function loadAccess() {
    access.value = undefined;
    accessLoading.value = true;
    try {
      access.value = await getPerformanceAccess();
      return access.value;
    } finally {
      accessLoading.value = false;
    }
  }
  return { access, accessLoading, loadAccess };
}
