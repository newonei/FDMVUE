import type { Dayjs } from 'dayjs';

import dayjs from 'dayjs';

/**
 * 工厂都在中国，后端也按北京时间判断「今天」（例如排单开始日期不能早于今天）。
 * 在别的时区打开页面时，默认日期、「今天」、几点都按工厂算，免得和后端差一天。
 */
export const FACTORY_TIME_ZONE = 'Asia/Shanghai';

/** 工厂今天的日期，YYYY-MM-DD。 */
export function factoryTodayText(now: Date = new Date()): string {
  return now.toLocaleDateString('sv-SE', { timeZone: FACTORY_TIME_ZONE });
}

/** 工厂今天，给日期选择器用（浏览器时区当天零点，日期和工厂一致）。 */
export function factoryToday(now: Date = new Date()): Dayjs {
  return dayjs(factoryTodayText(now));
}

/** 工厂现在几点（0–23）。 */
export function factoryHour(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: FACTORY_TIME_ZONE,
    }).format(now),
  );
}
