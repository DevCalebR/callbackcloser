import {
  BusinessPhoneSetupPath,
  ForwardingVerificationStatus,
  PortingStatus,
  TwilioNumberSetupMode,
  type Business,
} from '@prisma/client';

import { formatPhoneForDisplay } from '@/lib/phone';

type PhoneSetupBusiness = Pick<
  Business,
  | 'forwardingNumber'
  | 'twilioPrimaryPhoneNumber'
  | 'twilioPhoneNumber'
  | 'twilioPrimaryNumberSid'
  | 'twilioPhoneNumberSid'
> &
  Partial<
    Pick<
      Business,
      | 'phoneSetupPath'
      | 'publicBusinessPhone'
      | 'forwardingVerificationStatus'
      | 'forwardingVerifiedAt'
      | 'forwardingVerificationNote'
      | 'portingStatus'
      | 'portingNotes'
      | 'portingCompletedAt'
    >
  >;

export type BusinessPhoneSetupTone = 'success' | 'pending' | 'attention';

export type BusinessPhoneSetupGate = {
  path: BusinessPhoneSetupPath;
  label: string;
  description: string;
  complete: boolean;
  tone: BusinessPhoneSetupTone;
  stateLabel: string;
  detail: string;
  blocker: string | null;
};

export const businessPhoneSetupPathOptions = [
  {
    value: BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING,
    label: 'Keep current number and forward calls to CallbackCloser',
    description:
      'Customers keep calling your current public business number. Forward that line to your CallbackCloser routing number for live handling, missed-call detection, and SMS recovery.',
  },
  {
    value: BusinessPhoneSetupPath.PORT_EXISTING_NUMBER,
    label: 'Port current number to CallbackCloser/Twilio',
    description:
      'Keep the current business number, but move it onto CallbackCloser and Twilio. Porting is tracked manually for now so launch status stays honest.',
  },
  {
    value: BusinessPhoneSetupPath.NEW_TWILIO_NUMBER,
    label: 'Use a new CallbackCloser number',
    description:
      'Provision a new Twilio number that CallbackCloser controls directly for the live call and SMS flow.',
  },
] as const;

export function getBusinessPhoneSetupPath(path: BusinessPhoneSetupPath | null | undefined) {
  return path || BusinessPhoneSetupPath.NEW_TWILIO_NUMBER;
}

export function getBusinessPhoneSetupPathLabel(path: BusinessPhoneSetupPath | null | undefined) {
  const resolved = getBusinessPhoneSetupPath(path);
  return businessPhoneSetupPathOptions.find((option) => option.value === resolved)?.label || businessPhoneSetupPathOptions[2].label;
}

export function getBusinessPhoneSetupPathDescription(path: BusinessPhoneSetupPath | null | undefined) {
  const resolved = getBusinessPhoneSetupPath(path);
  return businessPhoneSetupPathOptions.find((option) => option.value === resolved)?.description || businessPhoneSetupPathOptions[2].description;
}

export function deriveTwilioNumberSetupModeFromPhoneSetupPath(path: BusinessPhoneSetupPath | null | undefined) {
  const resolved = getBusinessPhoneSetupPath(path);
  return resolved === BusinessPhoneSetupPath.PORT_EXISTING_NUMBER
    ? TwilioNumberSetupMode.EXISTING_NUMBER
    : TwilioNumberSetupMode.NEW_NUMBER;
}

export function shouldRequirePublicBusinessPhone(path: BusinessPhoneSetupPath | null | undefined) {
  const resolved = getBusinessPhoneSetupPath(path);
  return resolved === BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING || resolved === BusinessPhoneSetupPath.PORT_EXISTING_NUMBER;
}

export function getBusinessRoutingNumber(
  business: Pick<Business, 'twilioPrimaryPhoneNumber' | 'twilioPhoneNumber'>
) {
  return business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber || null;
}

export function hasBusinessRoutingNumberAssigned(
  business: Pick<Business, 'twilioPrimaryPhoneNumber' | 'twilioPhoneNumber' | 'twilioPrimaryNumberSid' | 'twilioPhoneNumberSid'>
) {
  return Boolean(getBusinessRoutingNumber(business) && (business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid));
}

export function getPublicBusinessPhone(
  business: Pick<Business, 'twilioPrimaryPhoneNumber' | 'twilioPhoneNumber'> &
    Partial<Pick<Business, 'publicBusinessPhone' | 'phoneSetupPath'>>
) {
  if (business.publicBusinessPhone) return business.publicBusinessPhone;

  const path = getBusinessPhoneSetupPath(business.phoneSetupPath);
  if (path === BusinessPhoneSetupPath.NEW_TWILIO_NUMBER) {
    return getBusinessRoutingNumber(business);
  }

  return null;
}

function formatPhoneFallback(value: string | null | undefined, fallback: string) {
  return value ? formatPhoneForDisplay(value) : fallback;
}

