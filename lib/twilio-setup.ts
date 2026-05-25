import {
  BusinessPhoneSetupPath,
  BusinessProvisioningStatus,
  ManagedTwilioStatus,
  MessagingComplianceType,
  TwilioAccountMode,
  TwilioNumberSetupMode,
  type Business,
  type BusinessNotificationSettings,
} from '@prisma/client';

import type { TwilioWebhookSnapshot } from '@/lib/admin-provisioning-presenters';
import {
  businessPhoneSetupPathOptions,
  getBusinessPhoneSetupGate,
  getBusinessPhoneSetupPathDescription,
  getBusinessPhoneSetupPathLabel,
  getBusinessRoutingNumber,
} from '@/lib/business-phone-setup';
import { getManagedTextingNumber, getManagedTwilioStatusSummary } from '@/lib/managed-twilio-status';
import { formatPhoneForDisplay } from '@/lib/phone';

type SetupBusiness = Pick<
  Business,
  | 'name'
  | 'notifyPhone'
  | 'forwardingNumber'
  | 'provisioningStatus'
  | 'twilioAccountMode'
  | 'twilioNumberSetupMode'
  | 'twilioSubaccountSid'
  | 'twilioMessagingServiceSid'
  | 'twilioPrimaryNumberSid'
  | 'twilioPhoneNumberSid'
  | 'twilioPrimaryPhoneNumber'
  | 'twilioPhoneNumber'
  | 'twilioWebhookSyncedAt'
  | 'managedTwilioStatus'
  | 'messagingComplianceType'
  | 'a2pCustomerProfileSid'
  | 'a2pBrandSid'
  | 'a2pCampaignSid'
  | 'a2pFailureReason'
  | 'a2pApprovedAt'
  | 'tollFreeVerificationStatus'
  | 'tollFreeVerificationSid'
  | 'tollFreeVerificationNote'
> &
  Partial<
    Pick<
      Business,
      | 'publicBusinessPhone'
      | 'phoneSetupPath'
      | 'forwardingVerificationStatus'
      | 'forwardingVerifiedAt'
      | 'forwardingVerificationNote'
      | 'portingStatus'
      | 'portingNotes'
      | 'portingCompletedAt'
    >
  >;

type SetupNotificationSettings = Pick<BusinessNotificationSettings, 'ownerPhone' | 'ownerEmail'> | null;

export type TwilioSetupStepKey =
  | 'owner_connected'
  | 'account_mode'
  | 'number_path'
  | 'account_ready'
  | 'messaging_service_ready'
  | 'number_assigned'
  | 'forwarding_verified'
  | 'voice_webhook_synced'
  | 'sms_webhook_synced'
  | 'status_callback_synced'
  | 'a2p_status_recorded'
  | 'test_sms_delivered'
  | 'missed_call_validated'
  | 'safe_to_mark_live';

export type TwilioSetupTone = 'success' | 'pending' | 'attention' | 'neutral';

export type TwilioSetupStep = {
  key: TwilioSetupStepKey;
  label: string;
  complete: boolean;
  tone: TwilioSetupTone;
  stateLabel: string;
  detail: string;
};

export type TwilioSetupBanner = {
  title: string;
  detail: string;
  tone: TwilioSetupTone;
  stepKey: TwilioSetupStepKey;
};

export type TwilioSetupFlow = {
  accountMode: TwilioAccountMode;
  phoneSetupPath: BusinessPhoneSetupPath;
  numberSetupMode: TwilioNumberSetupMode;
  accountModeLabel: string;
  phoneSetupPathLabel: string;
  numberSetupModeLabel: string;
  accountModeDescription: string;
  phoneSetupPathDescription: string;
  numberSetupModeDescription: string;
  existingNumberMessage: string;
  safeToMarkLive: boolean;
  liveGateDetail: string;
  banner: TwilioSetupBanner;
  steps: TwilioSetupStep[];
};

