/** Overlay trigger options exposed in overlay settings UI. */
export const registerYoutubeOverlayTriggers = () => {
  return dashboard.registerTriggers([
    {
      type: 'subscribe',
      label: {
        en: 'Channel membership',
        ru: 'Членство канала',
        uk: 'Членство каналу',
      },
    },
    {
      type: 'subgift',
      label: {
        en: 'Gift membership',
        ru: 'Подарочное членство',
        uk: 'Подарункове членство',
      },
      valueType: 'number',
      valueMatch: 'minimum',
      valueHint: {
        en: 'Minimum gifted memberships at once',
        ru: 'Минимум подаренных членств за раз',
        uk: 'Мінімум подарованих членств за раз',
      },
    },
    {
      type: 'custom',
      key: 'superchat',
      label: {
        en: 'Super Chat / Sticker',
        ru: 'Super Chat / Sticker',
        uk: 'Super Chat / Sticker',
      },
      valueType: 'number',
      valueMatch: 'minimum',
      valueHint: {
        en: 'Minimum amount (in payment currency units)',
        ru: 'Минимальная сумма (в единицах валюты платежа)',
        uk: 'Мінімальна сума (в одиницях валюти платежу)',
      },
    },
    {
      type: 'custom',
      key: 'live',
      label: {
        en: 'Stream went live',
        ru: 'Стрим начался',
        uk: 'Стрім почався',
      },
      valueType: 'number',
      valueHint: {
        en: 'Use 1 to match stream start',
        ru: 'Укажите 1 для старта стрима',
        uk: 'Вкажіть 1 для старту стріму',
      },
    },
  ]);
};