export function getBusinessPhoneSetupGate(business: PhoneSetupBusiness): BusinessPhoneSetupGate {
  const path = getBusinessPhoneSetupPath(business.phoneSetupPath);
  const publicBusinessPhone = getPublicBusinessPhone(business);
  const routingNumber = getBusinessRoutingNumber(business);
  const routingAssigned = hasBusinessRoutingNumberAssigned(business);

  if (path === BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING) {
    if (!publicBusinessPhone) {
      return {
        path,
        label: getBusinessPhoneSetupPathLabel(path),
        description: getBusinessPhoneSetupPathDescription(path),
        complete: false,
        tone: 'pending',
        stateLabel: 'Public number needed',
        detail: 'Save the current business number customers call today before you verify forwarding.',
        blocker: 'save the public business number',
      };
    }

    if (!routingAssigned) {
      return {
        path,
        label: getBusinessPhoneSetupPathLabel(path),
        description: getBusinessPhoneSetupPathDescription(path),
        complete: false,
        tone: 'pending',
        stateLabel: 'Routing number needed',
        detail: `Assign a CallbackCloser routing number so ${formatPhoneForDisplay(publicBusinessPhone)} can forward into the app.`,
        blocker: 'assign the CallbackCloser routing number',
      };
    }

    const routingLabel = formatPhoneFallback(routingNumber, 'the saved routing number');
    if (business.forwardingVerificationStatus === ForwardingVerificationStatus.VERIFIED) {
      return {
        path,
        label: getBusinessPhoneSetupPathLabel(path),
        description: getBusinessPhoneSetupPathDescription(path),
        complete: true,
        tone: 'success',
        stateLabel: 'Verified',
        detail:
          business.forwardingVerificationNote?.trim() ||
          `${formatPhoneForDisplay(publicBusinessPhone)} has been verified as forwarding to ${routingLabel}.`,
        blocker: null,
      };
    }

    return {
      path,
      label: getBusinessPhoneSetupPathLabel(path),
      description: getBusinessPhoneSetupPathDescription(path),
      complete: false,
      tone: 'pending',
      stateLabel:
        business.forwardingVerificationStatus === ForwardingVerificationStatus.PENDING ? 'Waiting on verification' : 'Still needed',
      detail: `Forward ${formatPhoneForDisplay(publicBusinessPhone)} to ${routingLabel}, then place a test call or let an operator confirm it manually.`,
      blocker: 'verify call forwarding into CallbackCloser',
    };
  }

  if (path === BusinessPhoneSetupPath.PORT_EXISTING_NUMBER) {
    if (!publicBusinessPhone) {
      return {
        path,
        label: getBusinessPhoneSetupPathLabel(path),
        description: getBusinessPhoneSetupPathDescription(path),
        complete: false,
        tone: 'pending',
        stateLabel: 'Public number needed',
        detail: 'Save the current business number before you track the porting workflow.',
        blocker: 'save the public business number',
      };
    }

    if (business.portingStatus === PortingStatus.COMPLETED && routingAssigned) {
      return {
        path,
        label: getBusinessPhoneSetupPathLabel(path),
        description: getBusinessPhoneSetupPathDescription(path),
        complete: true,
        tone: 'success',
        stateLabel: 'Completed',
        detail:
          business.portingNotes?.trim() ||
          `${formatPhoneForDisplay(publicBusinessPhone)} is recorded as fully ported into CallbackCloser.`,
        blocker: null,
      };
    }

    if (business.portingStatus === PortingStatus.BLOCKED) {
      return {
        path,
        label: getBusinessPhoneSetupPathLabel(path),
        description: getBusinessPhoneSetupPathDescription(path),
        complete: false,
        tone: 'attention',
        stateLabel: 'Blocked',
        detail: business.portingNotes?.trim() || 'Porting is blocked and needs operator attention before go-live.',
        blocker: 'clear the porting blocker',
      };
    }

    if (business.portingStatus === PortingStatus.COMPLETED && !routingAssigned) {
      return {
        path,
        label: getBusinessPhoneSetupPathLabel(path),
        description: getBusinessPhoneSetupPathDescription(path),
        complete: false,
        tone: 'pending',
        stateLabel: 'Map the ported number',
        detail: 'Porting is recorded as complete, but the Twilio routing number mapping still needs to be saved.',
        blocker: 'save the ported Twilio routing number',
      };
    }

    return {
      path,
      label: getBusinessPhoneSetupPathLabel(path),
      description: getBusinessPhoneSetupPathDescription(path),
      complete: false,
      tone: 'pending',
      stateLabel: business.portingStatus === PortingStatus.IN_PROGRESS ? 'In progress' : 'Still needed',
      detail:
        business.portingNotes?.trim() ||
        `Track the port for ${formatPhoneForDisplay(publicBusinessPhone)} manually until the number is active inside CallbackCloser.`,
      blocker: 'complete the number port',
    };
  }

  return {
    path,
    label: getBusinessPhoneSetupPathLabel(path),
    description: getBusinessPhoneSetupPathDescription(path),
    complete: routingAssigned,
    tone: routingAssigned ? 'success' : 'pending',
    stateLabel: routingAssigned ? 'Assigned' : 'Still needed',
    detail: routingAssigned
      ? `${formatPhoneFallback(routingNumber, 'The routing number')} is assigned as the CallbackCloser number for this business.`
      : 'Provision a new CallbackCloser routing number before you go live.',
    blocker: routingAssigned ? null : 'assign the CallbackCloser routing number',
  };
}
