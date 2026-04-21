import { z } from 'zod';

const twilioAccountModeSchema = z.enum(['MAIN_ACCOUNT', 'BUSINESS_SUBACCOUNT']);
const twilioNumberSetupModeSchema = z.enum(['NEW_NUMBER', 'EXISTING_NUMBER']);

export const onboardingSchema = z.object({
  name: z.string().min(2).max(120),
  forwardingNumber: z.string().min(7).max(30),
  notifyPhone: z.string().max(30).optional().or(z.literal('')),
  twilioAccountMode: twilioAccountModeSchema.default('BUSINESS_SUBACCOUNT'),
  twilioNumberSetupMode: twilioNumberSetupModeSchema.default('NEW_NUMBER'),
  missedCallSeconds: z.coerce.number().int().min(5).max(90).default(20),
  serviceLabel1: z.string().min(1).max(40),
  serviceLabel2: z.string().min(1).max(40),
  serviceLabel3: z.string().min(1).max(40),
  timezone: z.string().min(2).max(100),
});

export const businessSettingsSchema = onboardingSchema.extend({
  ownerEmail: z.string().email().optional().or(z.literal('')),
  notifySms: z.coerce.boolean().optional().default(false),
  notifyEmail: z.coerce.boolean().optional().default(false),
  notifyInApp: z.coerce.boolean().optional().default(false),
  urgentOnly: z.coerce.boolean().optional().default(false),
});

export const leadStatusSchema = z.object({
  leadId: z.string().min(1),
  status: z.enum(['NEW', 'QUALIFIED', 'NOTIFIED', 'CONTACTED', 'BOOKED', 'LOST']),
});

export const checkoutSchema = z.object({
  priceId: z.string().min(1),
});

export const buyNumberSchema = z.object({
  areaCode: z
    .string()
    .trim()
    .regex(/^\d{3}$/)
    .optional()
    .or(z.literal('')),
});

export const adminBusinessDraftSchema = z.object({
  name: z.string().min(2).max(120),
  ownerName: z.string().trim().max(120).optional().or(z.literal('')),
  ownerEmail: z.string().trim().email(),
  ownerPhone: z.string().max(30).optional().or(z.literal('')),
  areaCode: z
    .string()
    .trim()
    .regex(/^\d{3}$/)
    .optional()
    .or(z.literal('')),
  isTestBusiness: z.coerce.boolean().optional().default(false),
  forwardingNumber: z.string().min(7).max(30),
  timezone: z.string().min(2).max(100).default('America/New_York'),
  missedCallSeconds: z.coerce.number().int().min(5).max(90).default(20),
  serviceLabel1: z.string().min(1).max(40).default('Repair'),
  serviceLabel2: z.string().min(1).max(40).default('Install'),
  serviceLabel3: z.string().min(1).max(40).default('Maintenance'),
});

export const adminBusinessUpdateSchema = adminBusinessDraftSchema.extend({
  businessId: z.string().min(1),
  ownerClerkId: z.string().trim().optional().or(z.literal('')),
  internalNotes: z.string().trim().max(5_000).optional().or(z.literal('')),
  twilioAccountMode: twilioAccountModeSchema.default('BUSINESS_SUBACCOUNT'),
  twilioNumberSetupMode: twilioNumberSetupModeSchema.default('NEW_NUMBER'),
  twilioSubaccountSid: z.string().trim().max(64).optional().or(z.literal('')),
  twilioPhoneNumber: z.string().trim().max(30).optional().or(z.literal('')),
  twilioPhoneNumberSid: z.string().trim().max(64).optional().or(z.literal('')),
  twilioMessagingServiceSid: z.string().trim().max(64).optional().or(z.literal('')),
  a2pCustomerProfileSid: z.string().trim().max(64).optional().or(z.literal('')),
  a2pBrandSid: z.string().trim().max(64).optional().or(z.literal('')),
  a2pCampaignSid: z.string().trim().max(64).optional().or(z.literal('')),
  a2pFailureReason: z.string().trim().max(500).optional().or(z.literal('')),
  managedTwilioStatus: z
    .enum([
      'DRAFT',
      'PROVISIONING',
      'AWAITING_BUSINESS_VERIFICATION',
      'BRAND_SUBMITTED',
      'CAMPAIGN_SUBMITTED',
      'COMPLIANT_LIVE',
      'PAUSED_NONCOMPLIANT',
      'FAILED_REVIEW',
    ])
    .default('DRAFT'),
  confirmCriticalFieldClears: z.coerce.boolean().optional().default(false),
  notifySms: z.coerce.boolean().optional().default(false),
  notifyEmail: z.coerce.boolean().optional().default(false),
  notifyInApp: z.coerce.boolean().optional().default(false),
  urgentOnly: z.coerce.boolean().optional().default(false),
});

export const adminInviteOwnerSchema = z.object({
  businessId: z.string().min(1),
  ownerEmail: z.string().trim().email(),
  ownerName: z.string().trim().max(120).optional().or(z.literal('')),
});

export const adminConnectExistingOwnerSchema = z.object({
  businessId: z.string().min(1),
  ownerEmail: z.string().trim().email(),
  ownerName: z.string().trim().max(120).optional().or(z.literal('')),
  ownerClerkId: z.string().trim().optional().or(z.literal('')),
});