export const twilioAccountModeOptions = [
  {
    value: TwilioAccountMode.MAIN_ACCOUNT,
    label: 'Main account',
    description:
      'Use the parent Twilio account directly for this business. CallbackCloser keeps the business mapped inside the main account instead of creating a dedicated subaccount.',
  },
  {
    value: TwilioAccountMode.BUSINESS_SUBACCOUNT,
    label: 'Business subaccount (recommended)',
    description:
      'Create or reuse a dedicated Twilio subaccount for this business. This matches the managed per-business provisioning direction and keeps Twilio setup scoped cleanly.',
  },
] as const;

export const businessPhonePathOptions = businessPhoneSetupPathOptions;

export const twilioNumberSetupModeOptions = [
  {
    value: TwilioNumberSetupMode.NEW_NUMBER,
    label: 'New business number',
    description: 'Provision a fresh Twilio number inside the selected account context and wire it into CallbackCloser.',
  },
  {
    value: TwilioNumberSetupMode.EXISTING_NUMBER,
    label: 'Existing number',
    description:
      'Keep the business on an existing Twilio number. This stays admin-assisted unless the number already lives in the selected account context.',
  },
] as const;

export function getTwilioAccountModeLabel(mode: TwilioAccountMode) {
  return twilioAccountModeOptions.find((option) => option.value === mode)?.label || 'Business subaccount (recommended)';
}

export function getTwilioAccountModeDescription(mode: TwilioAccountMode) {
  return twilioAccountModeOptions.find((option) => option.value === mode)?.description || twilioAccountModeOptions[1].description;
}

export function getTwilioNumberSetupModeLabel(mode: TwilioNumberSetupMode) {
  return twilioNumberSetupModeOptions.find((option) => option.value === mode)?.label || 'New business number';
}

export function getTwilioNumberSetupModeDescription(mode: TwilioNumberSetupMode) {
  return twilioNumberSetupModeOptions.find((option) => option.value === mode)?.description || twilioNumberSetupModeOptions[0].description;
}

export function usesBusinessSubaccount(mode: TwilioAccountMode) {
  return mode === TwilioAccountMode.BUSINESS_SUBACCOUNT;
}

function buildTone(complete: boolean, attention = false): TwilioSetupTone {
  if (complete) return 'success';
  if (attention) return 'attention';
  return 'pending';
}

function buildWebhookState(snapshot: TwilioWebhookSnapshot | null, type: 'voice' | 'sms' | 'status') {
  if (!snapshot) {
    return {
      synced: false,
      detail: 'Webhook status will appear after CallbackCloser can read the assigned number.',
      attention: false,
    };
  }

  if (snapshot.error) {
    return {
      synced: false,
      detail: snapshot.error,
      attention: true,
    };
  }

  if (type === 'voice') {
    return {
      synced: snapshot.voiceSynced,
      detail: snapshot.voiceSynced
        ? 'Voice webhook matches the current CallbackCloser URL.'
        : 'Voice webhook still needs to be synced to the current CallbackCloser URL.',
      attention: false,
    };
  }

  if (type === 'sms') {
    return {
      synced: snapshot.smsSynced,
      detail: snapshot.smsSynced
        ? 'SMS webhook matches the current CallbackCloser URL.'
        : 'SMS webhook still needs to be synced to the current CallbackCloser URL.',
      attention: false,
    };
  }

  return {
    synced: snapshot.statusSynced,
    detail: snapshot.statusSynced
      ? 'Status callback matches the current CallbackCloser URL.'
      : 'Status callback still needs to be synced to the current CallbackCloser URL.',
    attention: false,
  };
}

