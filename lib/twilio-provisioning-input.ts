import type { Business } from '@prisma/client';

export function buildManagedProvisioningBusinessInput(
  business: Pick<
    Business,
    | 'id'
    | 'name'
    | 'twilioSubaccountSid'
    | 'twilioMessagingServiceSid'
    | 'twilioPrimaryNumberSid'
    | 'twilioPrimaryPhoneNumber'
    | 'twilioPhoneNumberSid'
    | 'twilioPhoneNumber'
  >,
  fallbackBusinessName: string
) {
  return {
    id: business.id,
    name: business.name || fallbackBusinessName,
    twilioSubaccountSid: business.twilioSubaccountSid,
    twilioMessagingServiceSid: business.twilioMessagingServiceSid,
    twilioPrimaryNumberSid: business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid,
    twilioPrimaryPhoneNumber: business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber,
  };
}
