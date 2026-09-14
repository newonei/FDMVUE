import { computed, onActivated, onDeactivated, ref } from 'vue';
import { useRoute } from 'vue-router';

/** Cached pages share useRoute(); only the current activated page owns its drawers. */
export function useRouteOwner() {
  const route = useRoute();
  const ownerPath = route.path;
  const activated = ref(true);
  onActivated(() => {
    activated.value = true;
  });
  onDeactivated(() => {
    activated.value = false;
  });
  return computed(() => activated.value && route.path === ownerPath);
}
