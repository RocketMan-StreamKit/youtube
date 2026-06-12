import { YouTubeApi } from './api';
import { handleLiveChatMessage } from './dashboard-feed';

export class YoutubeLiveChatPoller {
  private liveChatId: string | null = null;
  private pageToken: string | undefined;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private onOffline: (() => void) | undefined;
  private onQuotaExceeded: (() => void) | undefined;

  constructor(onOffline?: () => void, onQuotaExceeded?: () => void) {
    this.onOffline = onOffline;
    this.onQuotaExceeded = onQuotaExceeded;
  }

  async start(liveChatId: string) {
    this.stop();
    this.liveChatId = liveChatId;
    this.pageToken = undefined;
    this.stopped = false;
    await this.poll();
  }

  stop() {
    this.stopped = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.liveChatId = null;
    this.pageToken = undefined;
  }

  isRunning() {
    return !this.stopped && Boolean(this.liveChatId);
  }

  private scheduleNext(delayMs: number) {
    if (this.stopped) {
      return;
    }
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    this.pollTimer = setTimeout(() => {
      void this.poll();
    }, delayMs);
  }

  private async poll() {
    if (this.stopped || !this.liveChatId) {
      return;
    }

    const result = await YouTubeApi.listLiveChatMessages(
      this.liveChatId,
      this.pageToken
    );

    if (!result) {
      this.scheduleNext(10_000);
      return;
    }

    if (result.quotaExceeded) {
      this.stop();
      this.onQuotaExceeded?.();
      return;
    }

    if (result.offlineAt) {
      this.stop();
      this.onOffline?.();
      return;
    }

    for (const item of result.items) {
      await handleLiveChatMessage(item);
    }

    if (result.nextPageToken) {
      this.pageToken = result.nextPageToken;
    }

    this.scheduleNext(Math.max(result.pollingIntervalMillis, 1000));
  }
}
