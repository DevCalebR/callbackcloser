import type { Prisma } from '@prisma/client';
import { LeadStatus } from '@prisma/client';

import { db } from '@/lib/db';

const leadListInclude = {
  call: true,
  messages: {
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
} satisfies Prisma.LeadInclude;

const leadDetailInclude = {
  call: true,
  ownerNotifications: {
    orderBy: { createdAt: 'desc' },
  },
  messages: {
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.LeadInclude;

const conversationDetailInclude = {
  call: true,
  messages: {
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.LeadInclude;

export async function getBusinessForOwnerClerkId(ownerClerkId: string) {
  return db.business.findUnique({ where: { ownerClerkId } });
}

export async function listDashboardLeadsForBusiness(businessId: string, statusFilter?: LeadStatus | null) {
  return db.lead.findMany({
    where: {
      businessId,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: leadListInclude,
    orderBy: [{ lastInteractionAt: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function listAllDashboardLeadsForBusiness(businessId: string) {
  return db.lead.findMany({
    where: { businessId },
    include: leadListInclude,
    orderBy: [{ lastInteractionAt: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function getLeadDetailForBusiness(businessId: string, leadId: string) {
  return db.lead.findFirst({
    where: {
      businessId,
      id: leadId,
    },
    include: leadDetailInclude,
  });
}

export async function listConversationsForBusiness(businessId: string) {
  return db.lead.findMany({
    where: {
      businessId,
      OR: [{ lastInboundAt: { not: null } }, { lastOutboundAt: { not: null } }],
    },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: [{ lastInteractionAt: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function getConversationDetailForBusiness(businessId: string, leadId: string) {
  return db.lead.findFirst({
    where: {
      businessId,
      id: leadId,
    },
    include: conversationDetailInclude,
  });
}

export async function updateLeadStatusForBusiness(input: {
  businessId: string;
  leadId: string;
  status: LeadStatus;
}) {
  const result = await db.lead.updateMany({
    where: {
      id: input.leadId,
      businessId: input.businessId,
    },
    data: {
      status: input.status,
      lastInteractionAt: new Date(),
    },
  });

  if (result.count === 0) {
    return null;
  }

  return db.lead.findFirst({
    where: {
      id: input.leadId,
      businessId: input.businessId,
    },
  });
}

export async function getBusinessNotificationSettingsForBusiness(businessId: string) {
  return db.businessNotificationSettings.findUnique({
    where: { businessId },
  });
}

export async function getBillingUsageSnapshotForBusiness(input: {
  businessId: string;
  start: Date;
  end: Date;
}) {
  const [cycleSmsSent, cycleMissedCalls, cycleOwnerAlerts] = await Promise.all([
    db.message.count({
      where: {
        businessId: input.businessId,
        direction: 'OUTBOUND',
        createdAt: { gte: input.start, lt: input.end },
      },
    }),
    db.call.count({
      where: {
        businessId: input.businessId,
        missed: true,
        createdAt: { gte: input.start, lt: input.end },
      },
    }),
    db.lead.count({
      where: {
        businessId: input.businessId,
        OR: [
          { ownerNotifiedAt: { gte: input.start, lt: input.end } },
          { notifiedAt: { gte: input.start, lt: input.end } },
        ],
      },
    }),
  ]);

  return {
    cycleSmsSent,
    cycleMissedCalls,
    cycleOwnerAlerts,
  };
}

export async function getLeadRecordingForOwnerClerkId(input: {
  leadId: string;
  ownerClerkId: string;
}) {
  return db.lead.findFirst({
    where: {
      id: input.leadId,
      business: {
        is: {
          ownerClerkId: input.ownerClerkId,
        },
      },
    },
    select: {
      id: true,
      business: {
        select: {
          ownerClerkId: true,
        },
      },
      call: {
        select: {
          recordingUrl: true,
        },
      },
    },
  });
}
