import poolController from './pool.controller';
import PoolModel from './pool.model';
import poolRouter from './pool.routes';

export default {
  model: PoolModel,
  controller: poolController,
  routes: poolRouter,
};
