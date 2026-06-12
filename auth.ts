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

events.On('youtubeLogin', () => {
  api.openUrl(buildAuthUrl());
});

events.On('youtubeLogout', async () => {
  stopYoutubeTracking();
  await mergeYoutubeParams({
    access_token: '',
    refresh_token: '',
    token_expires_at: 0,
  });
  RegenerateConfig();
});

network.endpoints.create('auth', 'GET', 'youtubeAuthCallback');

events.On('youtubeAuthCallback', async ({ query }) => {
  const error = typeof query.error === 'string' ? query.error : '';
  if (error) {
    return {
      redirect: ui.auth.generateFail(`YouTube authorization failed: ${error}`),
    };
  }

  const code = typeof query.code === 'string' ? query.code : '';
  if (!code) {
    return {
      redirect: ui.auth.generateFail('Missing authorization code'),
    };
  }

  const params = await api.config.getParams<{ api_server?: string }>();
  YouTubeApi.setApiServer(params.api_server);

  const exchanged = await YouTubeApi.exchangeAuthorizationCode(code);
  if (!exchanged.success || !exchanged.accessToken) {
    const message = exchanged.message || 'Token exchange failed';
    return {
      redirect: ui.auth.generateFail(message),
    };
  }

  const expiresAt =
    typeof exchanged.expiresIn === 'number'
      ? Date.now() + exchanged.expiresIn * 1000
      : Date.now() + 3600 * 1000;

  await mergeYoutubeParams({
    access_token: exchanged.accessToken,
    refresh_token: exchanged.refreshToken || '',
    token_expires_at: expiresAt,
  });

  RegenerateConfig();

  return {
    redirect: ui.auth.generateSuccess(
      'Authorization successful. You can close this window.'
    ),
  };
});
