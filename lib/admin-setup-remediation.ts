import { MessagingComplianceType, TwilioAccountMode, type Business } from '@prisma/client';

import type { AdminOnboardingConfidence } from '@/lib/admin-dashboard';
import type { AdminGoLiveDecisionTruth, AdminMissedCallValidationTruth, AdminOperationalProof } from '@/lib/admin-operator-proof';
import type { AdminTestSmsTruth } from '@/lib/admin-operator-visibility';
import type { AdminOwnerState, TwilioWebhookSnapshot } from '@/lib/admin-provisioning-presenters';
import { formatDateTime } from '@/lib/lead-presenters';
import { getManagedTwilioStatusSummary } from '@/lib/managed-twilio-status';
import type { TwilioSetupFlow, TwilioSetupStep, TwilioSetupStepKey } from '@/lib/twilio-setup';

type SetupBusiness = Pick<
  Business,
  | 'name'
  | 'forwardingNumber'
  | 'notifyPhone'
  | 'twilioAccountMode'
  | 'twilioSubaccountSid'
  | 'twilioMessagingServiceSid'
  | 'twilioPrimaryPhoneNumber'
  | 'twilioPhoneNumber'
  | 'twilioPrimaryNumberSid'
  | 'twilioPhoneNumberSid'
  | 'twilioWebhookSyncedAt'
  | 'messagingComplianceType'
  | 'a2pCustomerProfileSid'
  | 'a2pBrandSid'
  | 'a2pCampaignSid'
  | 'a2pFailureReason'
  | 'managedTwilioStatus'
  | 'a2pApprovedAt'
  | 'tollFreeVerificationStatus'
  | 'tollFreeVerificationSid'
  | 'tollFreeVerificationNote'
>;

export type AdminSetupManualField = {
  key: string;
  label: string;
  placeholder: string;
  helpText: string;
};

export type AdminSetupPanel = {
  key: TwilioSetupStepKey;
  title: string;
  currentState: string;
  explanation: string;
  nextAction: string;
  instructions: string[];
  verification: string[];
  latestEvidence: string[];
  warnings: string[];
  manualFields: AdminSetupManualField[];
  automaticActionLabel: string | null;
  secondaryAutomaticActionLabel: string | null;
};

export type AdminNextStepGuide = {
  key: TwilioSetupStepKey;
  title: string;
  detail: string;
  ctaLabel: string;
};

function findStep(flow: TwilioSetupFlow, key: TwilioSetupStepKey): TwilioSetupStep {
  return flow.steps.find((step) => step.key === key)!;
}

function formatWebhookExpectation(snapshot: TwilioWebhookSnapshot | null, kind: 'voice' | 'sms' | 'status') {
  if (!snapshot) {
    return {
      current: 'Current Twilio URL could not be read yet.',
      expected: 'Open this page after the business number is mapped so CallbackCloser can compare the current webhook settings.',
    };
  }

  if (kind === 'voice') {
    return {
      current: snapshot.currentVoiceUrl || 'No current voice webhook URL read from Twilio.',
      expected: snapshot.expectedVoiceUrl,
    };
  }

  if (kind === 'sms') {
    return {
      current: snapshot.currentSmsUrl || 'No current SMS webhook URL read from Twilio.',
      expected: snapshot.expectedSmsUrl,
    };
  }

  return {
    current: snapshot.currentStatusUrl || 'No current status callback URL read from Twilio.',
    expected: snapshot.expectedStatusUrl,
  };
}

