import { Document, Types } from 'mongoose';

export interface ISubscription extends Document {
  user: Types.ObjectId;
  plan: 'free' | 'starter' | 'standard' | 'enterprise';
  status: 'active' | 'cancelled' | 'expired' | 'past_due';
  messageCredits: number;
  paystackCustomerCode?: string;
  paystackSubscriptionCode?: string;
  paystackAuthorizationCode?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
}
