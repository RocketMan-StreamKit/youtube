import type { YoutubeLiveChatMessage } from './api';
import { PLATFORM } from './constants';

export type YoutubeEventUser = {
  channelId: string;
  displayName: string;
  profileImageUrl?: string;
  isModerator?: boolean;
  isOwner?: boolean;
  isMember?: boolean;
};

const userId = (channelId: string) => `youtube:${channelId}`;

const recentMessageIds = new Set<string>();

export const rememberChatMessageId = (id: string) => {
  recentMessageIds.add(id);
  if (recentMessageIds.size > 5000) {
    const first = recentMessageIds.values().next().value;
    if (first) {
      recentMessageIds.delete(first);
    }
  }
};

export const isDuplicateChatMessage = (id?: string) => {
  if (!id) {
    return false;
  }
  return recentMessageIds.has(id);
};

const toEventUser = (message: YoutubeLiveChatMessage): YoutubeEventUser => {
  const author = message.authorDetails;
  return {
    channelId: author?.channelId || 'anonymous',
    displayName: author?.displayName || 'Anonymous',
    profileImageUrl: author?.profileImageUrl,
    isModerator: author?.isChatModerator,
    isOwner: author?.isChatOwner,
    isMember: author?.isChatSponsor,
  };
};

const buildProfile = (user: YoutubeEventUser, extra?: { color?: string }) => ({
  id: userId(user.channelId),
  name: user.displayName,
  avatar: user.profileImageUrl?.trim() || '',
  platform: PLATFORM,
  ...extra,
});

const formatMicros = (amountMicros?: string, currency?: string) => {
  const micros = Number(amountMicros);
  if (!Number.isFinite(micros) || micros <= 0) {
    return { amount: 0, label: currency || '' };
  }
  const amount = micros / 1_000_000;
  const rounded =
    amount >= 100 ? Math.round(amount) : Math.round(amount * 100) / 100;
  return {
    amount: rounded,
    label: currency ? `${rounded} ${currency}` : String(rounded),
  };
};

export const pushLiveStarted = async (streamTitle: string) => {
  return dashboard.addRecord(
    {
      type: 'custom',
      platform: PLATFORM,
      message: streamTitle,
    },
    undefined,
    { trigger: { type: 'custom', key: 'live', value: 1 } }
  );
};

export const pushChatMessage = async (message: YoutubeLiveChatMessage) => {
  const user = toEventUser(message);
  const profile = buildProfile(user);
  const content = message.snippet?.displayMessage?.trim() || '';

  if (!content) {
    return;
  }

  return dashboard.addChatMessage(
    {
      platform: PLATFORM,
      from: profile.id,
      content,
    },
    profile
  );
};

export const pushSuperChat = async (message: YoutubeLiveChatMessage) => {
  const user = toEventUser(message);
  const profile = buildProfile(user);
  const details = message.snippet?.superChatDetails;
  const { amount, label } = formatMicros(
    details?.amountMicros,
    details?.currency
  );
  const comment = details?.userComment?.trim();

  return dashboard.addRecord(
    {
      type: 'donation',
      platform: PLATFORM,
      from: profile.id,
      message: comment || label,
      attach: [
        { type: 'amount', value: String(amount) },
        { type: 'currency', value: details?.currency || '' },
      ],
    },
    profile,
    { trigger: { type: 'custom', key: 'superchat', value: amount } }
  );
};

export const pushSuperSticker = async (message: YoutubeLiveChatMessage) => {
  const user = toEventUser(message);
  const profile = buildProfile(user);
  const details = message.snippet?.superStickerDetails;
  const { amount, label } = formatMicros(
    details?.amountMicros,
    details?.currency
  );

  return dashboard.addRecord(
    {
      type: 'donation',
      platform: PLATFORM,
      from: profile.id,
      message: label,
      attach: [
        { type: 'amount', value: String(amount) },
        { type: 'currency', value: details?.currency || '' },
      ],
    },
    profile,
    { trigger: { type: 'custom', key: 'superchat', value: amount } }
  );
};

export const pushMembership = async (message: YoutubeLiveChatMessage) => {
  const user = toEventUser(message);
  const profile = buildProfile(user);
  const level =
    message.snippet?.newSponsorDetails?.memberLevelName?.trim() ||
    'Channel member';

  return dashboard.addRecord(
    {
      type: 'subscribe',
      platform: PLATFORM,
      from: profile.id,
      message: level,
    },
    profile,
    { trigger: { type: 'subscribe', value: level } }
  );
};

export const pushMemberMilestone = async (message: YoutubeLiveChatMessage) => {
  const user = toEventUser(message);
  const profile = buildProfile(user);
  const details = message.snippet?.memberMilestoneChatDetails;
  const months = details?.memberMonth ?? 0;
  const level = details?.memberLevelName?.trim() || 'Member';
  const comment = details?.userComment?.trim();

  return dashboard.addRecord(
    {
      type: 'subscribe',
      platform: PLATFORM,
      from: profile.id,
      message:
        comment ||
        (months > 0 ? `${level} — ${months} months` : `${level} milestone`),
    },
    profile,
    { trigger: { type: 'subscribe', value: level } }
  );
};

export const pushMembershipGift = async (message: YoutubeLiveChatMessage) => {
  const user = toEventUser(message);
  const profile = buildProfile(user);
  const details = message.snippet?.membershipGiftingDetails;
  const count = details?.giftMembershipsCount ?? 1;
  const level = details?.giftMembershipsLevelName?.trim() || 'Membership';

  return dashboard.addRecord(
    {
      type: 'subscribe',
      platform: PLATFORM,
      from: profile.id,
      message: `Gifted ${count} × ${level}`,
      attach: [{ type: 'count', value: String(count) }],
    },
    profile,
    { trigger: { type: 'subgift', value: count } }
  );
};

export const pushGiftMembershipReceived = async (
  message: YoutubeLiveChatMessage
) => {
  const user = toEventUser(message);
  const profile = buildProfile(user);
  const details = message.snippet?.giftMembershipReceivedDetails;
  const level = details?.giftMembershipsLevelName?.trim() || 'Membership';

  return dashboard.addRecord(
    {
      type: 'subscribe',
      platform: PLATFORM,
      from: profile.id,
      message: `Received gift: ${level}`,
    },
    profile,
    { trigger: { type: 'subgift', value: 1 } }
  );
};

export const handleLiveChatMessage = async (
  message: YoutubeLiveChatMessage
) => {
  if (isDuplicateChatMessage(message.id)) {
    return;
  }
  if (message.id) {
    rememberChatMessageId(message.id);
  }

  const type = message.snippet?.type || 'textMessageEvent';

  switch (type) {
    case 'textMessageEvent':
      await pushChatMessage(message);
      break;
    case 'superChatEvent':
      await pushSuperChat(message);
      break;
    case 'superStickerEvent':
      await pushSuperSticker(message);
      break;
    case 'newSponsorEvent':
      await pushMembership(message);
      break;
    case 'memberMilestoneChatEvent':
      await pushMemberMilestone(message);
      break;
    case 'membershipGiftingEvent':
      await pushMembershipGift(message);
      break;
    case 'giftMembershipReceivedEvent':
      await pushGiftMembershipReceived(message);
      break;
    default:
      break;
  }
};
