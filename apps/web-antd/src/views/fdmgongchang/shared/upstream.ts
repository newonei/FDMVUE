/** 上道状态标记：只做提示，不拦接单。没有上道时不显示。 */
export function upstreamBadge(state?: null | string) {
  switch (state) {
    case 'DONE': {
      return { cls: 'bg-success/15 text-success', text: '上道已报工' };
    }
    case 'PARTIAL': {
      return { cls: 'bg-warning/15 text-warning', text: '上道报了一部分' };
    }
    case 'WAITING': {
      return { cls: 'bg-muted text-muted-foreground', text: '上道还没人接' };
    }
    case 'WORKING': {
      return { cls: 'bg-primary/10 text-primary', text: '上道在做' };
    }
    default: {
      return null;
    }
  }
}
