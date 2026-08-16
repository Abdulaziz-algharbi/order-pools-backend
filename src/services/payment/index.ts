import paymentModel from './payment.model';
import paymentController from './payments.controller';
import paymentRoutes from './payments.routes';

export default {
  model: paymentModel,
  controller: paymentController,
  router: paymentRoutes,
};
