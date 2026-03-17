import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';
import { useGetSubscription, useGetPlans, useInitializePayment, useVerifyPayment } from '~/data-provider';

const PricingPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isAuthenticated, user } = useAuthContext();
  const isAuthLoading = !isAuthenticated && user == null;

  const { data: subscription, refetch: refetchSubscription } = useGetSubscription({
    enabled: isAuthenticated,
  });
  const { data: plans } = useGetPlans();
  const initPayment = useInitializePayment();
  const verifyPaymentMutation = useVerifyPayment();
  const planList = plans ?? defaultPlans;

  const handleVerifyCallback = useCallback(async (reference: string) => {
    setVerifying(true);
    setError(null);
    try {
      await verifyPaymentMutation.mutateAsync(reference);
      setVerified(true);
      refetchSubscription();
      navigate('/pricing', { replace: true });
    } catch {
      setError('Payment verification failed. Please contact support.');
    } finally {
      setVerifying(false);
    }
  }, [verifyPaymentMutation, refetchSubscription, navigate]);

  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref');
    if (reference && !verifying && !verified) {
      handleVerifyCallback(reference);
    }
  }, [searchParams, verifying, verified, handleVerifyCallback]);

  const handleSelectPlan = async (planId: string) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (planId === 'free') {
      return;
    }

    setError(null);
    try {
      const result = await initPayment.mutateAsync({
        plan: planId as 'starter' | 'standard',
      });
      window.location.href = result.authorizationUrl;
    } catch {
      setError('Failed to initialize payment. Please try again.');
    }
  };

  const currentPlan = subscription?.plan || 'free';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            &larr; Back to chat
          </button>
        </div>
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Pricing Plans</h1>
          <p className="mt-3 text-gray-500 dark:text-gray-400">
            Choose the plan that works best for you
          </p>
        </div>

        {/* Status Messages */}
        {verifying && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-center text-red-700 dark:bg-red-900/30 dark:text-red-300">
            Verifying your payment...
          </div>
        )}
        {verified && (
          <div className="mb-6 rounded-lg bg-green-50 p-4 text-center text-green-700 dark:bg-green-900/30 dark:text-green-300">
            Payment verified successfully! Your plan has been updated.
          </div>
        )}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-center text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Current Usage (authenticated only) */}
        {isAuthenticated && subscription && (
          <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              Your Usage
            </h2>
            <div className="flex flex-wrap gap-6 text-sm text-gray-600 dark:text-gray-300">
              <div>
                <span className="font-medium">Current Plan:</span>{' '}
                <span className="capitalize">{subscription.plan}</span>
              </div>
              <div>
                <span className="font-medium">Messages Used (this month):</span>{' '}
                {subscription.messagesUsed}
              </div>
              <div>
                <span className="font-medium">Messages Remaining:</span>{' '}
                {subscription.messagesRemaining === -1
                  ? 'Unlimited'
                  : subscription.messagesRemaining}
              </div>
              {subscription.messageCredits > 0 && (
                <div>
                  <span className="font-medium">Bonus Credits:</span>{' '}
                  {subscription.messageCredits}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Plan Cards */}
        <div className="grid gap-6 md:grid-cols-3">
          {planList.filter((plan) => plan.id !== 'enterprise').map((plan) => {
            const isCurrent = isAuthenticated && currentPlan === plan.id;
            const isStandard = plan.id === 'standard';

            return (
              <div
                key={plan.id}
                className={`relative rounded-lg border p-6 ${
                  isStandard
                    ? 'border-red-500 dark:border-red-400'
                    : 'border-gray-200 dark:border-gray-700'
                } bg-white dark:bg-gray-800`}
              >
                {isStandard && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-3 py-0.5 text-xs font-medium text-white">
                    Recommended
                  </div>
                )}

                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{plan.name}</h3>

                <div className="mt-4 flex items-baseline">
                  <span className="text-3xl font-bold text-gray-900 dark:text-white">
                    {plan.price === 0 ? 'Free' : `KES ${plan.price.toLocaleString()}`}
                  </span>
                  {plan.interval === 'month' && (
                    <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">/month</span>
                  )}
                  {plan.interval === 'one-time' && (
                    <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">one-time</span>
                  )}
                </div>

                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{plan.description}</p>

                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature, i) => (
                    <li
                      key={i}
                      className="flex items-center text-sm text-gray-600 dark:text-gray-300"
                    >
                      <svg
                        className="mr-2 h-4 w-4 flex-shrink-0 text-red-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={
                    (isCurrent && plan.id !== 'starter') || initPayment.isLoading || verifying || isAuthLoading
                  }
                  className={`mt-6 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    isCurrent && plan.id !== 'starter'
                      ? 'cursor-default bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      : isStandard
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : plan.id === 'free'
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                          : 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200'
                  }`}
                >
                  {isCurrent && plan.id !== 'starter'
                    ? 'Current Plan'
                    : plan.id === 'free'
                      ? isAuthenticated
                        ? 'Current Plan'
                        : 'Get Started'
                      : plan.id === 'starter'
                        ? 'Buy 10 Messages'
                        : 'Subscribe'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const defaultPlans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'KES',
    interval: null,
    messages: 10,
    description: '10 messages per month',
    features: ['10 messages/month', 'Basic AI access'],
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

export default PricingPage;
