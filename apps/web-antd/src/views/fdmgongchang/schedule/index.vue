<script lang="ts" setup>
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { FACTORY_ROUTES } from '../shared/routes';

/**
 * 旧的「AI 排单」菜单已经并进「工厂排单 → 排单方案」：菜单隐藏，权限按钮还挂在它下面；
 * 收藏的旧地址打开时跳过去，带着要打开的那一份排单。
 */
defineOptions({ name: 'FdmGongchangSchedule' });

const route = useRoute();
const router = useRouter();

onMounted(() => {
  const id = route?.query?.id;
  void router.replace({ ...FACTORY_ROUTES.schedule, query: { ...FACTORY_ROUTES.schedule.query, ...(id ? { id: String(id) } : {}) } });
});
</script>

<template>
  <div></div>
</template>
