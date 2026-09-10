// Empty on purpose: every service today reaches another service's model
// via a direct import (see e.g. pool.controller.ts importing userModel,
// productOfferModel, etc.) because none of those imports actually forms a
// load-time cycle — models only ever import mongoose/bcrypt, never another
// service. Add an entry here (and register it in src/app.ts) only if a
// future cross-service dependency genuinely can't be a direct import
// without creating a real circular require.
export default Object.freeze({});
