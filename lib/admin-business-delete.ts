import type { Business } from '@prisma/client';

import { isTestDemoBusiness } from '@/lib/admin-test-data-reset';

export const REAL_CUSTOMER_DELETE_CONFIRMATION = 'DELETE REAL CUSTOMER';
export const PERMANENT_DELETE_EXTERNAL_REVIEW_NOTE =
  'Local business record deleted. External Twilio/Stripe/Clerk records may still need manual review.';

export type PermanentDeleteBusinessCandidate = {
  name: string;
  isTestBusiness: boolean;
  ownerClerkId: string;
};

export function requiresRealCustomerDeleteConfirmation(business: PermanentDeleteBusinessCandidate) {
  return !isTestDemoBusiness(business);
}

export function getPermanentDeleteWarningText(business: PermanentDeleteBusinessCandidate) {
  if (requiresRealCustomerDeleteConfirmation(business)) {
    return 'This permanently deletes the business and business-owned records. This should only be used when you are certain this customer should be removed. Archive is safer for normal churn or cancellation.';
  }

  return 'This permanently deletes the business and business-owned records. Use this only when you are sure this test or demo workspace should be removed.';
}

export function getPermanentDeleteButtonLabel(business: PermanentDeleteBusinessCandidate) {
  return requiresRealCustomerDeleteConfirmation(business)
    ? 'Delete real customer permanently'
    : 'Delete test/demo business permanently';
}

export function validatePermanentDeleteConfirmation(params: {
  business: PermanentDeleteBusinessCandidate;
  confirmationName: string | null | undefined;
  realCustomerConfirmation?: string | null | undefined;
}) {
  if (params.confirmationName?.trim() !== params.business.name) {
    throw new Error('Type the exact business name to delete it.');
  }

  if (
    requiresRealCustomerDeleteConfirmation(params.business) &&
    (params.realCustomerConfirmation?.trim() || '') !== REAL_CUSTOMER_DELETE_CONFIRMATION
  ) {
    throw new Error(`Type ${REAL_CUSTOMER_DELETE_CONFIRMATION} to permanently delete a real customer business.`);
  }
}
