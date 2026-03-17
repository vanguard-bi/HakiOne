const { logger } = require('@librechat/data-schemas');
const { ViolationTypes } = require('librechat-data-provider');
const { logViolation } = require('~/cache');
const { Subscription, Message } = require('~/db/models');

const FREE_MESSAGE_LIMIT = 10;
const ENTERPRISE_DOMAINS = ['haki.africa', 'songh.ai'];

/**
 * Returns start of current month as a Date
 */
function getStartOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Checks if the user's email belongs to an enterprise domain.
 * @param {string} email
 * @returns {boolean}
 */
function isEnterpriseDomain(email) {
  if (!email) {
    return false;
  }
  const domain = email.split('@')[1]?.toLowerCase();
  return ENTERPRISE_DOMAINS.includes(domain);
}

/**
 * Ensures an enterprise user has an enterprise subscription.
 * @param {string} userId
 * @returns {Promise<Object|null>} The enterprise subscription, or null if not applicable
 */
async function ensureEnterpriseSubscription(userId, email) {
  if (!isEnterpriseDomain(email)) {
    return null;
  }
  const subscription = await Subscription.findOneAndUpdate(
    { user: userId },
    { plan: 'enterprise', status: 'active' },
    { upsert: true, new: true },
  );
  return subscription.toObject ? subscription.toObject() : subscription;
}

/**
 * Checks if a user has remaining messages based on their subscription plan.
 * Throws an error if the user has exceeded their message limit.
 *
 * @param {Object} params
 * @param {Object} params.req - Express request object
 * @param {Object} params.res - Express response object
 * @returns {Promise<boolean>} true if the user can send a message
 * @throws {Error} if the user has exceeded their message limit
 */
const checkMessageLimit = async ({ req, res }) => {
  const userId = req.user.id;
  const email = req.user.email;

  // Enterprise domain users get unlimited messages
  const enterpriseSub = await ensureEnterpriseSubscription(userId, email);
  if (enterpriseSub) {
    return true;
  }

  let subscription = await Subscription.findOne({ user: userId }).lean();
  if (!subscription) {
    subscription = await Subscription.create({ user: userId, plan: 'free', status: 'active' });
    subscription = subscription.toObject();
  }

  // Standard/enterprise active subscribers get unlimited messages
  if (
    (subscription.plan === 'standard' || subscription.plan === 'enterprise') &&
    subscription.status === 'active'
  ) {
    return true;
  }

  // Count user messages this month
  const startOfMonth = getStartOfMonth();
  const messagesUsed = await Message.countDocuments({
    user: userId,
    isCreatedByUser: true,
    createdAt: { $gte: startOfMonth },
  });

  // Free allowance not yet exhausted
  if (messagesUsed < FREE_MESSAGE_LIMIT) {
    return true;
  }

  // Free allowance exhausted, try to use message credits
  if (subscription.messageCredits > 0) {
    const result = await Subscription.findOneAndUpdate(
      { user: userId, messageCredits: { $gt: 0 } },
      { $inc: { messageCredits: -1 } },
      { new: true },
    );

    if (result) {
      return true;
    }
  }

  // No messages remaining
  const type = ViolationTypes.MESSAGE_LIMIT;
  const errorMessage = {
    type,
    messagesUsed,
    messageLimit: FREE_MESSAGE_LIMIT,
    messageCredits: subscription.messageCredits || 0,
  };

  await logViolation(req, res, type, errorMessage, 0);
  throw new Error(JSON.stringify(errorMessage));
};

module.exports = {
  checkMessageLimit,
};
