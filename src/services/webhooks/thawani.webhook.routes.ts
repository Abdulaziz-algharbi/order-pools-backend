import { Router } from 'express';
import thawaniWebhookController from './thawani.webhook.controller';

const router = Router();

// No auth — this is called by Thawani, not an authenticated user of ours.
// See thawani.webhook.controller.ts for why the payload is never trusted
// directly.
router.post('/thawani', thawaniWebhookController.handleThawaniWebhook);

export default router;
