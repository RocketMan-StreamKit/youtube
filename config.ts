import { YouTubeApi } from './api';
import {
  buildAuthServerSelectOptions,
  DEFAULT_API_SERVER,
  SCOPES,
} from './constants';
import { mergeYoutubeParams } from './params';
import { startYoutubeTracking, stopYoutubeTracking } from './tracking';

const clearYoutubeAuth = () => {
  stopYoutubeTracking();
  return mergeYoutubeParams({
    access_token: '',
    refresh_token: '',
    token_expires_at: 0,
  }).then(() => {
    YouTubeApi.accessToken = null;
    YouTubeApi.refreshToken = null;
    YouTubeApi.grantedScopes.clear();
    YouTubeApi.clearChannelCache();
    RegenerateConfig();
  });
};

export const RegenerateConfig = () => {
  api.config.getParams().then(params => {
    const access_token = params.access_token || '';
    const refresh_token = params.refresh_token || '';
    const api_server = params.api_server || DEFAULT_API_SERVER;
    const token_expires_at =
      typeof params.token_expires_at === 'number' ? params.token_expires_at : 0;

    YouTubeApi.setApiServer(api_server);
    YouTubeApi.accessToken = access_token || null;
    YouTubeApi.refreshToken = refresh_token || null;

    if (YouTubeApi.accessToken) {
      YouTubeApi.ensureAccessToken(token_expires_at).then(async ok => {
        if (!ok) {
          await clearYoutubeAuth();
          return;
        }

        const scopesOk = await YouTubeApi.validateTokenScopes(SCOPES);
        if (!scopesOk) {
          await clearYoutubeAuth();
          return;
        }

        const channel = await YouTubeApi.getMyChannel();
        if (!channel) {
          await clearYoutubeAuth();
          return;
        }

        startYoutubeTracking(channel);
      });
    } else {
      stopYoutubeTracking();
    }

    const fields: Parameters<typeof GenerateConfig>[0] = [
      {
        key: 'api_server',
        type: 'select',
        default: DEFAULT_API_SERVER,
        options: buildAuthServerSelectOptions(isDeveloperMode),
        editor: {
          label: {
            en: 'API Server',
            ru: 'API сервер',
            uk: 'API сервер',
          },
          description: {
            en: 'Auth server URL (domain + port)',
            ru: 'URL сервера авторизации (домен + порт)',
            uk: 'URL сервера авторизації (домен + порт)',
          },
        },
      },
      {
        key: 'access_token',
        type: 'text',
        default: '',
      },
      {
        key: 'refresh_token',
        type: 'text',
        default: '',
      },
      {
        key: 'token_expires_at',
        type: 'number',
        default: 0,
      },
    ];

    if (access_token) {
      fields.push({
        type: 'button',
        key: 'logout',
        event: 'youtubeLogout',
        editor: { label: { en: 'Logout', ru: 'Выйти', uk: 'Вийти' } },
      });
    } else {
      fields.push({
        type: 'button',
        key: 'login',
        event: 'youtubeLogin',
        editor: {
          label: {
            en: 'Login via YouTube',
            ru: 'Войти через YouTube',
            uk: 'Увійти через YouTube',
          },
        },
      });
    }

    GenerateConfig(fields);
  });
};
