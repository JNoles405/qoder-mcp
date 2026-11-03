// Self-contained Supabase REST client.
//
// Mirrors the dialect used by the Electron app's src/data.js `sb` helper
// (apikey header + Bearer token + Prefer: return=representation + ?id=eq.<id>
// filters), but adds inline token refresh — the renderer refreshes via its
// own effects; a long-lived MCP process has to do it itself.

function headers(apiKey, token) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${token || apiKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

export class SupabaseClient {
  constructor(url, anonKey) {
    this.url = url;
    this.anonKey = anonKey;
    this.token = null;
    this.refreshToken = null;
    this.userId = null;
    this.expiresAt = 0;
    this._email = null;
    this._password = null;
  }

  async signIn(email, password) {
    this._email = email;
    this._password = password;
    const r = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.anonKey },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.access_token) {
      const msg = data.error_description || data.msg || data.message || r.statusText;
      throw new Error(`Qoder sign-in failed: ${msg}`);
    }
    this.token = data.access_token;
    this.refreshToken = data.refresh_token;
    this.userId = data.user?.id || null;
    // Refresh a minute early so a request on the edge never fails.
    this.expiresAt = Date.now() + (data.expires_in || 3600) * 1000 - 60_000;
    return { userId: this.userId };
  }

  async _ensureFresh() {
    if (!this.token) throw new Error("qoder-mcp: not signed in");
    if (Date.now() < this.expiresAt) return;
    if (this.refreshToken) {
      try {
        const r = await fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: this.anonKey },
          body: JSON.stringify({ refresh_token: this.refreshToken }),
        });
        if (r.ok) {
          const data = await r.json();
          if (data.access_token) {
            this.token = data.access_token;
            this.refreshToken = data.refresh_token || this.refreshToken;
            this.expiresAt = Date.now() + (data.expires_in || 3600) * 1000 - 60_000;
            return;
          }
        }
      } catch {
        // fall through to password re-signin
      }
    }
    if (this._email && this._password) {
      await this.signIn(this._email, this._password);
      return;
    }
    throw new Error("qoder-mcp: session expired and no refresh path available");
  }

  async get(table, query = "") {
    await this._ensureFresh();
    const r = await fetch(`${this.url}/rest/v1/${table}${query}`, {
      headers: headers(this.anonKey, this.token),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || `GET ${table} failed (${r.status})`);
    return data;
  }

  async post(table, body) {
    await this._ensureFresh();
    const r = await fetch(`${this.url}/rest/v1/${table}`, {
      method: "POST",
      headers: headers(this.anonKey, this.token),
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || `POST ${table} failed (${r.status})`);
    return Array.isArray(data) ? data[0] : data;
  }

  async patch(table, id, body) {
    await this._ensureFresh();
    const r = await fetch(`${this.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: headers(this.anonKey, this.token),
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || `PATCH ${table} failed (${r.status})`);
    return Array.isArray(data) ? data[0] : data;
  }

  async del(table, id) {
    await this._ensureFresh();
    const r = await fetch(`${this.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: headers(this.anonKey, this.token),
    });
    if (!r.ok) {
      let msg = r.statusText;
      try {
        msg = (await r.json()).message || msg;
      } catch {
        // ignore
      }
      throw new Error(`DELETE ${table} failed: ${msg}`);
    }
  }
}
