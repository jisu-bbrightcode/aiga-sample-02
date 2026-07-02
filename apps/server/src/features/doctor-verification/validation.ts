/**
 * Boundary validation (zod). All external input is validated here before it
 * reaches the service. Fail fast with clear messages; never trust client data.
 */
import { z } from 'zod';

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const proofDocumentSchema = z.object({
  key: trimmed(512),
  filename: trimmed(255),
  contentType: trimmed(127),
});

export const licenseSchema = z.object({
  licenseNumber: trimmed(64),
  licenseName: trimmed(128),
  specialty: z.string().trim().max(128).nullish().transform((v) => v ?? null),
});

export const submitApplicationSchema = z.object({
  license: licenseSchema,
  proofDocuments: z.array(proofDocumentSchema).min(1).max(10),
});

export const rejectSchema = z.object({
  reason: trimmed(1000),
});

export const listQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type SubmitApplicationBody = z.infer<typeof submitApplicationSchema>;
export type RejectBody = z.infer<typeof rejectSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
