import './auth';
import { RegenerateConfig } from './config';
import { PLATFORM } from './constants';
import { registerYoutubeOverlayTriggers } from './triggers';

void dashboard.registerPlatform({
  id: PLATFORM,
  name: {
    en: 'YouTube',
    ru: 'YouTube',
    uk: 'YouTube',
  },
});

void registerYoutubeOverlayTriggers();

status.OnClick(() => {
  api.restart();
});

RegenerateConfig();
