import { PLATFORM } from './constants';

const NOTIFY_ID = `${PLATFORM}_status`;
const QUOTA_NOTIFY_ID = `${PLATFORM}_quota`;

type ConnectionNotifyState = 'online' | 'offline' | 'error';

const PLATFORM_NAME = { en: 'YouTube', ru: 'YouTube', uk: 'YouTube' };

/**
 * Pushes a replaceable connection-status notification for YouTube.
 * @param state Connection state shown to the user.
 */
export const notifyConnectionStatus = (state: ConnectionNotifyState) => {
  if (state === 'online') {
    notify.Send({
      id: NOTIFY_ID,
      type: 'success',
      title: PLATFORM_NAME,
      message: {
        en: 'Connected',
        ru: 'Подключено',
        uk: 'Підключено',
      },
      temp: true,
    });
    return;
  }

  if (state === 'offline') {
    notify.Send({
      id: NOTIFY_ID,
      type: 'info',
      title: PLATFORM_NAME,
      message: {
        en: 'Disconnected',
        ru: 'Отключено',
        uk: 'Відключено',
      },
      temp: true,
    });
    return;
  }

  notify.Send({
    id: NOTIFY_ID,
    type: 'error',
    title: PLATFORM_NAME,
    message: {
      en: 'Connection error',
      ru: 'Ошибка подключения',
      uk: 'Помилка підключення',
    },
    temp: true,
  });
};

/**
 * Pushes a replaceable quota-limit notification and pauses YouTube updates.
 */
export const notifyQuotaExceeded = () => {
  notify.Send({
    id: QUOTA_NOTIFY_ID,
    type: 'warning',
    title: PLATFORM_NAME,
    message: {
      en: 'YouTube API quota exceeded. Updates paused until the quota resets.',
      ru: 'Превышен лимит YouTube API. Обновление приостановлено до сброса квоты.',
      uk: 'Перевищено ліміт YouTube API. Оновлення призупинено до скидання квоти.',
    },
    temp: true,
  });
};
