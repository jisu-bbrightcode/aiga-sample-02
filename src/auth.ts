export type AdminSession = {
  email: string;
  name: string;
  role: "admin";
  signedInAt: string;
};

const SESSION_KEY = "aiga.admin.session";

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

export function signInAdmin(email: string, password: string): AdminSession | null {
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail !== "admin@aiga.test" || password !== "admin1234") {
    return null;
  }

  const session: AdminSession = {
    email: normalizedEmail,
    name: "Aiga 운영자",
    role: "admin",
    signedInAt: new Date().toISOString(),
  };

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearAdminSession() {
  window.localStorage.removeItem(SESSION_KEY);
}
