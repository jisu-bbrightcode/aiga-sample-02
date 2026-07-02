/**
 * Proof blob storage adapters (BBR-1167).
 *
 * The retention purge and account-deletion hooks need to delete proof objects
 * from Vercel Blob. `@vercel/blob` is an *optional* runtime dependency: in
 * environments where it (or the token) is absent — local dev, tests, CI — we
 * fall back to a no-op adapter that records the deletion intent instead of
 * failing. This keeps the feature self-contained and typecheckable without
 * pinning the package in the shared workspace.
 */
import type { ProofBlobStorage } from './ports.js';

/** Structural signature of `@vercel/blob`'s `del`; declared locally so we can
 * load it via a dynamic specifier without a hard compile-time dependency. */
type BlobDelFn = (
  urlOrKeys: string | string[],
  options?: { token?: string },
) => Promise<void>;

export interface BlobStorageLogger {
  warn(message: string): void;
}

const defaultLogger: BlobStorageLogger = {
  // eslint-disable-next-line no-console -- infra-level fallback warning only.
  warn: (message) => console.warn(message),
};

/**
 * No-op adapter. Used when no blob token is configured. Deletions are recorded
 * as a warning so aged-purge runs are observable, but nothing is sent remotely.
 * Safe because DB rows still get their `proofDocuments` cleared + purge-stamped.
 */
export class NoopProofBlobStorage implements ProofBlobStorage {
  constructor(private readonly logger: BlobStorageLogger = defaultLogger) {}

  async deleteMany(keys: ReadonlyArray<string>): Promise<void> {
    if (keys.length === 0) return;
    this.logger.warn(
      `[doctor-verification] blob storage not configured — skipping remote delete of ${keys.length} proof object(s). ` +
        `Set BLOB_READ_WRITE_TOKEN to enable purging.`,
    );
  }
}

/**
 * Vercel Blob adapter. Lazily loads `@vercel/blob` on first use so a missing
 * package degrades gracefully rather than crashing the process at import time.
 */
export class VercelProofBlobStorage implements ProofBlobStorage {
  private delFn: BlobDelFn | null | undefined;

  constructor(
    private readonly token: string,
    private readonly logger: BlobStorageLogger = defaultLogger,
    private readonly loader: () => Promise<BlobDelFn | null> = loadVercelDel,
  ) {}

  async deleteMany(keys: ReadonlyArray<string>): Promise<void> {
    if (keys.length === 0) return;
    if (this.delFn === undefined) {
      this.delFn = await this.loader();
    }
    if (!this.delFn) {
      this.logger.warn(
        '[doctor-verification] @vercel/blob is not installed — proof objects were not deleted remotely.',
      );
      return;
    }
    // `del` accepts an array and is idempotent for already-removed objects.
    await this.delFn([...keys], { token: this.token });
  }
}

/** Load `@vercel/blob`'s `del` without a static import (optional dependency). */
async function loadVercelDel(): Promise<BlobDelFn | null> {
  try {
    // Variable specifier => TS does not attempt to resolve the module type,
    // so this compiles even when the optional package is not installed.
    const specifier = '@vercel/blob';
    const mod = (await import(specifier)) as { del?: BlobDelFn };
    return mod.del ?? null;
  } catch {
    return null;
  }
}

export interface BlobStorageEnv {
  readonly BLOB_READ_WRITE_TOKEN?: string | undefined;
}

/**
 * Pick the adapter based on configuration. When a token is present, use Vercel
 * Blob; otherwise fall back to the no-op adapter (with a startup-visible warn on
 * first deletion attempt).
 */
export function createProofBlobStorage(
  env: BlobStorageEnv = process.env,
  logger: BlobStorageLogger = defaultLogger,
): ProofBlobStorage {
  const token = env.BLOB_READ_WRITE_TOKEN?.trim();
  if (token && token.length > 0) {
    return new VercelProofBlobStorage(token, logger);
  }
  return new NoopProofBlobStorage(logger);
}