function formatMessagingComplianceDetail(business: SetupBusiness) {
  const managedSummary = getManagedTwilioStatusSummary(business);
  const complianceType = managedSummary.complianceType;

  if (managedSummary.complianceTypeUnknown) {
    return {
      complete: false,
      detail: 'Choose number type before messaging compliance can be evaluated.',
      stateLabel: 'Choose number type',
      tone: 'pending' as const,
    };
  }

  if (!managedSummary.complianceStarted) {
    return {
      complete: false,
      detail:
        complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION
          ? 'Record whether toll-free verification is not started, pending review, verified, or blocked so launch status stays truthful.'
          : 'Record whether A2P is not started, pending review, approved, or blocked so launch status stays truthful.',
      stateLabel: 'Needs update',
      tone: 'pending' as const,
    };
  }

  if (managedSummary.complianceReady) {
    return {
      complete: true,
      detail:
        complianceType === MessagingComplianceType.LOCAL_A2P && business.a2pApprovedAt
          ? `Recorded as approved on ${business.a2pApprovedAt.toLocaleDateString()}.`
          : complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION
            ? 'Recorded as verified for live messaging.'
            : 'Recorded as approved for live messaging.',
      stateLabel: complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION ? 'Verified' : 'Approved',
      tone: 'success' as const,
    };
  }

  if (managedSummary.attentionRequired) {
    return {
      complete: true,
      detail: managedSummary.description,
      stateLabel: 'Needs attention',
      tone: 'attention' as const,
    };
  }

  return {
    complete: true,
    detail: managedSummary.description,
    stateLabel: managedSummary.label,
    tone: 'pending' as const,
  };
}

