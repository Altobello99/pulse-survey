const DEFAULT_ADMIN_LOGIN_ID = "admin";
const DEFAULT_ADMIN_PORTAL_DOMAIN = "admin.pulsesurvey.local";

export type AdminPortalAccount = {
  loginId: string;
  password: string;
};

export function normalizeAdminLoginId(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

export function getAdminPortalDomain() {
  return process.env.ADMIN_PORTAL_DOMAIN?.trim().toLowerCase() || DEFAULT_ADMIN_PORTAL_DOMAIN;
}

export function getAdminPortalEmail(loginId: string) {
  return `${normalizeAdminLoginId(loginId)}@${getAdminPortalDomain()}`;
}

export function getAdminLoginIds() {
  const ids = [
    ...parseAdminPortalAccounts().map((account) => account.loginId),
    ...(process.env.ADMIN_LOGIN_IDS || "")
      .split(",")
      .map(normalizeAdminLoginId),
    normalizeAdminLoginId(process.env.ADMIN_LOGIN_ID),
  ].filter(Boolean);

  return [...new Set(ids.length ? ids : [DEFAULT_ADMIN_LOGIN_ID])];
}

export function isAdminPortalLoginId(value: string | null | undefined) {
  return getAdminLoginIds().includes(normalizeAdminLoginId(value));
}

export function getAdminPortalAccounts(defaultPassword: string): AdminPortalAccount[] {
  const configured = parseAdminPortalAccounts();
  const accountsById = new Map<string, AdminPortalAccount>();

  for (const account of configured) {
    accountsById.set(account.loginId, {
      loginId: account.loginId,
      password: account.password || defaultPassword,
    });
  }

  for (const loginId of getAdminLoginIds()) {
    if (!accountsById.has(loginId)) {
      accountsById.set(loginId, { loginId, password: defaultPassword });
    }
  }

  return [...accountsById.values()];
}

function parseAdminPortalAccounts() {
  return (process.env.ADMIN_PORTAL_ACCOUNTS || "")
    .split(",")
    .map((entry) => {
      const [rawLoginId, ...passwordParts] = entry.split(":");
      const loginId = normalizeAdminLoginId(rawLoginId);
      const password = passwordParts.join(":").trim();
      return loginId ? { loginId, password } : null;
    })
    .filter((account): account is AdminPortalAccount => Boolean(account));
}
