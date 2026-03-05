// Session management — keyed by session key, stores conversation state

export interface SessionData {
  sessionKey: string;
  agentId: string;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

class SessionStore {
  private sessions = new Map<string, SessionData>();

  /** Get or create a session */
  getOrCreate(sessionKey: string, agentId: string, channelId: string): SessionData {
    let session = this.sessions.get(sessionKey);
    if (!session) {
      session = {
        sessionKey,
        agentId,
        channelId,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
      };
      this.sessions.set(sessionKey, session);
      console.log(`[Session] Created session: ${sessionKey}`);
    }
    session.updatedAt = new Date();
    return session;
  }

  /** Get an existing session */
  get(sessionKey: string): SessionData | undefined {
    return this.sessions.get(sessionKey);
  }

  /** Delete a session */
  delete(sessionKey: string): boolean {
    return this.sessions.delete(sessionKey);
  }
}

export const sessionStore = new SessionStore();
