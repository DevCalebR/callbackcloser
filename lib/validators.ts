import { z } from 'zod';

export const onboardingSchema = z.object({
  name: z.string().min(2).max(120),
  forwardingNumber: z.string().min(7).max(30),
  notifyPhone: z.string().max(30).optional().or(z.literal('')),
  missedCallSeconds: z.coerce.number().int().min(5).max(90).default(20),
  serviceLabel1: z.string().min(1).max(40),
  serviceLabel2: z.string().min(1).max(40),
  serviceLabel3: z.string().min(1).max(40),
  timezone: z.string().min(2).max(100),
});

export const businessSettingsSchema = onboardingSchema;

export const leadStatusSchema = z.object({
  leadId: z.string().min(1),
  status: z.enum(['NEW', 'QUALIFIED', 'CONTACTED', 'BOOKED']),
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
