'use server';

import { SubscriptionStatus } from '@prisma/client';
import { redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';
import { processLeadInboundReply, startMissedCallRecovery } from '@/lib/missed-call-flow';
import { createSimulatorPublicId, getSimulatorBusiness, getSimulatorRun, isPublicSimulatorEnabled, shouldSendRealSimulatorSms } from '@/lib/simulator';

function getSimulatorRedirect(publicId?: string | null, error?: string) {
  const params = new URLSearchParams();
  if (publicId) params.set('run', publicId);
  if (error) params.set('error', error);
  const query = params.toString();
  return query ? `/simulator?${query}` : '/simulator';
}

export async function startSimulatorRunAction(formData: FormData) {
  if (!isPublicSimulatorEnabled()) {
    redirect(getSimulatorRedirect(null, 'The public simulator is not enabled on this environment.'));
  }

  const business = await getSimulatorBusiness();
  if (!business) {
    redirect(getSimulatorRedirect(null, 'Simulator business is not configured yet.'));
  }

  const phoneRaw = typeof formData.get('phone') === 'string' ? String(formData.get('phone')) : '';
  const callerPhone = normalizePhoneNumber(phoneRaw) || phoneRaw.trim();
  if (!callerPhone) {
    redirect(getSimulatorRedirect(null, 'Enter a phone number to start the simulator.'));
  }

  const call = await db.call.create({
    data: {
      businessId: business.id,
      twilioCallSid: `SIMCALL_${createSimulatorPublicId()}`,
      fromPhone: callerPhone,
      fromPhoneNormalized: callerPhone,
      toPhone: business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber || '+10000000000',
      toPhoneNormalized: business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber || '+10000000000',
      status: 'SIMULATED_MISSED',
      missed: true,
      answered: false,
      dialCallStatus: 'no-answer',
      isSimulator: true,
      rawPayload: { source: 'public_simulator' },
    },
  });

  const { lead } = await startMissedCallRecovery({
    business,
    callerPhone,
    callId: call.id,
    isSimulator: true,
    transport: shouldSendRealSimulatorSms() ? 'twilio' : 'simulated',
    forceAutomation: true,
  });

  const publicId = createSimulatorPublicId();
  await db.simulatorRun.create({
    data: {
      publicId,
      businessId: business.id,
      leadId: lead.id,
      callerPhone,
      status: 'ACTIVE',
    },
  });

  redirect(getSimulatorRedirect(publicId));
}

export async function replyToSimulatorRunAction(formData: FormData) {
  const publicId = typeof formData.get('publicId') === 'string' ? String(formData.get('publicId')) : '';
  const body = typeof formData.get('body') === 'string' ? String(formData.get('body')).trim() : '';
  if (!publicId) {
    redirect(getSimulatorRedirect(null, 'Simulator run not found.'));
  }
  if (!body) {
    redirect(getSimulatorRedirect(publicId, 'Enter a reply to continue the intake flow.'));
  }

  const run = await getSimulatorRun(publicId);
  if (!run) {
    redirect(getSimulatorRedirect(null, 'Simulator run not found.'));
  }

  await processLeadInboundReply({
    business: {
      ...run.business,
      ownerClerkId: 'simulator',
      notifyPhone: null,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
    },
    leadId: run.leadId,
    body,
    fromPhone: run.callerPhone,
    toPhone: run.business.twilioPrimaryPhoneNumber || run.business.twilioPhoneNumber || '+10000000000',
    transport: 'simulated',
  });

  redirect(getSimulatorRedirect(publicId));
}
