import { YouTubeApi, type YoutubeChannel } from './api';
import {
  BROADCAST_CHECK_INTERVAL_MS,
  TOKEN_REFRESH_CHECK_INTERVAL_MS,
} from './constants';
import { pushLiveStarted } from './dashboard-feed';
import { YoutubeLiveChatPoller } from './live-chat';
import { notifyConnectionStatus, notifyQuotaExceeded } from './status-notify';

let starting = false;
let trackingActive = false;
let quotaPaused = false;
let channel: YoutubeChannel | null = null;
let broadcastCheckTimer: ReturnType<typeof setInterval> | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let chatPoller: YoutubeLiveChatPoller | null = null;
let isLive = false;
let currentVideoId: string | null = null;
let currentLiveChatId: string | null = null;

const updateAuthorizedStatus = () => {
  status.Update({
    current: 'online',
    message: {
      en: isLive ? 'YouTube (live)' : 'YouTube',
      ru: isLive ? 'YouTube (эфир)' : 'YouTube',
      uk: isLive ? 'YouTube (ефір)' : 'YouTube',
    },
  });
};

const handleQuotaExceeded = () => {
  if (quotaPaused) {
    return;
  }

  quotaPaused = true;
  console.warn('[YouTube] API quota exceeded, stopping tracking');
  notifyQuotaExceeded();
  status.Update({ current: 'error' });
  stopYoutubeTracking({ notify: false });
};

const stopLiveSession = () => {
  chatPoller?.stop();
  chatPoller = null;
  isLive = false;
  currentVideoId = null;
  currentLiveChatId = null;
  void dashboard.offChatSend();
  updateAuthorizedStatus();
};

const startLiveSession = async (videoId: string, streamTitle: string) => {
  const liveChatId = await YouTubeApi.getLiveChatId(videoId);
  if (!liveChatId) {
    console.warn('[YouTube] Live chat id unavailable for video', videoId);
    return;
  }

  isLive = true;
  currentVideoId = videoId;
  currentLiveChatId = liveChatId;

  chatPoller?.stop();
  chatPoller = new YoutubeLiveChatPoller(() => {
    console.log('[YouTube] Live chat ended');
    stopLiveSession();
  }, handleQuotaExceeded);
  await chatPoller.start(liveChatId);

  void dashboard.onChatSend(async ({ text }) => {
    if (!YouTubeApi.accessToken || !currentLiveChatId) {
      throw new Error('YouTube live chat is not active');
    }
    const params = await api.config.getParams<{ token_expires_at?: number }>();
    await YouTubeApi.ensureAccessToken(params.token_expires_at);
    const sent = await YouTubeApi.sendLiveChatMessage(currentLiveChatId, text);
    if (!sent) {
      throw new Error('YouTube chat message was not sent');
    }
  });

  await pushLiveStarted(streamTitle);
  updateAuthorizedStatus();
  console.log(`[YouTube] Live session started (${videoId})`);
};

const checkBroadcast = async () => {
  if (!trackingActive || !YouTubeApi.accessToken || !channel?.id) {
    return;
  }

  let params: { token_expires_at?: number };
  try {
    params = await api.config.getParams<{ token_expires_at?: number }>();
  } catch (error) {
    console.warn('[YouTube] Broadcast check skipped:', error);
    return;
  }
  const tokenOk = await YouTubeApi.ensureAccessToken(params.token_expires_at);
  if (!tokenOk) {
    status.Update({ current: 'error' });
    notifyConnectionStatus('error');
    return;
  }

  const liveResult = await YouTubeApi.getActiveLiveVideo(channel.id);
  if (liveResult.quotaExceeded) {
    handleQuotaExceeded();
    return;
  }

  const liveVideo = liveResult.video;
  if (!liveVideo) {
    if (isLive) {
      console.log('[YouTube] Stream ended');
      stopLiveSession();
    }
    return;
  }

  if (!isLive) {
    await startLiveSession(liveVideo.videoId, liveVideo.title);
    return;
  }

  if (currentVideoId !== liveVideo.videoId) {
    console.log('[YouTube] Switched to a new live video');
    stopLiveSession();
    await startLiveSession(liveVideo.videoId, liveVideo.title);
  }
};

export const startYoutubeTracking = async (resolvedChannel: YoutubeChannel) => {
  if (starting || !YouTubeApi.accessToken) {
    return;
  }

  starting = true;
  quotaPaused = false;
  stopYoutubeTracking();
  status.Update({ current: 'connecting' });

  try {
    channel = resolvedChannel;

    await checkBroadcast();

    if (!broadcastCheckTimer) {
      broadcastCheckTimer = setInterval(() => {
        void checkBroadcast();
      }, BROADCAST_CHECK_INTERVAL_MS);
    }

    if (!refreshTimer) {
      refreshTimer = setInterval(() => {
        void (async () => {
          if (!trackingActive || !YouTubeApi.accessToken) {
            return;
          }
          try {
            const params = await api.config.getParams<{
              token_expires_at?: number;
            }>();
            await YouTubeApi.ensureAccessToken(params.token_expires_at);
          } catch (error) {
            console.warn('[YouTube] Token refresh skipped:', error);
          }
        })();
      }, TOKEN_REFRESH_CHECK_INTERVAL_MS);
    }

    trackingActive = true;
    updateAuthorizedStatus();
    notifyConnectionStatus('online');
    console.log(
      `[YouTube] Tracking started for channel ${channel.id} (${channel.title})`
    );
  } catch (error) {
    console.error('YouTube tracking failed to start:', error);
    status.Update({ current: 'error' });
    notifyConnectionStatus('error');
    stopYoutubeTracking({ notify: false });
  } finally {
    starting = false;
  }
};

export const stopYoutubeTracking = (options?: { notify?: boolean }) => {
  trackingActive = false;
  stopLiveSession();
  channel = null;

  if (broadcastCheckTimer) {
    clearInterval(broadcastCheckTimer);
    broadcastCheckTimer = null;
  }
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  status.Update({ current: 'offline' });
  if (options?.notify !== false) {
    notifyConnectionStatus('offline');
  }
};
