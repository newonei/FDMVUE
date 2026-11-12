import { mergeConfig } from 'vitest/config';
import base from '../vitest.config';

export default mergeConfig(base, {
  server: {
    fs: {
      allow: [
        'C:/Users/Administrator/Desktop/Project/FDMVUE-card-publish-20261112',
        'C:/Users/Administrator/Desktop/Project/FDMVUE',
      ],
    },
  },
});
