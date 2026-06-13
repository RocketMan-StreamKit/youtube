import {
  CLIENT_ID,
  OAUTH_AUTHORIZE_URL,
  REDIRECT_URI,
  SCOPES,
} from './constants';
import { YouTubeApi } from './api';
import { RegenerateConfig } from './config';
import { mergeYoutubeParams } from './params';
import { stopYoutubeTracking } from './tracking';

const buildAuthUrl = () => {
  const query = new URLSearchParams();
  query.set('client_id', CLIENT_ID);
  query.set('redirect_uri', REDIRECT_URI);
  query.set('response_type', 'code');
  query.set('scope', SCOPES.join(' '));
  query.set('access_type', 'offline');
  query.set('prompt', 'consent');
  return `${OAUTH_AUTHORIZE_URL}?${query.toString()}`;
};

const readQueryValue = (value: unknown) => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0].trim();
  }
  return '';
};

const formatAuthMessage = (message: unknown, fallback: string) => {
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }
  if (message instanceof Error && message.message.trim()) {
    return message.message.trim();
  }
  if (message != null && typeof message === 'object') {
    try {
      return JSON.stringify(message);
    } catch {
      return fallback;
    }
  }
  return fallback;
};

const extractCodeFromRequest = (
  query: Record<string, unknown>,
  originalUrl?: string
) => {
  const fromQuery = readQueryValue(query.code);
  if (fromQuery) {
    return fromQuery;
  }

  if (typeof originalUrl !== 'string' || !originalUrl.includes('?')) {
    return '';
  }

  const search = originalUrl.slice(originalUrl.indexOf('?') + 1);
  const match = search.match(/(?:^|&)code=([^&#]*)/);
  if (!match?.[1]) {
    return '';
  }

  try {
    return decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
  } catch {
    return match[1].trim();
  }
};

events.On('youtubeLogin', () => {
  api.openUrl(buildAuthUrl());
});

events.On('youtubeLogout', async () => {
  stopYoutubeTracking();
  await mergeYoutubeParams({
    access_token: '',
    refresh_token: '',
    token_expires_at: 0,
    channel_title: '',
  });
  RegenerateConfig();
});

events.On('youtubeAuthCallback', async ({ query, url }) => {
  console.log('[YouTube] OAuth callback received');

  try {
    const error = readQueryValue(query.error);
    if (error) {
      return {
        redirect: ui.auth.generateFail(
          `YouTube authorization failed: ${error}`
        ),
      };
    }

    const code = extractCodeFromRequest(query, url);
    console.log(`[YouTube] OAuth callback codeLength=${code.length}`);

    if (!code) {
      return {
        redirect: ui.auth.generateFail('Missing authorization code'),
      };
    }

    const params = await api.config.getParams<{ api_server?: string }>();
    YouTubeApi.setApiServer(params.api_server);

    const exchanged = await YouTubeApi.exchangeAuthorizationCode(code);
    if (!exchanged.success || !exchanged.accessToken) {
      const message = formatAuthMessage(
        exchanged.message,
        'Token exchange failed'
      );
      return {
        redirect: ui.auth.generateFail(message),
      };
    }

    const expiresAt =
      typeof exchanged.expiresIn === 'number'
        ? Date.now() + exchanged.expiresIn * 1000
        : Date.now() + 3600 * 1000;

    YouTubeApi.accessToken = exchanged.accessToken;
    YouTubeApi.refreshToken = exchanged.refreshToken || null;
    const channel = await YouTubeApi.getMyChannel(true);

    const saved = await mergeYoutubeParams({
      access_token: exchanged.accessToken,
      refresh_token: exchanged.refreshToken || '',
      token_expires_at: expiresAt,
      channel_title: channel?.title || '',
    });

    if (
      saved &&
      typeof saved === 'object' &&
      'success' in saved &&
      saved.success === false
    ) {
      const message = formatAuthMessage(
        'message' in saved ? saved.message : null,
        'Failed to save authorization data'
      );
      return {
        redirect: ui.auth.generateFail(message),
      };
    }

    RegenerateConfig();

    return {
      redirect: ui.auth.generateSuccess(
        'Authorization successful. You can close this window.'
      ),
    };
  } catch (error) {
    const message = formatAuthMessage(error, 'Authorization callback failed');
    console.error('[YouTube] OAuth callback failed:', error);
    return {
      redirect: ui.auth.generateFail(message),
    };
  }
});

void (async () => {
  const created = (await network.endpoints.create(
    'auth',
    'GET',
    'youtubeAuthCallback'
  )) as { success: boolean; message: string };

  if (!created?.success) {
    console.error(
      '[YouTube] Failed to register auth endpoint:',
      created?.message || created
    );
    return;
  }

  console.log('[YouTube] Auth endpoint registered');
})();
