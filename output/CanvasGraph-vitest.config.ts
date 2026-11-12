import { mergeConfig } from 'vitest/config';
import config from './NodeResult-vitest.config';

export default mergeConfig(config, {
  test: { server: { deps: { inline: [/@antv\/x6/] } } },
});
