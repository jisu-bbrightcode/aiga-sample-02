export type AdminSession = {
  email: string;
  name: string;
  role: "admin";
  signedInAt: string;
};

export type AdminSignInResult =
  | { status: "success"; session: AdminSession }
  | { status: "permission" }
  | { status: "error" };

const SESSION_KEY = "aiga.admin.session";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "admin";

export function getAdminSession(): AdminSession | null {
  const rawSession = window.localStorage.getItem(SESSION_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSession) as Partial<AdminSession>;

    if (parsed.role !== "admin" || !parsed.email || !parsed.name || !parsed.signedInAt) {
      clearAdminSession();
      return null;
    }

    return parsed as AdminSession;
  } catch {
    clearAdminSession();
    return null;
  }
}

export function signInAdmin(email: string, password: string): AdminSignInResult {
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    if (normalizedEmail.endsWith("@example.com")) {
      return { status: "permission" };
    }

    return { status: "error" };
  }

  const session: AdminSession = {
    email: normalizedEmail,
    name: "Aiga 운영자",
    role: "admin",
    signedInAt: new Date().toISOString(),
  };

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { status: "success", session };
}

export function clearAdminSession() {
  window.localStorage.removeItem(SESSION_KEY);
}
