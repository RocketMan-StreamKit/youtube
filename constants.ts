export const PLATFORM = 'youtube';

export const CLIENT_ID =
  '758178996361-u9ico6r67sbaatemsduua6k784tdn78h.apps.googleusercontent.com';

export const DEFAULT_API_SERVER = 'https://rocketman-streams.com:2083';
export const AUTH_SERVER_RU_URL = 'https://ru.rocketman-streams.com:2083';
export const AUTH_SERVER_LOCAL_URL = 'http://localhost:2082';

export const buildAuthServerSelectOptions = (includeLocalhost: boolean) => {
  const urlLabel = (url: string) => ({
    en: url,
    ru: url,
    uk: url,
  });

  const options = [
    { value: DEFAULT_API_SERVER, label: urlLabel(DEFAULT_API_SERVER) },
    { value: AUTH_SERVER_RU_URL, label: urlLabel(AUTH_SERVER_RU_URL) },
  ];

  if (includeLocalhost) {
    options.push({
      value: AUTH_SERVER_LOCAL_URL,
      label: urlLabel(AUTH_SERVER_LOCAL_URL),
    });
  }

  return options;
};

export const REDIRECT_URI = 'http://localhost:3000/addon/youtube/auth';

export const OAUTH_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/auth';

export const API_BASE = 'https://www.googleapis.com/youtube/v3';

export const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

/** Scopes for live broadcast polling, chat read, and chat send. */
export const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
] as const;

export const BROADCAST_CHECK_INTERVAL_MS = 45_000;

export const TOKEN_REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000;
