import {
  API_BASE,
  DEFAULT_API_SERVER,
  REDIRECT_URI,
  TOKENINFO_URL,
} from './constants';
import { mergeYoutubeParams } from './params';

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export type YoutubeChannel = {
  id: string;
  title: string;
  thumbnail?: string;
};

export type YoutubeLiveVideo = {
  videoId: string;
  title: string;
};

type LiveChatMessageItem = {
  id?: string;
  snippet?: {
    type?: string;
    displayMessage?: string;
    publishedAt?: string;
    superChatDetails?: {
      amountMicros?: string;
      currency?: string;
      userComment?: string;
      tier?: number;
    };
    superStickerDetails?: {
      amountMicros?: string;
      currency?: string;
      tier?: number;
    };
    newSponsorDetails?: {
      memberLevelName?: string;
      isUpgrade?: boolean;
    };
    memberMilestoneChatDetails?: {
      memberLevelName?: string;
      memberMonth?: number;
      userComment?: string;
    };
    membershipGiftingDetails?: {
      giftMembershipsCount?: number;
      giftMembershipsLevelName?: string;
    };
    giftMembershipReceivedDetails?: {
      giftMembershipsCount?: number;
      giftMembershipsLevelName?: string;
      gifterChannelId?: string;
    };
  };
  authorDetails?: {
    channelId?: string;
    displayName?: string;
    profileImageUrl?: string;
    isChatModerator?: boolean;
    isChatOwner?: boolean;
    isChatSponsor?: boolean;
    isVerified?: boolean;
  };
};

export type YoutubeLiveChatMessage = LiveChatMessageItem;

const normalizeApiServer = (value?: string | null) => {
  const trimmed = value?.trim() || DEFAULT_API_SERVER;
  return trimmed.replace(/\/+$/, '');
};

const formatErrorMessage = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const parts = value
      .map(item => {
        if (typeof item === 'string' && item.trim()) {
          return item.trim();
        }
        if (item && typeof item === 'object') {
          const record = item as { msg?: unknown; message?: unknown };
          if (typeof record.msg === 'string' && record.msg.trim()) {
            return record.msg.trim();
          }
          if (typeof record.message === 'string' && record.message.trim()) {
            return record.message.trim();
          }
        }
        return '';
      })
      .filter(Boolean);
    return parts.length ? parts.join('; ') : undefined;
  }

  if (value && typeof value === 'object') {
    const record = value as { msg?: unknown; message?: unknown };
    if (typeof record.msg === 'string' && record.msg.trim()) {
      return record.msg.trim();
    }
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message.trim();
    }
  }

  return undefined;
};

