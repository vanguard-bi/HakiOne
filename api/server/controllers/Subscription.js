const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');
const { initializeTransaction, verifyTransaction } = require('~/server/services/paystack');
const { Subscription, Message } = require('~/db/models');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_STANDARD_PLAN_CODE = process.env.PAYSTACK_STANDARD_PLAN_CODE;
const FREE_MESSAGE_LIMIT = 10;
const ENTERPRISE_DOMAINS = ['haki.africa', 'songh.ai'];

/**
 * Checks if the user's email belongs to an enterprise domain.
 */
function isEnterpriseDomain(email) {
  if (!email) {
    return false;
  }
  const domain = email.split('@')[1]?.toLowerCase();
  return ENTERPRISE_DOMAINS.includes(domain);
}

/**
 * Returns start of current month as a Date
 */
function getStartOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * GET /api/subscription
 * Returns subscription status and message usage for the current user
 */
async function getStatus(req, res) {
  try {
    const userId = req.user.id;
    const email = req.user.email;

    // Auto-provision enterprise subscription for matching domains
    if (isEnterpriseDomain(email)) {
      await Subscription.findOneAndUpdate(
        { user: userId },
        { plan: 'enterprise', status: 'active' },
        { upsert: true, new: true },
      );
    }

    let subscription = await Subscription.findOne({ user: userId }).lean();
    if (!subscription) {
      subscription = await Subscription.create({ user: userId, plan: 'free', status: 'active' });
      subscription = subscription.toObject();
    }

    const startOfMonth = getStartOfMonth();
    const messagesUsed = await Message.countDocuments({
      user: userId,
      isCreatedByUser: true,
      createdAt: { $gte: startOfMonth },
    });

    const isLimitEnabled = process.env.CONFIG_PATH?.includes('haki-legal');

    let messagesRemaining;
    if (
      !isLimitEnabled ||
      ((subscription.plan === 'standard' || subscription.plan === 'enterprise') &&
        subscription.status === 'active')
    ) {
      messagesRemaining = -1; // unlimited
    } else {
      const freeRemaining = Math.max(0, FREE_MESSAGE_LIMIT - messagesUsed);
      messagesRemaining = freeRemaining + (subscription.messageCredits || 0);
    }

    res.status(200).json({
      plan: subscription.plan,
      status: subscription.status,
      messageCredits: subscription.messageCredits || 0,
      messagesUsed,
      messagesRemaining,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  } catch (error) {
    logger.error('[Subscription.getStatus]', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
}

/**
 * POST /api/subscription/initialize
 * Accepts { plan: 'starter'|'standard' } and returns Paystack authorization URL
 */
async function initializePayment(req, res) {
  try {
    const { plan } = req.body;
    const userId = req.user.id;
    const email = req.user.email;

    if (!plan || !['starter', 'standard'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Must be "starter" or "standard".' });
    }

    const callbackUrl = `${process.env.DOMAIN_CLIENT}/pricing?plan=${plan}`;

    const params = {
      email,
      callback_url: callbackUrl,
      metadata: {
        userId,
        plan,
      },
    };

    if (plan === 'starter') {
      params.amount = 10000; // Ksh 100 in cents
    } else if (plan === 'standard') {
      params.amount = 300000; // Ksh 3,000 in cents
      if (PAYSTACK_STANDARD_PLAN_CODE) {
        params.plan = PAYSTACK_STANDARD_PLAN_CODE;
      }
    }

    const result = await initializeTransaction(params);

    res.status(200).json({
      authorizationUrl: result.data.authorization_url,
      reference: result.data.reference,
      accessCode: result.data.access_code,
    });
  } catch (error) {
    const detail = error.response?.data || error.message;
    logger.error('[Subscription.initializePayment]', { error: detail, stack: error.stack });
    res.status(500).json({ error: 'Failed to initialize payment', detail });
  }
}

/**
 * GET /api/subscription/verify?reference=xxx
 * Verifies a Paystack transaction and applies the appropriate credits/subscription
 */
async function verifyPayment(req, res) {
  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).json({ error: 'Reference is required' });
    }

    const result = await verifyTransaction(reference);

    if (result.data.status !== 'success') {
      return res.status(400).json({ error: 'Payment was not successful', status: result.data.status });
    }

    const metadata = result.data.metadata || {};
    const plan = metadata.plan;
    const userId = metadata.userId;

    if (!userId) {
      return res.status(400).json({ error: 'Payment metadata missing userId' });
    }

    if (plan === 'starter') {
      await Subscription.findOneAndUpdate(
        { user: userId },
        {
          $inc: { messageCredits: 10 },
          $setOnInsert: { plan: 'free', status: 'active' },
        },
        { upsert: true, new: true },
      );
    } else if (plan === 'standard') {
      const subscriptionData = result.data.plan_object || {};
      const authorization = result.data.authorization || {};

      await Subscription.findOneAndUpdate(
        { user: userId },
        {
          plan: 'standard',
          status: 'active',
          paystackCustomerCode: result.data.customer?.customer_code,
          paystackSubscriptionCode: result.data.subscription_code || subscriptionData.subscription_code,
          paystackAuthorizationCode: authorization.authorization_code,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        { upsert: true, new: true },
      );
    }

    res.status(200).json({ success: true, plan });
  } catch (error) {
    logger.error('[Subscription.verifyPayment]', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
}

/**
 * GET /api/subscription/plans
 * Returns static plan metadata (no auth required)
 */
async function getPlans(req, res) {
  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      currency: 'KES',
      interval: null,
      messages: FREE_MESSAGE_LIMIT,
      description: `${FREE_MESSAGE_LIMIT} messages per month`,
      features: [`${FREE_MESSAGE_LIMIT} messages/month`, 'Basic AI access'],
    },
    {
      id: 'starter',
      name: 'Starter',
      price: 100,
      currency: 'KES',
      interval: 'one-time',
      messages: 10,
      description: 'One-time purchase of 10 additional messages',
      features: ['10 additional messages', 'No expiry on credits'],
    },
    {
      id: 'standard',
      name: 'Standard',
      price: 3000,
      currency: 'KES',
      interval: 'month',
      messages: -1,
      description: 'Unlimited messages with monthly subscription',
      features: ['Unlimited messages', 'Priority support'],
    },
  ];

  res.status(200).json(plans);
}

/**
 * POST /api/subscription/webhook
 * Handles Paystack webhook events with HMAC-SHA512 signature verification
 */
async function handleWebhook(req, res) {
  try {
    const hash = crypto
      .createHmac('sha512', PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    logger.info('[Subscription.webhook] Received event', { event: event.event });

    switch (event.event) {
      case 'charge.success': {
        const data = event.data;
        const metadata = data.metadata || {};
        const userId = metadata.userId;

        if (!userId) {
          logger.warn('[Subscription.webhook] No userId in metadata');
          break;
        }

        if (metadata.plan === 'starter') {
          await Subscription.findOneAndUpdate(
            { user: userId },
            {
              $inc: { messageCredits: 10 },
              $setOnInsert: { plan: 'free', status: 'active' },
            },
            { upsert: true },
          );
        } else if (metadata.plan === 'standard') {
          const authorization = data.authorization || {};
          await Subscription.findOneAndUpdate(
            { user: userId },
            {
              plan: 'standard',
              status: 'active',
              paystackCustomerCode: data.customer?.customer_code,
              paystackAuthorizationCode: authorization.authorization_code,
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
            { upsert: true },
          );
        }
        break;
      }

      case 'subscription.not_renew':
      case 'subscription.disable': {
        const data = event.data;
        const customerCode = data.customer?.customer_code;
        if (customerCode) {
          await Subscription.findOneAndUpdate(
            { paystackCustomerCode: customerCode },
            {
              status: event.event === 'subscription.disable' ? 'cancelled' : 'expired',
            },
          );
        }
        break;
      }

      default:
        logger.info('[Subscription.webhook] Unhandled event', { event: event.event });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('[Subscription.webhook]', error);
    res.status(200).json({ received: true });
  }
}

module.exports = {
  getStatus,
  initializePayment,
  verifyPayment,
  getPlans,
  handleWebhook,
};