export function buildAdminSetupPanels(params: {
  business: SetupBusiness;
  setupFlow: TwilioSetupFlow;
  ownerState: AdminOwnerState;
  webhookSnapshot: TwilioWebhookSnapshot | null;
  testSmsTruth: AdminTestSmsTruth;
  onboardingConfidence: AdminOnboardingConfidence;
  missedCallValidation: AdminMissedCallValidationTruth;
  goLiveDecision: AdminGoLiveDecisionTruth;
  proofs: AdminOperationalProof[];
}) {
  const {
    business,
    setupFlow,
    ownerState,
    webhookSnapshot,
    testSmsTruth,
    onboardingConfidence,
    missedCallValidation,
    goLiveDecision,
    proofs,
  } = params;
  const usingSubaccount = business.twilioAccountMode === TwilioAccountMode.BUSINESS_SUBACCOUNT;
  const numberLabel = business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber || 'No business number is saved yet.';
  const numberSid = business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid || 'No number SID is saved yet.';
  const voiceWebhook = formatWebhookExpectation(webhookSnapshot, 'voice');
  const smsWebhook = formatWebhookExpectation(webhookSnapshot, 'sms');
  const statusWebhook = formatWebhookExpectation(webhookSnapshot, 'status');
  const messagingProof = proofs.find((proof) => proof.key === 'messaging_path');
  const webhookProof = proofs.find((proof) => proof.key === 'webhooks');

  const panels: AdminSetupPanel[] = [
    {
      key: 'owner_connected',
      title: 'Owner connected',
      currentState: ownerState.connected
        ? `Owner account is connected as ${ownerState.email || 'an attached CallbackCloser user'}.`
        : ownerState.email
          ? `Owner email is saved as ${ownerState.email}, but the owner account is not connected yet.`
          : 'No owner email is saved for this business yet.',
      explanation: 'The owner step controls who receives business access and operator follow-up. Without it, setup stalls and the next steps become guesswork.',
      nextAction: ownerState.connected
        ? 'Verify the linked owner is correct, then continue to the Twilio steps.'
        : 'Save the owner contact details, then either send an invite or connect an existing CallbackCloser account.',
      instructions: [
        'Confirm the owner email you want attached to this business.',
        'If the owner already has a CallbackCloser login, use Connect existing owner.',
        'If not, send an invite from this panel.',
        'Come back to this step after the owner appears as connected.',
      ],
      verification: [
        'The step should show Owner connected.',
        'The business should display the correct owner email and no pending invite blocker.',
      ],
      latestEvidence: ownerState.connected
        ? [ownerState.email ? `Connected owner: ${ownerState.email}` : 'A CallbackCloser owner account is linked.']
        : [],
      warnings: ownerState.connected ? [] : ['Without an attached owner, the business still lacks a trustworthy handoff path.'],
      manualFields: [
        {
          key: 'ownerEmail',
          label: 'Owner email',
          placeholder: 'owner@business.com',
          helpText: 'Use the real owner email that should own the workspace.',
        },
        {
          key: 'ownerPhone',
          label: 'Owner alert phone',
          placeholder: '+15551234567',
          helpText: 'This is the phone CallbackCloser uses for operator test SMS and owner alerts.',
        },
      ],
      automaticActionLabel: ownerState.connected ? null : ownerState.matchedUserId ? 'Connect existing owner' : 'Invite owner by email',
      secondaryAutomaticActionLabel: ownerState.connected ? null : 'Save owner contact info',
    },
    {
      key: 'account_mode',
      title: 'Twilio account mode',
      currentState: `This business is currently set to ${setupFlow.accountModeLabel}.`,
      explanation: 'Account mode controls whether CallbackCloser should work in the parent Twilio account or in a dedicated business subaccount. The rest of the setup flow depends on this choice.',
      nextAction: 'Choose the correct account mode before you create or paste Twilio IDs.',
      instructions: [
        'Pick Main account if this business should stay inside the parent Twilio account.',
        'Pick Business subaccount if this business should have its own dedicated Twilio workspace.',
        'Save the selection before creating or entering subaccount, Messaging Service, or number details.',
      ],
      verification: [
        `The step should show ${setupFlow.accountModeLabel}.`,
        usingSubaccount ? 'The next step should ask for a subaccount.' : 'The subaccount step should no longer block the flow.',
      ],
      latestEvidence: [`Current mode: ${setupFlow.accountModeLabel}.`],
      warnings: [],
      manualFields: [
        {
          key: 'twilioAccountMode',
          label: 'Twilio account mode',
          placeholder: 'MAIN_ACCOUNT or BUSINESS_SUBACCOUNT',
          helpText: 'This choice changes which later setup steps apply.',
        },
      ],
      automaticActionLabel: 'Save account mode',
      secondaryAutomaticActionLabel: null,
    },
    {
      key: 'number_path',
      title: 'Business number path',
      currentState: `This business is currently set to ${setupFlow.phoneSetupPathLabel}.`,
      explanation: 'This choice separates the public business number from the CallbackCloser routing number and determines whether forwarding verification or porting status becomes part of the launch gate.',
      nextAction: 'Choose the business number path before you work on number assignment.',
      instructions: [
        'Use current-number forwarding when the owner keeps the public number and forwards it into CallbackCloser.',
        'Use porting when the current number will move into Twilio later and the status needs manual tracking.',
        'Use new CallbackCloser number when the business wants a fresh Twilio number from the start.',
        'Save the choice before you move to number assignment.',
      ],
      verification: [
        `The step should show ${setupFlow.phoneSetupPathLabel}.`,
        'The number assignment panel should match the path you selected.',
      ],
      latestEvidence: [`Current business number path: ${setupFlow.phoneSetupPathLabel}.`],
      warnings: [],
      manualFields: [
        {
          key: 'phoneSetupPath',
          label: 'Business number path',
          placeholder: 'CURRENT_NUMBER_FORWARDING',
          helpText: 'Choose the path that matches how the business number will connect into CallbackCloser.',
        },
      ],
      automaticActionLabel: 'Save business number path',
      secondaryAutomaticActionLabel: null,
    },
    {
      key: 'account_ready',
      title: 'Subaccount ready',
      currentState: usingSubaccount
        ? business.twilioSubaccountSid
          ? `Business subaccount ${business.twilioSubaccountSid} is saved for this business.`
          : 'No business subaccount SID is saved for this business.'
        : 'Main account mode is active, so no business subaccount is required.',
      explanation: usingSubaccount
        ? 'Subaccount mode needs a real Twilio subaccount before CallbackCloser can create or connect business resources cleanly.'
        : 'This step is informational in main-account mode. The rest of the setup flow should use the parent account directly.',
      nextAction: usingSubaccount
        ? 'Create the subaccount automatically or paste an existing subaccount SID from Twilio.'
        : 'No action is required here in main-account mode.',
      instructions: usingSubaccount
        ? [
            'Go to Twilio Console and confirm whether this business already has a dedicated subaccount.',
            'If it does, copy the SID that begins with AC and paste it here.',
            'If it does not, use Create automatically from this panel.',
            'Save and then move to Messaging Service.',
          ]
        : ['Keep this business on main-account mode unless you intentionally want a dedicated Twilio subaccount.'],
      verification: usingSubaccount
        ? ['The step should show Subaccount ready.', 'A Twilio subaccount SID that begins with AC should be saved on the business.']
        : ['The step should stay non-blocking while main-account mode is selected.'],
      latestEvidence: business.twilioSubaccountSid ? [`Saved subaccount SID: ${business.twilioSubaccountSid}`] : [],
      warnings: usingSubaccount && !business.twilioSubaccountSid ? ['Subaccount mode still needs an AC SID before Twilio resources can be trusted.'] : [],
      manualFields: usingSubaccount
        ? [
            {
              key: 'twilioSubaccountSid',
              label: 'Business subaccount SID',
              placeholder: 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
              helpText: 'Paste the Twilio subaccount SID if you created or found it manually.',
            },
          ]
        : [],
      automaticActionLabel: usingSubaccount ? 'Create subaccount automatically' : null,
      secondaryAutomaticActionLabel: usingSubaccount ? 'Save subaccount SID' : null,
    },
    {
      key: 'messaging_service_ready',
      title: 'Messaging Service',
      currentState: business.twilioMessagingServiceSid
        ? `Messaging Service ${business.twilioMessagingServiceSid} is saved for this business.`
        : 'No Messaging Service SID is saved for this business.',
      explanation: 'CallbackCloser needs a Twilio Messaging Service before outbound SMS can run reliably and stay compliant.',
      nextAction: 'Create the Messaging Service automatically or paste an existing SID from Twilio.',
      instructions: [
        'Go to Twilio Console > Messaging > Services.',
        'Create or locate the Messaging Service that should send this business’s SMS.',
        'Copy the SID that begins with MG.',
        'Paste it here and save if you handled it manually.',
        'After saving, send a test SMS from the next step.',
      ],
      verification: ['The step should show Ready.', 'The saved Messaging Service SID should begin with MG.', 'A test SMS should accept or deliver after this is saved.'],
      latestEvidence: [
        business.twilioMessagingServiceSid ? `Saved Messaging Service SID: ${business.twilioMessagingServiceSid}` : 'No Messaging Service SID is saved yet.',
        ...(messagingProof?.evidenceSummary ? [messagingProof.evidenceSummary] : []),
      ],
      warnings:
        testSmsTruth.state === 'failed'
          ? ['The latest test SMS failed, so the messaging path is still not proven even if the MG SID is saved.']
          : [],
      manualFields: [
        {
          key: 'twilioMessagingServiceSid',
          label: 'Messaging Service SID',
          placeholder: 'MGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          helpText: 'Paste the existing Messaging Service SID if Twilio setup happened outside the app.',
        },
      ],
      automaticActionLabel: 'Create Messaging Service automatically',
      secondaryAutomaticActionLabel: 'Save Messaging Service SID',
    },
    {
      key: 'number_assigned',
      title: 'Number assignment',
      currentState: `${numberLabel} • ${numberSid}`,
      explanation: 'CallbackCloser needs a real business texting number and number SID before voice, SMS, and status callbacks can be checked truthfully.',
      nextAction:
        setupFlow.phoneSetupPath === 'PORT_EXISTING_NUMBER'
          ? 'Wait until the port completes, then save the number and SID manually once Twilio is actually live.'
          : 'Buy or assign a new number automatically, or save the number mapping manually if you handled it outside the app.',
      instructions: [
        'If CallbackCloser should buy a number, use the automatic provisioning action here.',
        'If the business is porting a number, do not fake it here. Save the mapping only after the port completes in Twilio.',
        'If you did the work manually in Twilio, save both the E.164 phone number and the number SID here.',
        'Then move to the webhook steps so CallbackCloser can verify routing.',
      ],
      verification: ['The step should show Ready.', 'A Twilio phone number and number SID should both be saved.', 'The webhook steps should be able to compare the assigned number against Twilio.'],
      latestEvidence: [`Current number: ${numberLabel}`, `Current number SID: ${numberSid}`],
      warnings: [],
      manualFields: [
        {
          key: 'twilioPhoneNumber',
          label: 'Twilio number',
          placeholder: '+15551234567',
          helpText: 'Save the business texting number in E.164 format.',
        },
        {
          key: 'twilioPhoneNumberSid',
          label: 'Twilio number SID',
          placeholder: 'PNXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          helpText: 'Save the exact incoming phone number SID from Twilio.',
        },
      ],
      automaticActionLabel: setupFlow.phoneSetupPath === 'PORT_EXISTING_NUMBER' ? null : 'Provision number automatically',
      secondaryAutomaticActionLabel: 'Save number mapping',
    },
    {
      key: 'forwarding_verified',
      title:
        setupFlow.phoneSetupPath === 'CURRENT_NUMBER_FORWARDING'
          ? 'Forwarding verification'
          : setupFlow.phoneSetupPath === 'PORT_EXISTING_NUMBER'
            ? 'Porting status'
            : 'Business number connection',
      currentState: findStep(setupFlow, 'forwarding_verified').detail,
      explanation:
        setupFlow.phoneSetupPath === 'CURRENT_NUMBER_FORWARDING'
          ? 'This step proves the customer’s existing public number really reaches the CallbackCloser routing number.'
          : setupFlow.phoneSetupPath === 'PORT_EXISTING_NUMBER'
            ? 'Porting is manual in this rollout, so the operator has to keep the real status current.'
            : 'A fresh CallbackCloser number only needs its routing assignment. No separate forwarding proof is required.',
      nextAction:
        setupFlow.phoneSetupPath === 'CURRENT_NUMBER_FORWARDING'
          ? 'Place a fresh test call through the forwarded number, or record a manual confirmation note if you validated it outside the app.'
          : setupFlow.phoneSetupPath === 'PORT_EXISTING_NUMBER'
            ? 'Update the porting status honestly and do not mark the business ready until the port completes.'
            : 'Keep this step green by ensuring the assigned routing number stays current.',
      instructions:
        setupFlow.phoneSetupPath === 'CURRENT_NUMBER_FORWARDING'
          ? [
              'Forward the public business number into the CallbackCloser routing number.',
              'Place a live test call through the forwarded number.',
              'Let CallbackCloser auto-verify the step, or record a manual operator note if you already confirmed it with the carrier.',
            ]
          : setupFlow.phoneSetupPath === 'PORT_EXISTING_NUMBER'
            ? [
                'Track the port with the carrier or Twilio outside CallbackCloser.',
                'Use this step to record whether the port is not started, in progress, completed, or blocked.',
                'Only save the Twilio routing number after the ported number is truly active.',
              ]
            : ['No extra action is required here once the new CallbackCloser number is assigned correctly.'],
      verification:
        setupFlow.phoneSetupPath === 'CURRENT_NUMBER_FORWARDING'
          ? ['The step should show Verified.', 'Recent activity should show the live call reaching the routing number or a manual verification note.']
          : setupFlow.phoneSetupPath === 'PORT_EXISTING_NUMBER'
            ? ['The step should show Completed only when the port is actually done.', 'Blocked or in-progress states should keep go-live honest.']
            : ['The step should stay non-blocking once the routing number is assigned.'],
      latestEvidence: [findStep(setupFlow, 'forwarding_verified').detail],
      warnings:
        setupFlow.phoneSetupPath === 'CURRENT_NUMBER_FORWARDING' && !findStep(setupFlow, 'forwarding_verified').complete
          ? ['Without forwarding proof, CallbackCloser may have the right Twilio setup but still miss real business calls.']
          : setupFlow.phoneSetupPath === 'PORT_EXISTING_NUMBER' && !findStep(setupFlow, 'forwarding_verified').complete
            ? ['Porting is not complete yet, so the business should not be treated as fully ready.']
            : [],
      manualFields:
        setupFlow.phoneSetupPath === 'CURRENT_NUMBER_FORWARDING'
          ? [
              {
                key: 'forwardingVerificationNote',
                label: 'Verification note',
                placeholder: 'Describe how you confirmed the forward.',
                helpText: 'Record the carrier check or live test evidence if you confirm this manually.',
              },
            ]
          : setupFlow.phoneSetupPath === 'PORT_EXISTING_NUMBER'
            ? [
                {
                  key: 'portingStatus',
                  label: 'Porting status',
                  placeholder: 'IN_PROGRESS',
                  helpText: 'Keep this aligned with the real carrier or Twilio status.',
                },
                {
                  key: 'portingNotes',
                  label: 'Porting notes',
                  placeholder: 'Record blockers or ETA.',
                  helpText: 'Use plain English so the next operator sees the real blocker immediately.',
                },
              ]
            : [],
      automaticActionLabel:
        setupFlow.phoneSetupPath === 'CURRENT_NUMBER_FORWARDING'
          ? 'Mark forwarding verified'
          : setupFlow.phoneSetupPath === 'PORT_EXISTING_NUMBER'
            ? 'Save porting status'
            : null,
      secondaryAutomaticActionLabel: null,
    },
    {
      key: 'voice_webhook_synced',
      title: 'Voice webhook',
      currentState: `Current voice webhook: ${voiceWebhook.current}`,
      explanation: 'Twilio must send inbound voice requests to the CallbackCloser voice webhook or missed-call detection breaks.',
      nextAction: 'Use automatic sync if possible. If you fix it in Twilio manually, compare the current value against the expected URL below.',
      instructions: [
        'Open the Twilio phone number configuration for this business.',
        `Set the Voice URL to: ${voiceWebhook.expected}`,
        'If CallbackCloser is pointing at the wrong number, correct the number mapping in the Number assignment step.',
        'After saving in Twilio, re-open this step or run sync again to verify.',
      ],
      verification: ['The step should show Synced.', 'The current Twilio voice webhook should match the expected CallbackCloser URL exactly.'],
      latestEvidence: [`Current Twilio value: ${voiceWebhook.current}`, `Expected CallbackCloser value: ${voiceWebhook.expected}`],
      warnings:
        webhookSnapshot?.error
          ? [webhookSnapshot.error]
          : webhookProof?.status === 'failed'
            ? ['The live Twilio webhook read still shows at least one mismatch.']
            : [],
      manualFields: [
        {
          key: 'twilioPhoneNumberSid',
          label: 'Twilio number SID',
          placeholder: 'PNXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          helpText: 'If webhook sync is checking the wrong number, fix the saved number SID here.',
        },
      ],
      automaticActionLabel: 'Re-sync voice webhook',
      secondaryAutomaticActionLabel: 'Update number SID',
    },
    {
      key: 'sms_webhook_synced',
      title: 'SMS webhook',
      currentState: `Current SMS webhook: ${smsWebhook.current}`,
      explanation: 'Twilio must send inbound SMS to CallbackCloser so replies land on the lead conversation instead of disappearing into Twilio.',
      nextAction: 'Use automatic sync if possible. If you fix it in Twilio manually, compare the value below and then re-check.',
      instructions: [
        'Open the Twilio phone number configuration for this business.',
        `Set the Messaging or SMS webhook URL to: ${smsWebhook.expected}`,
        'If the wrong number is saved locally, correct the number mapping first.',
        'Re-open this step or run sync again after the Twilio value is updated.',
      ],
      verification: ['The step should show Synced.', 'The current Twilio SMS webhook should match the expected CallbackCloser URL exactly.'],
      latestEvidence: [`Current Twilio value: ${smsWebhook.current}`, `Expected CallbackCloser value: ${smsWebhook.expected}`],
      warnings:
        webhookSnapshot?.error
          ? [webhookSnapshot.error]
          : webhookProof?.status === 'failed'
            ? ['The live Twilio webhook read still shows at least one mismatch.']
            : [],
      manualFields: [
        {
          key: 'twilioPhoneNumberSid',
          label: 'Twilio number SID',
          placeholder: 'PNXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          helpText: 'If webhook sync is checking the wrong number, fix the saved number SID here.',
        },
      ],
      automaticActionLabel: 'Re-sync SMS webhook',
      secondaryAutomaticActionLabel: 'Update number SID',
    },
    {
      key: 'status_callback_synced',
      title: 'Status callback',
      currentState: `Current status callback: ${statusWebhook.current}`,
      explanation: 'CallbackCloser needs the Twilio status callback so test SMS and outbound delivery states become truthful instead of stopping at accepted by Twilio.',
      nextAction: 'Use automatic sync if possible. If you fix it in Twilio manually, compare the exact URL below and then re-check.',
      instructions: [
        'Open the Twilio phone number configuration for this business.',
        `Set the status callback URL to: ${statusWebhook.expected}`,
        'If the number mapping is wrong, update the saved number data before re-checking.',
        'After saving in Twilio, reload this step or run sync again.',
      ],
      verification: ['The step should show Synced.', 'The Twilio status callback should match the expected CallbackCloser URL exactly.'],
      latestEvidence: [`Current Twilio value: ${statusWebhook.current}`, `Expected CallbackCloser value: ${statusWebhook.expected}`],
      warnings:
        webhookSnapshot?.error
          ? [webhookSnapshot.error]
          : webhookProof?.status === 'failed'
            ? ['The live Twilio webhook read still shows at least one mismatch.']
            : [],
      manualFields: [
        {
          key: 'twilioPhoneNumberSid',
          label: 'Twilio number SID',
          placeholder: 'PNXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          helpText: 'If CallbackCloser is checking the wrong Twilio number, save the correct number SID first.',
        },
      ],
      automaticActionLabel: 'Re-sync status callback',
      secondaryAutomaticActionLabel: 'Update number SID',
    },
    {
      key: 'a2p_status_recorded',
      title: 'Messaging compliance',
      currentState: (() => {
        const managedSummary = getManagedTwilioStatusSummary(business);

        if (managedSummary.complianceTypeUnknown) {
          return 'Number type has not been selected yet.';
        }

        if (managedSummary.complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION) {
          return business.tollFreeVerificationNote
            ? `Current note: ${business.tollFreeVerificationNote}`
            : business.tollFreeVerificationSid
              ? `Current toll-free verification state: ${business.tollFreeVerificationStatus}`
              : 'No toll-free verification details are saved yet.';
        }

        return business.a2pFailureReason
          ? `Current note: ${business.a2pFailureReason}`
          : business.a2pCampaignSid || business.a2pBrandSid || business.a2pCustomerProfileSid
            ? `Current saved A2P state: ${business.managedTwilioStatus}`
            : 'No A2P readiness details are saved yet.';
      })(),
      explanation: 'This step records the Twilio messaging compliance path this business is actually using. It is the source of truth for whether launch can proceed.',
      nextAction:
        business.messagingComplianceType === MessagingComplianceType.UNKNOWN
          ? 'Choose the number type first, then record the actual messaging compliance state.'
          : business.messagingComplianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION
          ? 'Record the actual toll-free verification state and any known verification SID or blocker note.'
          : 'Record the actual messaging compliance state and any known Twilio identifiers or blocker note.',
      instructions:
        business.messagingComplianceType === MessagingComplianceType.UNKNOWN
          ? [
              'Choose whether this business uses a local 10DLC/A2P number or a toll-free number.',
              'Once the number type is selected, save the compliance state that matches reality.',
              'Record any known verification SID, A2P identifiers, or blocker note so the next operator has context.',
            ]
          : business.messagingComplianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION
          ? [
              'Confirm that this business is using a toll-free number.',
              'Save the toll-free verification state that matches reality.',
              'If Twilio already issued a verification SID, paste it here.',
              'If the business is blocked, record the blocker in plain English so the next operator does not have to guess.',
            ]
          : [
              'Check Twilio or your rollout notes for the current A2P/compliance state.',
              'Save the readiness status that best matches reality.',
              'If Twilio already gave you a customer profile, brand, or campaign SID, paste it here.',
              'If the business is blocked, record the blocker in plain English so the next operator does not have to guess.',
            ],
      verification:
        business.messagingComplianceType === MessagingComplianceType.UNKNOWN
          ? ['The number type should be selected before launch readiness is evaluated.']
          : business.messagingComplianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION
          ? [
              'The saved status should match the real Twilio toll-free verification state.',
              'If verified, the step should show Verified.',
              'If blocked, the blocker note should explain why.',
            ]
          : ['The saved status should match the real Twilio state.', 'If approved, the step should show Approved.', 'If blocked, the blocker note should explain why.'],
      latestEvidence:
        business.messagingComplianceType === MessagingComplianceType.UNKNOWN
          ? ['No number type is selected yet.']
          : business.messagingComplianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION
          ? [
              business.tollFreeVerificationSid ? `Verification SID: ${business.tollFreeVerificationSid}` : 'No toll-free verification SID saved.',
              business.tollFreeVerificationNote ? `Blocker note: ${business.tollFreeVerificationNote}` : 'No toll-free blocker note saved.',
            ]
          : [
              business.a2pCustomerProfileSid ? `Customer profile SID: ${business.a2pCustomerProfileSid}` : 'No customer profile SID saved.',
              business.a2pBrandSid ? `Brand SID: ${business.a2pBrandSid}` : 'No brand SID saved.',
              business.a2pCampaignSid ? `Campaign SID: ${business.a2pCampaignSid}` : 'No campaign SID saved.',
            ],
      warnings:
        business.messagingComplianceType === MessagingComplianceType.UNKNOWN
          ? []
          : business.messagingComplianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION
          ? business.tollFreeVerificationNote
            ? [business.tollFreeVerificationNote]
            : []
          : business.a2pFailureReason
            ? [business.a2pFailureReason]
            : [],
      manualFields:
        business.messagingComplianceType === MessagingComplianceType.UNKNOWN
          ? [
              {
                key: 'messagingComplianceType',
                label: 'Number type',
                placeholder: 'UNKNOWN',
                helpText: 'Choose the path that matches the actual texting number before evaluating readiness.',
              },
            ]
          : business.messagingComplianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION
          ? [
              {
                key: 'messagingComplianceType',
                label: 'Number type',
                placeholder: 'TOLL_FREE_VERIFICATION',
                helpText: 'Choose the path that matches the actual texting number.',
              },
              {
                key: 'tollFreeVerificationStatus',
                label: 'Toll-free verification status',
                placeholder: 'APPROVED',
                helpText: 'Choose the state that matches the actual Twilio verification readiness.',
              },
              {
                key: 'tollFreeVerificationSid',
                label: 'Toll-free verification SID',
                placeholder: 'Verification SID',
                helpText: 'Optional if Twilio already issued one.',
              },
              {
                key: 'tollFreeVerificationNote',
                label: 'Blocker note',
                placeholder: 'Record why launch is pending or blocked.',
                helpText: 'Use plain English so the next step is obvious.',
              },
            ]
          : [
              {
                key: 'messagingComplianceType',
                label: 'Number type',
                placeholder: 'LOCAL_A2P',
                helpText: 'Choose the path that matches the actual texting number.',
              },
              {
                key: 'managedTwilioStatus',
                label: 'Managed Twilio status',
                placeholder: 'COMPLIANT_LIVE',
                helpText: 'Choose the state that matches the actual Twilio readiness.',
              },
              {
                key: 'a2pCustomerProfileSid',
                label: 'A2P customer profile SID',
                placeholder: 'BUXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
                helpText: 'Optional if Twilio already issued one.',
              },
              {
                key: 'a2pBrandSid',
                label: 'A2P brand SID',
                placeholder: 'BNXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
                helpText: 'Optional if Twilio already issued one.',
              },
              {
                key: 'a2pCampaignSid',
                label: 'A2P campaign SID',
                placeholder: 'QEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
                helpText: 'Optional if Twilio already issued one.',
              },
              {
                key: 'a2pFailureReason',
                label: 'Blocker note',
                placeholder: 'Record why launch is pending or blocked.',
                helpText: 'Use plain English so the next step is obvious.',
              },
            ],
      automaticActionLabel:
        business.messagingComplianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION
          ? 'Save toll-free verification status'
          : business.messagingComplianceType === MessagingComplianceType.LOCAL_A2P
            ? 'Save A2P status'
            : 'Save messaging compliance status',
      secondaryAutomaticActionLabel: null,
    },
    {
      key: 'test_sms_delivered',
      title: 'Test SMS',
      currentState: testSmsTruth.lastAttemptAt
        ? `${testSmsTruth.label} • last attempt ${formatDateTime(testSmsTruth.lastAttemptAt)}`
        : 'No test SMS attempt has been recorded yet.',
      explanation: 'This step proves whether the business can actually send a text all the way through delivery, not just whether Twilio accepted the request.',
      nextAction:
        testSmsTruth.state === 'failed'
          ? 'Review the failure, then retry the test SMS after fixing the setup step that caused it.'
          : 'Send or retry a test SMS from this panel until delivery is confirmed.',
      instructions: [
        'Enter the phone number that should receive the business test SMS.',
        'Send the test from this panel.',
        'If Twilio accepts but delivery stays pending, inspect recent activity for the final delivery event.',
        'If the test fails, use the related setup steps and recent activity to correct the blocking issue.',
      ],
      verification: ['This step should show Delivered.', 'Recent activity should contain the final test SMS delivery event.', 'You should avoid marking the business live until delivery is confirmed.'],
      latestEvidence: [
        testSmsTruth.lastAttemptAt ? `Last attempt: ${formatDateTime(testSmsTruth.lastAttemptAt)}` : 'No test SMS attempt recorded yet.',
        `Latest result: ${testSmsTruth.summary}.`,
        ...(testSmsTruth.reason ? [`Known reason: ${testSmsTruth.reason}.`] : []),
      ],
      warnings:
        testSmsTruth.state === 'failed'
          ? ['Do not treat messaging as proven until the business line delivers a test SMS cleanly.']
          : testSmsTruth.state === 'pending'
            ? ['Twilio accepted the request, but delivery is still unproven.']
            : testSmsTruth.state === 'not_run'
              ? ['This business still lacks direct test-delivery proof.']
              : [],
      manualFields: [
        {
          key: 'destinationPhone',
          label: 'Test SMS destination',
          placeholder: '+15551234567',
          helpText: 'Use the phone that should actually receive the test message.',
        },
      ],
      automaticActionLabel: testSmsTruth.state === 'not_run' ? 'Send test SMS' : 'Retry test SMS',
      secondaryAutomaticActionLabel: 'Open recent activity',
    },
    {
      key: 'missed_call_validated',
      title: 'Missed-call flow validation',
      currentState:
        missedCallValidation.verifiedAt
          ? `${missedCallValidation.label} • latest proof ${formatDateTime(missedCallValidation.verifiedAt)}`
          : missedCallValidation.summary,
      explanation: 'This is the end-to-end proof that inbound call, missed-call detection, lead creation, outbound SMS, and owner visibility all still work in order.',
      nextAction: missedCallValidation.countsAsLaunchProof
        ? 'Use this proof to support the final go-live decision, or record a fresher note if you re-tested the flow manually.'
        : 'Run a real missed call and use the customer workspace plus timeline to confirm the flow end to end.',
      instructions: [
        'Confirm the forwarding number and owner alert phone are correct.',
        'Place a real missed call to the business number.',
        'Check the customer call-flow or leads view to confirm the lead was created.',
        'Use recent activity to confirm the event order: inbound call, missed call, lead, SMS, and owner alert.',
        'If you validated the flow outside the app, record a short manual confirmation note so the proof stays visible here.',
      ],
      verification: ['The timeline should show the full missed-call sequence in order.', 'The customer workspace should show the lead and owner visibility outcome.', 'This step should only count as complete once recent evidence or a manual note exists.'],
      latestEvidence: [
        missedCallValidation.verifiedAt ? `Latest proof timestamp: ${formatDateTime(missedCallValidation.verifiedAt)}` : 'No missed-call proof timestamp recorded yet.',
        missedCallValidation.summary,
        ...(missedCallValidation.evidenceSummary ? [missedCallValidation.evidenceSummary] : []),
      ],
      warnings: missedCallValidation.countsAsLaunchProof ? [] : ['Without explicit missed-call proof, the founder still has to guess whether the recovery flow actually works.'],
      manualFields: [
        {
          key: 'forwardingNumber',
          label: 'Forwarding number',
          placeholder: '+15551234567',
          helpText: 'Save the live forwarding number before you run the missed-call test.',
        },
        {
          key: 'ownerPhone',
          label: 'Owner alert phone',
          placeholder: '+15551234567',
          helpText: 'Save the phone that should receive owner alerts during validation.',
        },
      ],
      automaticActionLabel: 'Open customer call flow',
      secondaryAutomaticActionLabel: 'Open customer workspace',
    },
    {
      key: 'safe_to_mark_live',
      title: 'Safe to mark live',
      currentState: findStep(setupFlow, 'safe_to_mark_live').detail,
      explanation: 'This is the final operator gate. It should only clear once the business has real setup proof, not just saved labels.',
      nextAction: findStep(setupFlow, 'safe_to_mark_live').complete
        ? 'Review the proof list and mark the business live when you are ready.'
        : 'Clear the remaining setup blockers before marking the business live, or record an explicit warning note if you must launch anyway.',
      instructions: [
        'Review the remaining blocked steps and proof list above.',
        'Do not mark the business live until each blocking step is complete unless you are intentionally accepting the warning state.',
        'If you must launch with known gaps, record a short note explaining what is still missing and why you are proceeding.',
        'If the business should stop running, pause automation here instead of leaving the state ambiguous.',
      ],
      verification: ['The launch gate should say Ready before you mark live, unless the operator explicitly acknowledges a warning state.', 'The business should only be treated as fully live after test SMS and missed-call validation are complete.'],
      latestEvidence: [
        goLiveDecision.decidedAt ? `Latest go-live decision: ${formatDateTime(goLiveDecision.decidedAt)}` : 'No explicit go-live decision has been recorded yet.',
        goLiveDecision.summary,
        ...(goLiveDecision.note ? [goLiveDecision.note] : []),
      ],
      warnings:
        onboardingConfidence.blockers.length > 0
          ? onboardingConfidence.blockers.map((blocker) => blocker.message)
          : goLiveDecision.state === 'marked_live_with_warnings'
            ? [goLiveDecision.detail]
            : [],
      manualFields: [],
      automaticActionLabel: 'Mark business live',
      secondaryAutomaticActionLabel: 'Pause automation',
    },
  ];

  return panels;
}

export function buildAdminNextStepGuide(params: {
  setupFlow: TwilioSetupFlow;
  lastIssueStepKey: TwilioSetupStepKey | null;
  panels: AdminSetupPanel[];
}) {
  const key = params.lastIssueStepKey || params.setupFlow.banner.stepKey;
  const panel = params.panels.find((candidate) => candidate.key === key) || params.panels[0];

  return {
    key: panel.key,
    title: panel.title,
    detail: panel.nextAction,
    ctaLabel: 'Open setup step',
  } satisfies AdminNextStepGuide;
}