export const YouTubeApi = new (class {
  accessToken: string | null = null;
  refreshToken: string | null = null;
  apiServer: string = DEFAULT_API_SERVER;
  grantedScopes = new Set<string>();
  private refreshInFlight: Promise<boolean> | null = null;
  private channelCache: {
    expiresAt: number;
    channel: YoutubeChannel;
  } | null = null;

  setApiServer(value?: string | null) {
    this.apiServer = normalizeApiServer(value);
  }

  clearChannelCache() {
    this.channelCache = null;
  }

  private async postTokenEndpoint(
    path: string,
    body: Record<string, unknown>
  ): Promise<string> {
    const url = `${this.apiServer}${path}`;
    const payload: Record<string, string> = {
      redirect_uri:
        typeof body.redirect_uri === 'string'
          ? body.redirect_uri
          : REDIRECT_URI,
    };

    if (typeof body.code === 'string') {
      payload.code = body.code;
    }
    if (typeof body.refresh_token === 'string') {
      payload.refresh_token = body.refresh_token;
    }

    console.log(
      `[YouTube] Token endpoint request: url=${url}, codeLength=${payload.code?.length ?? 0}, bodyLength=${JSON.stringify(payload).length}`
    );

    return network.request.post(url, payload);
  }

  private authHeaders() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };
  }

  private isQuotaExceeded(body: {
    code?: number;
    status?: string;
    error?: string | { code?: number; message?: string; status?: string };
    errors?: { reason?: string }[];
    details?: { reason?: string }[];
  }) {
    if (body.code === 429 || body.status === 'RESOURCE_EXHAUSTED') {
      return true;
    }

    if (typeof body.error === 'object' && body.error) {
      if (
        body.error.code === 429 ||
        body.error.status === 'RESOURCE_EXHAUSTED'
      ) {
        return true;
      }
    }

    if (body.errors?.some(item => item.reason === 'rateLimitExceeded')) {
      return true;
    }

    return (
      body.details?.some(item => item.reason === 'RATE_LIMIT_EXCEEDED') ?? false
    );
  }

  private parseBody<T>(response: string, fallback: string) {
    if (!response?.trim()) {
      return { ok: false as const, message: fallback };
    }
    let body: T & {
      message?: string;
      code?: number;
      status?: string;
      error?: string | { code?: number; message?: string; status?: string };
      error_description?: string;
      detail?: string | unknown[] | Record<string, unknown>;
      details?: { reason?: string }[] | unknown[];
    };
    try {
      body = JSON.parse(response) as T & {
        message?: string;
        code?: number;
        status?: string;
        error?: string | { code?: number; message?: string; status?: string };
        error_description?: string;
        detail?: string | unknown[] | Record<string, unknown>;
        errors?: { reason?: string }[];
        details?: { reason?: string }[] | unknown[];
      };
    } catch {
      return { ok: false as const, message: fallback };
    }

    const nestedError =
      typeof body.error === 'object' && body.error ? body.error : null;
    const errorMessage =
      (typeof body.error === 'string' ? body.error : undefined) ||
      nestedError?.message ||
      body.error_description ||
      formatErrorMessage(body.detail) ||
      formatErrorMessage(body.details) ||
      (typeof body.code === 'number' && body.code >= 400
        ? body.message
        : undefined);

    if (errorMessage) {
      return {
        ok: false as const,
        message: errorMessage,
        quotaExceeded: this.isQuotaExceeded(body as any),
      };
    }
    return { ok: true as const, body };
  }

  async exchangeAuthorizationCode(code: string): Promise<{
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    message?: string;
  }> {
    const tokenPath = '/youtube/oauth/token';
    const normalizedCode = typeof code === 'string' ? code.trim() : '';
    if (!normalizedCode) {
      return { success: false, message: 'Authorization code is empty' };
    }

    try {
      const response = await this.postTokenEndpoint(tokenPath, {
        code: normalizedCode,
        redirect_uri: REDIRECT_URI,
      });
      const parsed = this.parseBody<TokenResponse>(
        response,
        'Failed to exchange authorization code'
      );
      if (!parsed.ok || !parsed.body.access_token) {
        const detail =
          parsed.ok === false
            ? parsed.message
            : parsed.body.error_description ||
              parsed.body.error ||
              'YouTube did not return access token';
        console.error(
          `[YouTube] Token exchange response error: url=${this.apiServer}${tokenPath}, redirect_uri=${REDIRECT_URI}, detail=${detail}, response=${response?.slice(0, 500)}`
        );
        return { success: false, message: detail };
      }
      return {
        success: true,
        accessToken: parsed.body.access_token,
        refreshToken: parsed.body.refresh_token,
        expiresIn: parsed.body.expires_in,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'YouTube token exchange failed';
      console.error(
        `[YouTube] Token exchange request failed: url=${this.apiServer}${tokenPath}, apiServer=${this.apiServer}, redirect_uri=${REDIRECT_URI}, error=${message}`,
        error
      );
      return { success: false, message };
    }
  }

  async refreshAccessToken(): Promise<boolean> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    const refreshToken = this.refreshToken?.trim();
    if (!refreshToken) {
      return false;
    }

    this.refreshInFlight = (async () => {
      try {
        const response = await this.postTokenEndpoint(
          '/youtube/oauth/refresh',
          {
            refresh_token: refreshToken,
          }
        );
        const parsed = this.parseBody<TokenResponse>(
          response,
          'Failed to refresh YouTube token'
        );
        if (!parsed.ok || !parsed.body.access_token) {
          console.warn(
            'YouTube token refresh failed:',
            parsed.ok ? parsed.body.message : parsed.message
          );
          return false;
        }

        this.accessToken = parsed.body.access_token;
        if (parsed.body.refresh_token) {
          this.refreshToken = parsed.body.refresh_token;
        }
        this.clearChannelCache();
        await this.loadTokenScopes();

        const expiresAt =
          typeof parsed.body.expires_in === 'number'
            ? Date.now() + parsed.body.expires_in * 1000
            : Date.now() + 3600 * 1000;

        await mergeYoutubeParams({
          access_token: this.accessToken,
          refresh_token: this.refreshToken,
          token_expires_at: expiresAt,
        });

        return true;
      } catch (error) {
        console.error(
          'YouTube token refresh error:',
          error instanceof Error ? error.message : error
        );
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  async ensureAccessToken(expiresAt?: number): Promise<boolean> {
    if (!this.accessToken) {
      return false;
    }
    const shouldRefresh = !expiresAt || Date.now() >= expiresAt - 60_000;
    if (shouldRefresh && this.refreshToken) {
      return this.refreshAccessToken();
    }
    return true;
  }

  private async loadTokenScopes(): Promise<boolean> {
    if (!this.accessToken) {
      this.grantedScopes.clear();
      return false;
    }

    try {
      const response = await network.request.get(
        `${TOKENINFO_URL}?access_token=${encodeURIComponent(this.accessToken)}`
      );
      const parsed = this.parseBody<{ scope?: string; error?: string }>(
        response,
        'Failed to validate YouTube token'
      );
      if (!parsed.ok) {
        this.grantedScopes.clear();
        return false;
      }

      const scopeText = parsed.body.scope || '';
      this.grantedScopes = new Set(
        scopeText
          .split(/\s+/)
          .map(item => item.trim())
          .filter(Boolean)
      );
      return true;
    } catch (error) {
      console.error('YouTube token scope validation failed:', error);
      this.grantedScopes.clear();
      return false;
    }
  }

  async validateTokenScopes(
    required: readonly string[],
    optional: readonly string[] = []
  ): Promise<boolean> {
    if (!this.accessToken) {
      return false;
    }

    const ok = await this.loadTokenScopes();
    if (!ok) {
      return false;
    }

    for (const scope of required) {
      if (!this.grantedScopes.has(scope)) {
        console.warn(`YouTube missing required scope: ${scope}`);
        return false;
      }
    }

    for (const scope of optional) {
      if (!this.grantedScopes.has(scope)) {
        console.warn(`YouTube optional scope missing: ${scope}`);
      }
    }

    return true;
  }

  hasScope(scope: string) {
    return this.grantedScopes.has(scope);
  }

  async getMyChannel(force = false): Promise<YoutubeChannel | null> {
    if (
      !force &&
      this.channelCache &&
      Date.now() < this.channelCache.expiresAt
    ) {
      return this.channelCache.channel;
    }

    if (!this.accessToken) {
      return null;
    }

    try {
      const response = await network.request.get(
        `${API_BASE}/channels?part=snippet&mine=true`,
        this.authHeaders()
      );
      const parsed = this.parseBody<{
        items?: {
          id?: string;
          snippet?: {
            title?: string;
            thumbnails?: { default?: { url?: string } };
          };
        }[];
      }>(response, 'Failed to load YouTube channel');

      if (!parsed.ok) {
        console.error(parsed.message);
        return null;
      }

      const item = parsed.body.items?.[0];
      if (!item?.id) {
        return null;
      }

      const channel: YoutubeChannel = {
        id: item.id,
        title: item.snippet?.title || item.id,
        thumbnail: item.snippet?.thumbnails?.default?.url,
      };

      this.channelCache = {
        channel,
        expiresAt: Date.now() + 5 * 60_000,
      };

      return channel;
    } catch (error) {
      console.error('Failed to load YouTube channel:', error);
      return null;
    }
  }

  async getActiveLiveVideo(channelId: string): Promise<{
    video: YoutubeLiveVideo | null;
    quotaExceeded?: boolean;
  }> {
    if (!this.accessToken || !channelId) {
      return { video: null };
    }

    try {
      const response = await network.request.get(
        `${API_BASE}/search?part=snippet&channelId=${encodeURIComponent(channelId)}&eventType=live&type=video&maxResults=1`,
        this.authHeaders()
      );
      const parsed = this.parseBody<{
        items?: {
          id?: { videoId?: string };
          snippet?: { title?: string };
        }[];
      }>(response, 'Failed to check YouTube live status');

      if (!parsed.ok) {
        console.error(parsed.message);
        return { video: null, quotaExceeded: parsed.quotaExceeded };
      }

      const item = parsed.body.items?.[0];
      const videoId = item?.id?.videoId;
      if (!videoId) {
        return { video: null };
      }

      return {
        video: {
          videoId,
          title: item?.snippet?.title || videoId,
        },
      };
    } catch (error) {
      console.error('YouTube live status check failed:', error);
      return { video: null };
    }
  }

  async getLiveChatId(videoId: string): Promise<string | null> {
    if (!this.accessToken || !videoId) {
      return null;
    }

    try {
      const response = await network.request.get(
        `${API_BASE}/videos?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}`,
        this.authHeaders()
      );
      const parsed = this.parseBody<{
        items?: {
          liveStreamingDetails?: { activeLiveChatId?: string };
        }[];
      }>(response, 'Failed to load YouTube live chat id');

      if (!parsed.ok) {
        console.error(parsed.message);
        return null;
      }

      const chatId =
        parsed.body.items?.[0]?.liveStreamingDetails?.activeLiveChatId?.trim();
      return chatId || null;
    } catch (error) {
      console.error('YouTube live chat id lookup failed:', error);
      return null;
    }
  }

  async listLiveChatMessages(
    liveChatId: string,
    pageToken?: string
  ): Promise<{
    items: YoutubeLiveChatMessage[];
    nextPageToken?: string;
    pollingIntervalMillis: number;
    offlineAt?: string;
    quotaExceeded?: boolean;
  } | null> {
    if (!this.accessToken || !liveChatId) {
      return null;
    }

    const query = new URLSearchParams();
    query.set('liveChatId', liveChatId);
    query.set('part', 'snippet,authorDetails');
    query.set('maxResults', '200');
    if (pageToken) {
      query.set('pageToken', pageToken);
    }

    try {
      const response = await network.request.get(
        `${API_BASE}/liveChat/messages?${query.toString()}`,
        this.authHeaders()
      );
      const parsed = this.parseBody<{
        items?: YoutubeLiveChatMessage[];
        nextPageToken?: string;
        pollingIntervalMillis?: number;
        offlineAt?: string;
      }>(response, 'Failed to load YouTube live chat messages');

      if (!parsed.ok) {
        console.error(parsed.message);
        if (parsed.quotaExceeded) {
          return {
            items: [],
            pollingIntervalMillis: 5000,
            quotaExceeded: true,
          };
        }
        return null;
      }

      return {
        items: parsed.body.items ?? [],
        nextPageToken: parsed.body.nextPageToken,
        pollingIntervalMillis: parsed.body.pollingIntervalMillis ?? 5000,
        offlineAt: parsed.body.offlineAt,
      };
    } catch (error) {
      console.error('YouTube live chat poll failed:', error);
      return null;
    }
  }

  async sendLiveChatMessage(
    liveChatId: string,
    messageText: string
  ): Promise<boolean> {
    if (!this.accessToken || !liveChatId || !messageText.trim()) {
      return false;
    }

    try {
      const response = await network.request.post(
        `${API_BASE}/liveChat/messages?part=snippet`,
        {
          snippet: {
            liveChatId,
            type: 'textMessageEvent',
            textMessageDetails: {
              messageText: messageText.trim(),
            },
          },
        },
        {
          ...this.authHeaders(),
          'Content-Type': 'application/json',
        }
      );
      const parsed = this.parseBody<{ id?: string }>(
        response,
        'Failed to send YouTube chat message'
      );
      if (!parsed.ok) {
        console.error(parsed.message);
        return false;
      }
      return Boolean(parsed.body.id);
    } catch (error) {
      console.error('YouTube chat send failed:', error);
      return false;
    }
  }
})();
