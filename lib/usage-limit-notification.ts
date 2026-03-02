type LeadUpdateManyClient = {
  lead: {
    updateMany(args: {
      where: { id: string; usageLimitNotifiedAt: null };
      data: { usageLimitNotifiedAt: Date; lastInteractionAt: Date };
    }): Promise<{ count: number }>;
  };
};

export async function claimUsageLimitNotification(
  client: LeadUpdateManyClient,
  leadId: string,
  now: Date = new Date()
) {
  const result = await client.lead.updateMany({
    where: {
      id: leadId,
      usageLimitNotifiedAt: null,
    },
    data: {
      usageLimitNotifiedAt: now,
      lastInteractionAt: now,
    },
  });

  return result.count > 0;
}
