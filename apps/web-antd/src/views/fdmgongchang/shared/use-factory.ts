import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';

import { computed, ref } from 'vue';

import {
  getMyFactories,
  setCurrentFactoryId,
} from '#/api/fdmgongchang/factory';

const STORAGE_KEY = 'fdmgongchang:factory-id';

function readSaved(): null | number {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function save(id: null | number) {
  try {
    if (id === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // 浏览器禁用存储时只在本次页面里记住
  }
}

/**
 * 当前操作的工厂：普通人员只有自己所在的工厂；有「查看全部工厂」权限的人可以切换，
 * 上次选的工厂记在浏览器里。选中后工厂相关接口都会带上 factory-id。
 */
export function useFactory() {
  const factories = ref<FdmgongchangFactoryApi.Factory[]>([]);
  const factoryId = ref<null | number>(null);
  const canSeeAll = ref(false);
  const loaded = ref(false);
  const current = computed(() =>
    factories.value.find((f) => f.id === factoryId.value),
  );

  function select(id: null | number) {
    factoryId.value = id;
    setCurrentFactoryId(id);
    if (canSeeAll.value) save(id);
  }

  async function load() {
    const my = await getMyFactories();
    factories.value = my.factories ?? [];
    canSeeAll.value = !!my.canSeeAll;
    const saved = canSeeAll.value ? readSaved() : null;
    const pick =
      factories.value.find((f) => f.id === saved)?.id ??
      factories.value.find((f) => f.id === my.defaultFactoryId)?.id ??
      factories.value[0]?.id ??
      null;
    select(pick);
    loaded.value = true;
  }

  return { canSeeAll, current, factories, factoryId, load, loaded, select };
}
