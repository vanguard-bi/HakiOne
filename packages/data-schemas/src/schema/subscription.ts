import { Schema } from 'mongoose';
import type * as t from '~/types';

const subscriptionSchema = new Schema<t.ISubscription>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
      unique: true,
    },
    plan: {
      type: String,
      enum: ['free', 'starter', 'standard', 'enterprise'],
      default: 'free',
    },
    status: {
      type: String,
      enum: ['active', 'cancelled', 'expired', 'past_due'],
      default: 'active',
    },
    messageCredits: {
      type: Number,
      default: 0,
    },
    paystackCustomerCode: {
      type: String,
    },
    paystackSubscriptionCode: {
      type: String,
    },
    paystackAuthorizationCode: {
      type: String,
    },
    currentPeriodStart: {
      type: Date,
    },
    currentPeriodEnd: {
      type: Date,
    },
  },
  { timestamps: true },
);

export default subscriptionSchema;
