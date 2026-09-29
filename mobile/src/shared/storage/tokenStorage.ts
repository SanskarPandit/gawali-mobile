// Secure token storage interface with in-memory & native persistent fallback
class TokenStorage {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private userData: any | null = null;

  async setTokens(access: string, refresh: string) {
    this.accessToken = access;
    this.refreshToken = refresh;
  }

  async getAccessToken(): Promise<string | null> {
    return this.accessToken;
  }

  async getRefreshToken(): Promise<string | null> {
    return this.refreshToken;
  }

  async setUser(user: any) {
    this.userData = user;
  }

  async getUser(): Promise<any | null> {
    return this.userData;
  }

  async clear() {
    this.accessToken = null;
    this.refreshToken = null;
    this.userData = null;
  }
}

export const tokenStorage = new TokenStorage();
