const express = require('express');
const router = express.Router();
const controller = require('../controllers/Subscription');
const { requireJwtAuth } = require('../middleware/');

router.get('/', requireJwtAuth, controller.getStatus);
router.post('/initialize', requireJwtAuth, controller.initializePayment);
router.get('/verify', controller.verifyPayment);
router.get('/plans', controller.getPlans);
router.post('/webhook', controller.handleWebhook);

module.exports = router;
