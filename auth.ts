import {
  CLIENT_ID,
  OAUTH_AUTHORIZE_URL,
  REDIRECT_URI,
  resolveApiServerUrl,
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

type LocalizedText = {
  en: string;
  ru: string;
  uk: string;
};

/**
 * Picks user-facing copy for the current app UI locale, falling back to English.
 * @param text Per-locale strings (`en`, `ru`, `uk`).
 */
const localize = (text: LocalizedText) => text[LANG.current] || text.en;

const AUTH_MESSAGES = {
  authSuccess: {
    en: 'Authorization successful. You can close this window.',
    ru: 'Авторизация успешна. Можно закрыть это окно.',
    uk: 'Авторизація успішна. Можна закрити це вікно.',
  },
  authCallbackFailed: {
    en: 'Authorization callback failed',
    ru: 'Ошибка обработки авторизации',
    uk: 'Помилка обробки авторизації',
  },
  youtubeAuthFailed: {
    en: 'YouTube authorization failed',
    ru: 'Ошибка авторизации YouTube',
    uk: 'Помилка авторизації YouTube',
  },
  missingAuthCode: {
    en: 'Missing authorization code',
    ru: 'Отсутствует код авторизации',
    uk: 'Відсутній код авторизації',
  },
  tokenExchangeFailed: {
    en: 'Token exchange failed',
    ru: 'Не удалось обменять код на токен',
    uk: 'Не вдалося обміняти код на токен',
  },
  saveAuthDataFailed: {
    en: 'Failed to save authorization data',
    ru: 'Не удалось сохранить данные авторизации',
    uk: 'Не вдалося зберегти дані авторизації',
  },
} as const satisfies Record<string, LocalizedText>;

const formatAuthMessage = (message: unknown, fallback: LocalizedText) => {
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
      return localize(fallback);
    }
  }
  return localize(fallback);
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
          `${localize(AUTH_MESSAGES.youtubeAuthFailed)}: ${error}`
        ),
      };
    }

    const code = extractCodeFromRequest(query, url);
    console.log(`[YouTube] OAuth callback codeLength=${code.length}`);

    if (!code) {
      return {
        redirect: ui.auth.generateFail(localize(AUTH_MESSAGES.missingAuthCode)),
      };
    }

    const params = await api.config.getParams<{ api_server?: string }>();
    YouTubeApi.setApiServer(resolveApiServerUrl(params.api_server));

    const exchanged = await YouTubeApi.exchangeAuthorizationCode(code);
    if (!exchanged.success || !exchanged.accessToken) {
      const message = formatAuthMessage(
        exchanged.message,
        AUTH_MESSAGES.tokenExchangeFailed
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
        AUTH_MESSAGES.saveAuthDataFailed
      );
      return {
        redirect: ui.auth.generateFail(message),
      };
    }

    RegenerateConfig();

    return {
      redirect: ui.auth.generateSuccess(localize(AUTH_MESSAGES.authSuccess)),
    };
  } catch (error) {
    const message = formatAuthMessage(error, AUTH_MESSAGES.authCallbackFailed);
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
