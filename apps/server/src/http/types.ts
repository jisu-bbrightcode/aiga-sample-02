import type { Principal } from "../rbac/entitlement.js";

/**
 * Express request augmentation: the session middleware attaches the resolved
 * security `principal` (guest or authenticated) to every request.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal;
    }
  }
}

export {};
