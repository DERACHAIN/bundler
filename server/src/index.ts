/* eslint-disable import/first */
require('dotenv').config({ path: `${__dirname}/../../.env` });

import { logger } from '../../common/log-config';
import { configInstance } from '../../config';
import tracer from 'dd-trace';

tracer.init({ logInjection: false });

const log = logger(module);

(async () => {
  if (configInstance.active()) {
    const server = await import('./server');
    server.init();
  } else {
    log.info('Config not active');
  }
})();
