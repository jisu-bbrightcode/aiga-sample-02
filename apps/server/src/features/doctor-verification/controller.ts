/**
 * Framework-agnostic REST controller. Each handler takes a normalized request
 * (already authenticated + validated by the base router/middleware from
 * BBR-1117/BBR-1121) and returns a typed { status, body } result. A thin adapter
 * in the base wires these to the concrete HTTP framework (Hono/Express/Next).
 *
 * Authorization is expressed via the `actor` on the request: `role` gates
 * member vs admin routes; entitlement middleware from BBR-1121 enforces it
 * before these handlers run. Handlers re-check ownership where relevant.
 */
import { ZodError } from 'zod';
import { DoctorVerificationError } from './errors.js';
import type { DoctorVerificationService } from './service.js';
import {
  listQuerySchema,
  rejectSchema,
  submitApplicationSchema,
} from './validation.js';

export interface Actor {
  readonly userId: string;
  readonly role: 'member' | 'admin';
}

export interface HandlerRequest {
  readonly actor: Actor;
  readonly params: Record<string, string>;
  readonly query: Record<string, unknown>;
  readonly body: unknown;
}

export interface HandlerResponse {
  readonly status: number;
  readonly body: unknown;
}

const ok = (data: unknown, status = 200): HandlerResponse => ({
  status,
  body: { ok: true, data },
});

const errorBody = (code: string, message: string, details?: unknown) => ({
  ok: false,
  error: { code, message, ...(details ? { details } : {}) },
});

/** Maps thrown errors to safe REST responses (no PII leakage). */
export const toErrorResponse = (err: unknown): HandlerResponse => {
  if (err instanceof ZodError) {
    return { status: 400, body: errorBody('VALIDATION_ERROR', 'Invalid request.', err.flatten()) };
  }
  if (err instanceof DoctorVerificationError) {
    return { status: err.status, body: errorBody(err.code, err.message) };
  }
  return { status: 500, body: errorBody('INTERNAL_ERROR', 'Unexpected error.') };
};

/** Wraps a handler so domain/validation errors become REST responses. */
const guard =
  (fn: (req: HandlerRequest) => Promise<HandlerResponse>) =>
  async (req: HandlerRequest): Promise<HandlerResponse> => {
    try {
      return await fn(req);
    } catch (err) {
      return toErrorResponse(err);
    }
  };

export const createDoctorVerificationController = (service: DoctorVerificationService) => ({
  /** POST /doctor-verification/applications  (member) */
  submit: guard(async (req) => {
    const parsed = submitApplicationSchema.parse(req.body);
    const application = await service.submit({
      applicantId: req.actor.userId,
      license: parsed.license,
      proofDocuments: parsed.proofDocuments,
    });
    return ok(application, 201);
  }),

  /** POST /doctor-verification/applications/reapply  (member) */
  reapply: guard(async (req) => {
    const parsed = submitApplicationSchema.parse(req.body);
    const application = await service.reapply({
      applicantId: req.actor.userId,
      license: parsed.license,
      proofDocuments: parsed.proofDocuments,
    });
    return ok(application, 201);
  }),

  /** GET /doctor-verification/me  (member) */
  myStatus: guard(async (req) => {
    const view = await service.getStatusForApplicant(req.actor.userId);
    return ok(view);
  }),

  /** GET /doctor-verification/applications/:id  (member — own only) */
  getOwn: guard(async (req) => {
    const application = await service.getOwnedApplication((req.params.id ?? ''), req.actor.userId);
    return ok(application);
  }),

  /** GET /admin/doctor-verification/applications  (admin) */
  adminList: guard(async (req) => {
    const q = listQuerySchema.parse(req.query);
    const page = await service.list(q);
    return ok(page);
  }),

  /** GET /admin/doctor-verification/applications/:id  (admin) */
  adminGet: guard(async (req) => {
    const application = await service.getById((req.params.id ?? ''));
    return ok(application);
  }),

  /** POST /admin/doctor-verification/applications/:id/approve  (admin) */
  adminApprove: guard(async (req) => {
    const application = await service.approve({
      applicationId: (req.params.id ?? ''),
      adminId: req.actor.userId,
    });
    return ok(application);
  }),

  /** POST /admin/doctor-verification/applications/:id/reject  (admin) */
  adminReject: guard(async (req) => {
    const { reason } = rejectSchema.parse(req.body);
    const application = await service.reject({
      applicationId: (req.params.id ?? ''),
      adminId: req.actor.userId,
      reason,
    });
    return ok(application);
  }),
});

export type DoctorVerificationController = ReturnType<typeof createDoctorVerificationController>;