export function buildTwilioSetupFlow(params: {
  business: SetupBusiness;
  notificationSettings: SetupNotificationSettings;
  ownerConnected: boolean;
  successfulLeadCount: number;
  testSmsState: 'not_started' | 'pending_delivery' | 'delivered' | 'failed';
  webhookSnapshot: TwilioWebhookSnapshot | null;
  missedCallValidation?: {
    complete: boolean;
    stateLabel: string;
    detail: string;
    tone: TwilioSetupTone;
  } | null;
}) {
  const { business, notificationSettings, ownerConnected, successfulLeadCount, testSmsState, webhookSnapshot, missedCallValidation } = params;
  const accountMode = business.twilioAccountMode || TwilioAccountMode.BUSINESS_SUBACCOUNT;
  const phoneSetupPath = business.phoneSetupPath || BusinessPhoneSetupPath.NEW_TWILIO_NUMBER;
  const numberSetupMode = business.twilioNumberSetupMode || TwilioNumberSetupMode.NEW_NUMBER;
  const managedSummary = getManagedTwilioStatusSummary(business);
  const assignedNumber = getManagedTextingNumber(business);
  const routingNumber = getBusinessRoutingNumber(business);
  const phoneSetupGate = getBusinessPhoneSetupGate(business);
  const ownerEmail = notificationSettings?.ownerEmail?.trim() || null;
  const ownerPhone = notificationSettings?.ownerPhone?.trim() || business.notifyPhone || null;
  const usingSubaccount = usesBusinessSubaccount(accountMode);
  const accountReady = usingSubaccount ? Boolean(business.twilioSubaccountSid) : true;
  const messagingServiceReady = Boolean(business.twilioMessagingServiceSid);
  const numberAssigned = Boolean(assignedNumber && (business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid));
  const voiceWebhook = buildWebhookState(webhookSnapshot, 'voice');
  const smsWebhook = buildWebhookState(webhookSnapshot, 'sms');
  const statusWebhook = buildWebhookState(webhookSnapshot, 'status');
  const messagingCompliance = formatMessagingComplianceDetail(business);
  const testSmsDelivered = testSmsState === 'delivered';
  const hasOwnerRouting = Boolean(ownerPhone || ownerEmail);
  const hasOwnerForwardingNumber = Boolean(business.forwardingNumber?.trim());
  const missedCallValidated = missedCallValidation?.complete ?? successfulLeadCount > 0;
  const existingNumberMessage =
    'Porting stays manual in this rollout. Record the porting status honestly, then save the Twilio routing number only after the number is active in CallbackCloser.';

  const liveBlockers: string[] = [];
  if (!ownerConnected) liveBlockers.push('connect the owner account');
  if (!accountReady) liveBlockers.push(usingSubaccount ? 'create or reconnect the business subaccount' : 'confirm the parent account mapping');
  if (!numberAssigned) liveBlockers.push('assign the business number');
  if (!messagingServiceReady) liveBlockers.push('finish the Messaging Service');
  if (!voiceWebhook.synced) liveBlockers.push('sync the voice webhook');
  if (!smsWebhook.synced) liveBlockers.push('sync the SMS webhook');
  if (!statusWebhook.synced) liveBlockers.push('sync the status callback');
  if (!managedSummary.complianceReady) {
    liveBlockers.push(
      managedSummary.complianceTypeUnknown
        ? 'choose the number type'
        : managedSummary.complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION
          ? 'clear toll-free verification'
          : 'clear A2P approval'
    );
  }
  if (!testSmsDelivered) liveBlockers.push('deliver a test SMS');
  if (!missedCallValidated) liveBlockers.push('validate the missed-call flow');
  if (!hasOwnerForwardingNumber) liveBlockers.push('save the owner answer number');
  if (!hasOwnerRouting) liveBlockers.push('save an owner alert destination');
  if (!phoneSetupGate.complete && phoneSetupGate.blocker) liveBlockers.push(phoneSetupGate.blocker);

  const safeToMarkLive = liveBlockers.length === 0;
  const liveWithWarnings = business.provisioningStatus === BusinessProvisioningStatus.LIVE && !safeToMarkLive;
  const liveGateDetail = safeToMarkLive
    ? business.provisioningStatus === BusinessProvisioningStatus.LIVE
      ? 'This business is already live and the current setup still clears the launch gate.'
      : 'This business clears the Twilio launch gate. It is safe to mark live.'
    : liveWithWarnings
      ? `This business is already live, but the current launch gate is not clear: ${liveBlockers.join(', ')}.`
      : `Before this business goes live, ${liveBlockers.join(', ')}.`;

  const steps: TwilioSetupStep[] = [
    {
      key: 'owner_connected',
      label: '1. Owner connected',
      complete: ownerConnected,
      tone: buildTone(ownerConnected, !ownerConnected),
      stateLabel: ownerConnected ? 'Done' : 'Needs action',
      detail: ownerConnected
        ? 'The owner account is connected to this business.'
        : ownerEmail
          ? 'The owner email is saved, but the owner account still needs to be connected.'
          : 'Save the owner email first, then connect or invite the owner.',
    },
    {
      key: 'account_mode',
      label: '2. Twilio account mode chosen',
      complete: true,
      tone: 'success',
      stateLabel: getTwilioAccountModeLabel(accountMode),
      detail: getTwilioAccountModeDescription(accountMode),
    },
    {
      key: 'number_path',
      label: '3. Business number path chosen',
      complete: true,
      tone: 'success',
      stateLabel: getBusinessPhoneSetupPathLabel(phoneSetupPath),
      detail: getBusinessPhoneSetupPathDescription(phoneSetupPath),
    },
    {
      key: 'account_ready',
      label: '4. Twilio account/subaccount ready',
      complete: accountReady,
      tone: buildTone(accountReady, usingSubaccount),
      stateLabel: accountReady
        ? usingSubaccount
          ? 'Subaccount ready'
          : 'Main account ready'
        : 'Needs action',
      detail: usingSubaccount
        ? business.twilioSubaccountSid
          ? `Business subaccount ${business.twilioSubaccountSid} is saved for this business.`
          : 'Create, select, or paste the business subaccount SID before continuing.'
        : 'This business uses the parent Twilio account directly. No business subaccount is required.',
    },
    {
      key: 'messaging_service_ready',
      label: '5. Messaging Service ready',
      complete: messagingServiceReady,
      tone: buildTone(messagingServiceReady),
      stateLabel: messagingServiceReady ? 'Ready' : 'Missing',
      detail: messagingServiceReady
        ? `Messaging Service ${business.twilioMessagingServiceSid} is saved for this business.`
        : 'Create or record the Messaging Service that should send business SMS.',
    },
    {
      key: 'number_assigned',
      label: '6. CallbackCloser routing number assigned',
      complete: numberAssigned,
      tone: buildTone(numberAssigned),
      stateLabel: numberAssigned ? 'Ready' : 'Missing',
      detail: numberAssigned
        ? `${formatPhoneForDisplay(assignedNumber)} is assigned as the CallbackCloser routing number for this business.`
        : phoneSetupPath === BusinessPhoneSetupPath.PORT_EXISTING_NUMBER
          ? existingNumberMessage
          : 'Provision a CallbackCloser routing number for this business.',
    },
    {
      key: 'forwarding_verified',
      label:
        phoneSetupPath === BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING
          ? '7. Forwarding verified'
          : phoneSetupPath === BusinessPhoneSetupPath.PORT_EXISTING_NUMBER
            ? '7. Porting completed'
            : '7. Business number connection ready',
      complete: phoneSetupGate.complete,
      tone: phoneSetupGate.tone,
      stateLabel: phoneSetupGate.stateLabel,
      detail: phoneSetupGate.detail,
    },
    {
      key: 'voice_webhook_synced',
      label: '8. Voice webhook synced',
      complete: voiceWebhook.synced,
      tone: buildTone(voiceWebhook.synced, voiceWebhook.attention),
      stateLabel: voiceWebhook.synced ? 'Synced' : 'Needs sync',
      detail: voiceWebhook.detail,
    },
    {
      key: 'sms_webhook_synced',
      label: '9. SMS webhook synced',
      complete: smsWebhook.synced,
      tone: buildTone(smsWebhook.synced, smsWebhook.attention),
      stateLabel: smsWebhook.synced ? 'Synced' : 'Needs sync',
      detail: smsWebhook.detail,
    },
    {
      key: 'status_callback_synced',
      label: '10. Status callback synced',
      complete: statusWebhook.synced,
      tone: buildTone(statusWebhook.synced, statusWebhook.attention),
      stateLabel: statusWebhook.synced ? 'Synced' : 'Needs sync',
      detail: statusWebhook.detail,
    },
    {
      key: 'a2p_status_recorded',
      label: '11. Messaging compliance status',
      complete: messagingCompliance.complete,
      tone: messagingCompliance.tone,
      stateLabel: messagingCompliance.stateLabel,
      detail: messagingCompliance.detail,
    },
    {
      key: 'test_sms_delivered',
      label: '12. Test SMS delivered',
      complete: testSmsDelivered,
      tone: buildTone(testSmsDelivered, testSmsState === 'failed'),
      stateLabel:
        testSmsState === 'delivered'
          ? 'Delivered'
          : testSmsState === 'pending_delivery'
            ? 'Waiting'
            : testSmsState === 'failed'
              ? 'Failed'
              : 'Not run',
      detail:
        testSmsState === 'delivered'
          ? 'A test SMS has been delivered from the current business setup.'
          : testSmsState === 'pending_delivery'
            ? 'The latest test SMS was accepted by Twilio, but delivery has not been confirmed yet.'
            : testSmsState === 'failed'
              ? 'The latest test SMS failed. Fix delivery before going live.'
              : 'Send a test SMS from the assigned business line before going live.',
    },
    {
      key: 'missed_call_validated',
      label: '13. Missed-call flow validated',
      complete: missedCallValidated,
      tone: missedCallValidation?.tone ?? buildTone(missedCallValidated),
      stateLabel: missedCallValidation?.stateLabel ?? (missedCallValidated ? 'Validated' : 'Still needed'),
      detail:
        missedCallValidation?.detail ??
        (missedCallValidated
          ? `${successfulLeadCount} missed-call test${successfulLeadCount === 1 ? '' : 's'} reached owner-notification visibility.`
          : !hasOwnerForwardingNumber
            ? 'Save the owner answer number first so the live call path is accurate before testing.'
            : !hasOwnerRouting
              ? 'Save an owner alert destination before the missed-call validation test.'
              : phoneSetupPath === BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING && !phoneSetupGate.complete
                ? `Verify that ${business.publicBusinessPhone ? formatPhoneForDisplay(business.publicBusinessPhone) : 'the public business number'} forwards into ${routingNumber ? formatPhoneForDisplay(routingNumber) : 'the CallbackCloser routing number'} before you rely on the missed-call test.`
                : phoneSetupPath === BusinessPhoneSetupPath.PORT_EXISTING_NUMBER && !phoneSetupGate.complete
                  ? 'Finish the porting workflow before you rely on a missed-call validation test.'
              : 'Run one real missed call and confirm the owner alert and lead handoff both land correctly.'),
    },
    {
      key: 'safe_to_mark_live',
      label: '14. Safe to mark live',
      complete: safeToMarkLive,
      tone: liveWithWarnings ? 'attention' : safeToMarkLive ? 'success' : 'pending',
      stateLabel:
        business.provisioningStatus === BusinessProvisioningStatus.LIVE
          ? safeToMarkLive
            ? 'Live'
            : 'Live with warnings'
          : safeToMarkLive
            ? 'Ready'
            : 'Blocked',
      detail: liveGateDetail,
    },
  ];

  const nextIncompleteStep = steps.find((step) => !step.complete);
  const banner: TwilioSetupBanner = nextIncompleteStep
    ? {
        title:
          nextIncompleteStep.key === 'account_mode'
            ? 'Choose how this business should use Twilio'
            : nextIncompleteStep.key === 'number_path'
              ? 'Choose how to connect the business number'
              : nextIncompleteStep.key === 'forwarding_verified'
                ? phoneSetupPath === BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING
                  ? 'Verify current-number forwarding next'
                  : phoneSetupPath === BusinessPhoneSetupPath.PORT_EXISTING_NUMBER
                    ? 'Track the porting status next'
                    : 'Finish assigning the live business number'
              : nextIncompleteStep.key === 'a2p_status_recorded' && managedSummary.complianceReady === false
                ? 'Keep messaging compliance accurate before launch'
                : nextIncompleteStep.key === 'test_sms_delivered'
                  ? 'Send the live test text next'
                  : nextIncompleteStep.key === 'missed_call_validated'
                    ? 'Run the missed-call validation next'
                    : 'Next setup step',
        detail: nextIncompleteStep.detail,
        tone: nextIncompleteStep.tone,
        stepKey: nextIncompleteStep.key,
      }
    : {
        title: business.provisioningStatus === BusinessProvisioningStatus.LIVE ? 'This business is live' : 'This business is safe to mark live',
        detail: liveGateDetail,
        tone: 'success',
        stepKey: 'safe_to_mark_live',
      };

  return {
    accountMode,
    phoneSetupPath,
    numberSetupMode,
    accountModeLabel: getTwilioAccountModeLabel(accountMode),
    phoneSetupPathLabel: getBusinessPhoneSetupPathLabel(phoneSetupPath),
    numberSetupModeLabel: getTwilioNumberSetupModeLabel(numberSetupMode),
    accountModeDescription: getTwilioAccountModeDescription(accountMode),
    phoneSetupPathDescription: getBusinessPhoneSetupPathDescription(phoneSetupPath),
    numberSetupModeDescription: getTwilioNumberSetupModeDescription(numberSetupMode),
    existingNumberMessage,
    safeToMarkLive,
    liveGateDetail,
    banner,
    steps,
  } satisfies TwilioSetupFlow;
}
