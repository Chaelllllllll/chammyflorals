const sessionStore = new Map();

function setSession(token, email, expiresAtMs) {
  try {
    const expires = Number(expiresAtMs) || (Date.now() + 8 * 60 * 60 * 1000);
    sessionStore.set(String(token), { email: String(email).trim().toLowerCase(), expires });
    // schedule a cleanup just beyond expiry
    setTimeout(() => { try { const v = sessionStore.get(String(token)); if (v && v.expires <= Date.now()) sessionStore.delete(String(token)); } catch (e) {} }, Math.max(1000, expires - Date.now() + 1000));
  } catch (e) {
    // ignore
  }
}

function getSession(token) {
  try {
    const rec = sessionStore.get(String(token));
    if (!rec) return null;
    if (rec.expires && Date.now() > rec.expires) {
      sessionStore.delete(String(token));
      return null;
    }
    return rec;
  } catch (e) { return null; }
}

module.exports = { sessionStore, setSession, getSession };