export const adminProvisionBusinessSchema = z
  .object({
    businessId: z.string().min(1),
    mode: z.enum(['NEW_NUMBER', 'EXISTING_NUMBER']),
    areaCode: z
      .string()
      .trim()
      .regex(/^\d{3}$/)
      .optional()
      .or(z.literal('')),
    existingNumberSid: z.string().trim().optional().or(z.literal('')),
    existingNumberSidSelect: z.string().trim().optional().or(z.literal('')),
    existingNumberSidManual: z.string().trim().optional().or(z.literal('')),
  })
  .superRefine((value, ctx) => {
    const resolvedExistingNumberSid =
      value.existingNumberSidSelect || value.existingNumberSidManual || value.existingNumberSid || '';

    if (value.mode === 'EXISTING_NUMBER' && !resolvedExistingNumberSid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['existingNumberSidSelect'],
        message: 'Choose an existing number before provisioning this business.',
      });
    }
  });

export const adminWebhookSyncSchema = z.object({
  businessId: z.string().min(1),
  target: z.enum(['VOICE', 'SMS', 'ALL']),
});

export const adminProvisioningStatusSchema = z.object({
  businessId: z.string().min(1),
  status: z.enum(['DRAFT', 'ONBOARDING', 'NEEDS_ATTENTION', 'LIVE', 'PAUSED']),
});

export const adminSendTestSmsSchema = z.object({
  businessId: z.string().min(1),
  destinationPhone: z.string().trim().min(7).max(30),
});

export const adminTwilioSetupSchema = z.object({
  businessId: z.string().min(1),
  twilioAccountMode: twilioAccountModeSchema.default('BUSINESS_SUBACCOUNT'),
  twilioNumberSetupMode: twilioNumberSetupModeSchema.default('NEW_NUMBER'),
  twilioSubaccountSid: z.string().trim().max(64).optional().or(z.literal('')),
  twilioPhoneNumber: z.string().trim().max(30).optional().or(z.literal('')),
  twilioPhoneNumberSid: z.string().trim().max(64).optional().or(z.literal('')),
  twilioMessagingServiceSid: z.string().trim().max(64).optional().or(z.literal('')),
  a2pCustomerProfileSid: z.string().trim().max(64).optional().or(z.literal('')),
  a2pBrandSid: z.string().trim().max(64).optional().or(z.literal('')),
  a2pCampaignSid: z.string().trim().max(64).optional().or(z.literal('')),
  a2pFailureReason: z.string().trim().max(500).optional().or(z.literal('')),
  managedTwilioStatus: z
    .enum([
      'DRAFT',
      'PROVISIONING',
      'AWAITING_BUSINESS_VERIFICATION',
      'BRAND_SUBMITTED',
      'CAMPAIGN_SUBMITTED',
      'COMPLIANT_LIVE',
      'PAUSED_NONCOMPLIANT',
      'FAILED_REVIEW',
    ])
    .default('DRAFT'),
  confirmCriticalFieldClears: z.coerce.boolean().optional().default(false),
});

export const adminArchiveBusinessSchema = z.object({
  businessId: z.string().min(1),
  confirmationName: z.string().trim().min(1),
  returnTo: z.string().trim().optional().or(z.literal('')),
});

export const adminDeleteBusinessSchema = z.object({
  businessId: z.string().min(1),
  confirmationName: z.string().trim().min(1),
  returnTo: z.string().trim().optional().or(z.literal('')),
});

export const adminBulkDeleteTestBusinessesSchema = z.object({
  confirmationText: z.string().trim().min(1),
});

export const businessTwilioAdminOverrideSchema = z.object({
  twilioAccountMode: twilioAccountModeSchema.default('BUSINESS_SUBACCOUNT'),
  twilioNumberSetupMode: twilioNumberSetupModeSchema.default('NEW_NUMBER'),
  twilioSubaccountSid: z.string().trim().max(64).optional().or(z.literal('')),
  twilioPhoneNumber: z.string().trim().max(30).optional().or(z.literal('')),
  twilioPhoneNumberSid: z.string().trim().max(64).optional().or(z.literal('')),
  twilioMessagingServiceSid: z.string().trim().max(64).optional().or(z.literal('')),
  a2pCustomerProfileSid: z.string().trim().max(64).optional().or(z.literal('')),
  a2pBrandSid: z.string().trim().max(64).optional().or(z.literal('')),
  a2pCampaignSid: z.string().trim().max(64).optional().or(z.literal('')),
  a2pFailureReason: z.string().trim().max(500).optional().or(z.literal('')),
  managedTwilioStatus: z
    .enum([
      'DRAFT',
      'PROVISIONING',
      'AWAITING_BUSINESS_VERIFICATION',
      'BRAND_SUBMITTED',
      'CAMPAIGN_SUBMITTED',
      'COMPLIANT_LIVE',
      'PAUSED_NONCOMPLIANT',
      'FAILED_REVIEW',
    ])
    .default('DRAFT'),
  ownerPhone: z.string().trim().max(30).optional().or(z.literal('')),
  confirmCriticalFieldClears: z.coerce.boolean().optional().default(false),
});

export const businessTwilioSetupChoiceSchema = z.object({
  twilioAccountMode: twilioAccountModeSchema.default('BUSINESS_SUBACCOUNT'),
  twilioNumberSetupMode: twilioNumberSetupModeSchema.default('NEW_NUMBER'),
});

export const businessTwilioTestSmsSchema = z.object({
  destinationPhone: z.string().trim().min(7).max(30),
});
