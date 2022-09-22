import 'dotenv/config';
import { config } from '../../config';

(async () => {
  // call config class to setup config
  // can update config using the config instance.
  config.setup();
  const server = await import('./server');
  // if ( === 'done') {
    server.init();
    // await import('./service-manager');
  // }
})();
