import { YouTubeApi } from './api';
import {
  buildAuthServerSelectOptions,
  DEFAULT_API_SERVER,
  resolveApiServerUrl,
  SCOPES,
} from './constants';
import { mergeYoutubeParams } from './params';
import { startYoutubeTracking, stopYoutubeTracking } from './tracking';

type AddonParams = {
  access_token?: string;
  refresh_token?: string;
  api_server?: string;
  token_expires_at?: number;
  channel_title?: string;
};

const buildLogoutButtonLabel = (channelTitle?: string) => {
  const title = channelTitle?.trim();
  if (!title) {
    return { en: 'Logout', ru: 'Выйти', uk: 'Вийти' };
  }

  return {
    en: `Logout (${title})`,
    ru: `Выйти (${title})`,
    uk: `Вийти (${title})`,
  };
};

const publishConfig = (params: AddonParams) => {
  const access_token = params.access_token || '';
  const channel_title =
    typeof params.channel_title === 'string' ? params.channel_title : '';

  const fields: Parameters<typeof GenerateConfig>[0] = [];

  if (isDeveloperMode) {
    fields.push({
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
    });
  }

  fields.push(
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
    {
      key: 'channel_title',
      type: 'text',
      default: '',
    }
  );

  if (access_token) {
    fields.push({
      type: 'button',
      key: 'logout',
      event: 'youtubeLogout',
      editor: { label: buildLogoutButtonLabel(channel_title) },
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
};

const clearYoutubeAuth = () => {
  stopYoutubeTracking();
  return mergeYoutubeParams({
    access_token: '',
    refresh_token: '',
    token_expires_at: 0,
    channel_title: '',
  }).then(() => {
    YouTubeApi.accessToken = null;
    YouTubeApi.refreshToken = null;
    YouTubeApi.grantedScopes.clear();
    YouTubeApi.clearChannelCache();
    RegenerateConfig();
  });
};

export const RegenerateConfig = () => {
  api.config.getParams<AddonParams>().then(params => {
    const access_token = params.access_token || '';
    const refresh_token = params.refresh_token || '';
    const api_server = resolveApiServerUrl(params.api_server);
    const token_expires_at =
      typeof params.token_expires_at === 'number' ? params.token_expires_at : 0;

    YouTubeApi.setApiServer(api_server);
    YouTubeApi.accessToken = access_token || null;
    YouTubeApi.refreshToken = refresh_token || null;

    publishConfig(params);

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

        const storedTitle =
          typeof params.channel_title === 'string' ? params.channel_title : '';
        if (channel.title && channel.title !== storedTitle) {
          const nextParams = {
            ...params,
            channel_title: channel.title,
          };
          await mergeYoutubeParams({ channel_title: channel.title });
          publishConfig(nextParams);
        }
      });
    } else {
      stopYoutubeTracking();
    }
  });
};
