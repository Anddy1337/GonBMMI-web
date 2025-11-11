// Shared constants and helpers for YT Smart Skip (MV3)
(() => {
  const DEFAULT_CATEGORIES = [
    'sponsor',
    'selfpromo',
    'interaction',
    'intro',
    'outro',
    'music_offtopic'
  ];

  const CATEGORY_LABELS = {
    sponsor: 'Sponsor',
    selfpromo: 'Self-promotion',
    interaction: 'Interaction reminders (Like/Subscribe)',
    intro: 'Intro',
    outro: 'Outro',
    music_offtopic: 'Non-music (in music videos)'
  };

  const CATEGORY_COLORS = {
    sponsor: '#ffd700',
    selfpromo: '#ffa500',
    interaction: '#ff69b4',
    intro: '#1e90ff',
    outro: '#8a2be2',
    music_offtopic: '#00ced1'
  };

  // Only the keys we actually use
  const STORAGE_KEYS = {
    categories: 'categories', // { [category]: { visible: boolean, color: string } }
    autoSkipEnabled: 'autoSkipEnabled'
  };

  const SB_API = 'https://sponsor.ajay.app/api/skipSegments';

  window.YTSmartSkip = Object.freeze({
    DEFAULT_CATEGORIES,
    CATEGORY_LABELS,
    CATEGORY_COLORS,
    STORAGE_KEYS,
    SB_API
  });
})();
