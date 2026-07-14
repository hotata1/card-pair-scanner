/**
 * Cognito Hosted UI(Authorization Code + PKCE)によるログインゲート。
 * アプリの入口を堰き止める認証はここに閉じ込め、他コードはアクセストークンの
 * 有無だけを見る(トークン検証自体はAPI Gateway側のJWT Authorizerが担う)。
 */
export interface CognitoAuthConfig {
  domain: string;
  clientId: string;
}

interface StoredTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

const TOKEN_KEY = 'card-pair-scanner:auth';
const VERIFIER_KEY = 'card-pair-scanner:pkce-verifier';
const STATE_KEY = 'card-pair-scanner:pkce-state';
const EXPIRY_SKEW_MS = 60_000;

export class CognitoAuth {
  constructor(private cfg: CognitoAuthConfig) {}

  /** ドメイン/クライアントID未設定ならログインゲート自体を無効化(ローカル開発用)。 */
  get configured(): boolean {
    return this.cfg.domain !== '' && this.cfg.clientId !== '';
  }

  async login(): Promise<void> {
    const verifier = randomUrlSafeString(64);
    const challenge = await sha256Base64Url(verifier);
    const state = randomUrlSafeString(32);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);

    const url = new URL(`${this.cfg.domain}/oauth2/authorize`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.cfg.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('scope', 'openid email');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('code_challenge', challenge);
    window.location.assign(url.toString());
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    const url = new URL(`${this.cfg.domain}/logout`);
    url.searchParams.set('client_id', this.cfg.clientId);
    url.searchParams.set('logout_uri', this.redirectUri());
    window.location.assign(url.toString());
  }

  /** Hosted UIからのリダイレクト直後ならcode/stateを検証しトークンを交換する。 */
  async handleRedirectCallback(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const returnedState = params.get('state');
    if (!code) return;

    const expectedState = sessionStorage.getItem(STATE_KEY);
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(VERIFIER_KEY);
    // 再読み込みや共有でcode/stateが再送されないようURLを掃除
    window.history.replaceState({}, '', this.redirectUri());
    if (!verifier || !expectedState || returnedState !== expectedState) return;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.cfg.clientId,
      code,
      redirect_uri: this.redirectUri(),
      code_verifier: verifier,
    });
    const res = await fetch(`${this.cfg.domain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return;
    const data = (await res.json()) as { access_token: string; id_token: string; refresh_token: string; expires_in: number };
    this.persist(data.access_token, data.id_token, data.refresh_token, data.expires_in);
  }

  /** 有効なアクセストークンを返す。期限切れならリフレッシュ、失敗時はnull(=再ログイン要)。 */
  async getValidAccessToken(): Promise<string | null> {
    const stored = this.load();
    if (!stored) return null;
    if (stored.expiresAt - EXPIRY_SKEW_MS > Date.now()) return stored.accessToken;
    return this.refresh(stored.refreshToken);
  }

  private async refresh(refreshToken: string): Promise<string | null> {
    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.cfg.clientId,
        refresh_token: refreshToken,
      });
      const res = await fetch(`${this.cfg.domain}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) throw new Error(`refresh failed (${res.status})`);
      const data = (await res.json()) as { access_token: string; id_token: string; expires_in: number };
      // Cognitoはリフレッシュトークンをローテーションしないため既存の値を使い回す
      this.persist(data.access_token, data.id_token, refreshToken, data.expires_in);
      return data.access_token;
    } catch (err) {
      console.warn('CognitoAuth: refresh failed', err);
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
  }

  private redirectUri(): string {
    return `${window.location.origin}${window.location.pathname}`;
  }

  private persist(accessToken: string, idToken: string, refreshToken: string, expiresInSec: number): void {
    const tokens: StoredTokens = {
      accessToken,
      idToken,
      refreshToken,
      expiresAt: Date.now() + expiresInSec * 1000,
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  }

  private load(): StoredTokens | null {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as StoredTokens;
    } catch {
      return null;
    }
  }
}

function randomUrlSafeString(byteLen: number): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
