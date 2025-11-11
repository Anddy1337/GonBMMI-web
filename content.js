// YT Smart Skip: visualize SponsorBlock segments and auto-skip (cleaned)

const { SB_API, DEFAULT_CATEGORIES, STORAGE_KEYS, CATEGORY_COLORS } = window.YTSmartSkip || {};

let currentVideoId = null;
let sponsorSegments = [];
let lastInSegment = false;
let autoSkipEnabled = false;
let lastVideoEl = null;
let timeUpdateHandler = null;
const segmentCache = new Map();
let categoryColorMap = { ...CATEGORY_COLORS };
let visibleCategories = [...DEFAULT_CATEGORIES];

const TIMELINE_SELECTOR = '.ytp-progress-bar';
const TIMELINE_OVERLAY_SELECTOR = '.sb-timeline';
const FLOATING_SKIP_SELECTOR = '.sb-floating-skip';
const AUTOSKIP_TOGGLE_SELECTOR = '.sb-autoskip-menuitem';

function getVideoElement() { return document.querySelector('video'); }
function getPlayerElement() { return document.querySelector('.html5-video-player'); }

function getVideoIdFromUrl() {
  try {
    const url = new URL(location.href);
    const v = url.searchParams.get('v');
    if (v) return v;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'shorts' && parts[1]) return parts[1];
  } catch (_) {}
  return null;
}

function getVideoId() {
  const playerResp = window.ytInitialPlayerResponse;
  const idFromPlayer = playerResp?.videoDetails?.videoId || null;
  return idFromPlayer || getVideoIdFromUrl();
}

function showToast(message) {
  let el = document.querySelector('.sb-skip-toast');
  if (!el) { el = document.createElement('div'); el.className = 'sb-skip-toast'; document.body.appendChild(el); }
  el.textContent = message; el.style.opacity = '1'; setTimeout(() => { el.style.opacity = '0'; }, 1600);
}

function storageGet(defaults) {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(defaults, (data) => resolve(data));
    } catch (_) {
      const result = { ...defaults };
      Object.keys(defaults).forEach((k) => {
        const raw = localStorage.getItem(k);
        if (raw !== null) { try { result[k] = JSON.parse(raw); } catch { result[k] = raw; } }
      });
      resolve(result);
    }
  });
}

function storageSet(obj) {
  try { chrome.storage.sync.set(obj); } catch (_) {
    Object.keys(obj).forEach((k) => localStorage.setItem(k, JSON.stringify(obj[k])));
  }
}

async function fetchSponsorSegments(videoId, categories) {
  if (!videoId) return [];
  try {
    const categoriesKey = (Array.isArray(categories) ? [...categories].sort().join(',') : '');
    const cacheKey = `${videoId}:${categoriesKey}`;
    if (segmentCache.has(cacheKey)) return segmentCache.get(cacheKey);
    const url = `${SB_API}?videoID=${encodeURIComponent(videoId)}&categories=${encodeURIComponent(JSON.stringify(categories))}`;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`SponsorBlock API ${res.status}`);
    const json = await res.json();
    const list = (Array.isArray(json) ? json : [])
      .map((x) => {
        if (Array.isArray(x?.segment)) return { start: Number(x.segment[0]) || 0, end: Number(x.segment[1]) || 0, category: x.category };
        if (typeof x?.start === 'number' && typeof x?.end === 'number') return { start: x.start, end: x.end, category: x.category };
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);
    segmentCache.set(cacheKey, list);
    return list;
  } catch (_) { return []; }
}

function mountTimelineMarkers() {
  const bar = document.querySelector(TIMELINE_SELECTOR);
  const video = getVideoElement();
  if (!bar || !video) return;
  const duration = Number(video.duration);
  if (!Number.isFinite(duration) || duration <= 0) return;
  const existing = bar.querySelector(TIMELINE_OVERLAY_SELECTOR); if (existing) existing.remove();
  const overlay = document.createElement('div'); overlay.className = 'sb-timeline';
  sponsorSegments.forEach((seg) => {
    const startPct = Math.max(0, Math.min(100, (seg.start / duration) * 100));
    const widthPct = Math.max(0, Math.min(100, ((seg.end - seg.start) / duration) * 100));
    const d = document.createElement('div');
    d.className = `sb-segment cat-${seg.category || 'sponsor'}`;
    d.style.left = `${startPct}%`;
    d.style.width = `${widthPct}%`;
    // Apply per-category color from map
    const cat = seg.category || 'sponsor';
    const hex = categoryColorMap[cat] || CATEGORY_COLORS[cat] || '#FFD700';
    const { r, g, b } = hexToRgb(hex);
    d.style.background = `rgba(${r}, ${g}, ${b}, 0.65)`;
    overlay.appendChild(d);
  });
  bar.style.position = bar.style.position || 'relative';
  bar.appendChild(overlay);
}

function showFloatingSkip() {
  const player = getPlayerElement() || document.body;
  const existing = player.querySelector(FLOATING_SKIP_SELECTOR) || document.querySelector(FLOATING_SKIP_SELECTOR);
  if (existing) return;
  const wrap = document.createElement('div'); wrap.className = 'sb-floating-skip';
  const btn = document.createElement('button'); btn.textContent = 'Skip sponsor'; btn.title = 'Skip current sponsor segment';
  btn.addEventListener('click', skipCurrentSegment);
  wrap.appendChild(btn); player.appendChild(wrap);
}

function hideFloatingSkip() {
  const player = getPlayerElement() || document.body;
  const existing = player.querySelector(FLOATING_SKIP_SELECTOR) || document.querySelector(FLOATING_SKIP_SELECTOR);
  if (existing) existing.remove();
}

function mountAutoSkipInSettings() {
  const gear = document.querySelector('.ytp-settings-button');
  if (!gear) return;
  if (gear.__sbHooked) return; // prevent multiple listeners
  gear.__sbHooked = true;
  gear.addEventListener('click', () => {
    setTimeout(() => {
      const menuRoot = document.querySelector('.ytp-settings-menu')
        || document.querySelector('.ytp-panel-menu')
        || document.querySelector('.ytp-popup');
      if (!menuRoot) return;
      const container = menuRoot.querySelector('.ytp-panel-menu') || menuRoot;
      let item = container.querySelector('.sb-autoskip-menuitem');
      if (!item) {
        item = document.createElement('div'); item.className = 'ytp-menuitem sb-autoskip-menuitem'; item.setAttribute('role','menuitem');
        const label = document.createElement('div'); label.className = 'ytp-menuitem-label'; label.textContent = 'Auto skip';
        const content = document.createElement('div'); content.className = 'ytp-menuitem-content'; content.textContent = autoSkipEnabled ? 'On' : 'Off';
        item.appendChild(label); item.appendChild(content);
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          autoSkipEnabled = !autoSkipEnabled;
          storageSet({ [STORAGE_KEYS.autoSkipEnabled]: autoSkipEnabled });
          content.textContent = autoSkipEnabled ? 'On' : 'Off';
        });
        try { container.appendChild(item); } catch (_) {}
      } else {
        const content = item.querySelector('.ytp-menuitem-content');
        if (content) content.textContent = autoSkipEnabled ? 'On' : 'Off';
      }
    }, 50);
  });
}

function skipCurrentSegment() {
  const video = getVideoElement(); if (!video) return;
  const now = video.currentTime;
  const current = sponsorSegments.find(s => s.start <= now && now < s.end);
  if (current) { video.currentTime = current.end; hideFloatingSkip(); showToast('Skipped sponsor'); }
  else { showToast('No sponsor segment at current time'); }
}

function jumpToNextSegment() {
  const video = getVideoElement(); if (!video) return;
  const now = video.currentTime;
  const next = sponsorSegments.find(s => s.start > now);
  if (next) { video.currentTime = next.start; showToast('Jumped to next segment'); }
  else { showToast('No next segment'); }
}

function jumpToPrevSegment() {
  const video = getVideoElement(); if (!video) return;
  const now = video.currentTime;
  const prevs = sponsorSegments.filter(s => s.start < now);
  const prev = prevs.length ? prevs[prevs.length - 1] : null;
  if (prev) { video.currentTime = prev.start; showToast('Jumped to previous segment'); }
  else { showToast('No previous segment'); }
}

function mountKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (!e.altKey) return;
    if (e.code === 'KeyS') { e.preventDefault(); skipCurrentSegment(); }
    else if (e.code === 'KeyN') { e.preventDefault(); jumpToNextSegment(); }
    else if (e.code === 'KeyP') { e.preventDefault(); jumpToPrevSegment(); }
  }, { passive: false });
}

function applyCategoryStateFromStored(categoriesObj) {
  // categoriesObj: { [cat]: { visible: bool, color: string } }
  const colors = { ...CATEGORY_COLORS };
  const visible = [];
  if (categoriesObj && typeof categoriesObj === 'object') {
    for (const cat of DEFAULT_CATEGORIES) {
      const cfg = categoriesObj[cat];
      if (cfg) {
        if (typeof cfg.color === 'string') colors[cat] = cfg.color;
        if (cfg.visible) visible.push(cat);
      } else {
        // default: visible
        visible.push(cat);
      }
    }
  } else {
    visible.push(...DEFAULT_CATEGORIES);
  }
  categoryColorMap = colors;
  visibleCategories = visible.length ? visible : [...DEFAULT_CATEGORIES];
}

async function setupForVideo() {
  const videoId = getVideoId(); if (!videoId) return;
  if (currentVideoId === videoId && sponsorSegments.length) { mountTimelineMarkers(); mountAutoSkipInSettings(); return; }
  currentVideoId = videoId;
  const data = await storageGet({ [STORAGE_KEYS.categories]: null, [STORAGE_KEYS.autoSkipEnabled]: false });
  applyCategoryStateFromStored(data[STORAGE_KEYS.categories]);
  autoSkipEnabled = Boolean(data[STORAGE_KEYS.autoSkipEnabled]);
  sponsorSegments = await fetchSponsorSegments(videoId, visibleCategories);
  mountTimelineMarkers();
  mountAutoSkipInSettings();
  mountKeyboardShortcuts();

  const video = getVideoElement(); if (!video) return;
  lastInSegment = false;
  if (lastVideoEl && timeUpdateHandler) { try { lastVideoEl.removeEventListener('timeupdate', timeUpdateHandler); } catch (_) {} timeUpdateHandler = null; }
  video.addEventListener('durationchange', () => { mountTimelineMarkers(); }, { passive: true });
  timeUpdateHandler = () => {
    const now = video.currentTime;
    const current = sponsorSegments.find(s => s.start <= now && now < s.end);
    const inSeg = Boolean(current);
    if (inSeg && !lastInSegment) { if (autoSkipEnabled && current) { video.currentTime = current.end; hideFloatingSkip(); showToast('Auto-skipped sponsor'); } else { showFloatingSkip(); } }
    else if (!inSeg && lastInSegment) { hideFloatingSkip(); }
    lastInSegment = inSeg;
  };
  video.addEventListener('timeupdate', timeUpdateHandler, { passive: true });
  lastVideoEl = video;
}

function observeNavigation() {
  window.addEventListener('yt-navigate-finish', () => {
    const timeline = document.querySelector(TIMELINE_OVERLAY_SELECTOR); if (timeline) timeline.remove();
    hideFloatingSkip(); const toggle = document.querySelector(AUTOSKIP_TOGGLE_SELECTOR); if (toggle) toggle.remove();
    sponsorSegments = []; lastInSegment = false;
    if (lastVideoEl && timeUpdateHandler) { try { lastVideoEl.removeEventListener('timeupdate', timeUpdateHandler); } catch (_) {} timeUpdateHandler = null; lastVideoEl = null; }
    setTimeout(setupForVideo, 300);
  });
  const player = getPlayerElement() || document.documentElement;
  const mo = new MutationObserver(() => {
    if (!document.querySelector(TIMELINE_OVERLAY_SELECTOR)) mountTimelineMarkers();
    mountAutoSkipInSettings();
  });
  mo.observe(player, { childList: true, subtree: true });
}

// React to changes from the popup immediately
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes[STORAGE_KEYS.autoSkipEnabled]) {
      autoSkipEnabled = Boolean(changes[STORAGE_KEYS.autoSkipEnabled].newValue);
      const item = document.querySelector('.sb-autoskip-menuitem .ytp-menuitem-content');
      if (item) item.textContent = autoSkipEnabled ? 'On' : 'Off';
    }
    if (changes[STORAGE_KEYS.categories]) {
      const catsObj = changes[STORAGE_KEYS.categories].newValue;
      applyCategoryStateFromStored(catsObj);
      (async () => {
        sponsorSegments = await fetchSponsorSegments(currentVideoId, visibleCategories);
        mountTimelineMarkers();
      })();
    }
  });
} catch (_) {}

// Also respond to direct messages from popup
try {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'categories_updated') {
      (async () => {
        const data = await storageGet({ [STORAGE_KEYS.categories]: null });
        applyCategoryStateFromStored(data[STORAGE_KEYS.categories]);
        sponsorSegments = await fetchSponsorSegments(currentVideoId, visibleCategories);
        mountTimelineMarkers();
      })();
    } else if (msg?.type === 'auto_skip_toggled' && typeof msg.enabled === 'boolean') {
      autoSkipEnabled = msg.enabled;
      const item = document.querySelector('.sb-autoskip-menuitem .ytp-menuitem-content');
      if (item) item.textContent = autoSkipEnabled ? 'On' : 'Off';
    }
  });
} catch (_) {}

function init() {
  const tryInit = () => {
    const video = getVideoElement();
    if (video) { observeNavigation(); setupForVideo(); return true; }
    return false;
  };
  if (!tryInit()) {
    const iv = setInterval(() => { if (tryInit()) clearInterval(iv); }, 500);
    setTimeout(() => clearInterval(iv), 10000);
  }
}

init();
function hexToRgb(hex) {
  try {
    let h = String(hex || '').trim().replace('#','');
    if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    const r = parseInt(h.substring(0,2), 16);
    const g = parseInt(h.substring(2,4), 16);
    const b = parseInt(h.substring(4,6), 16);
    return { r: isNaN(r) ? 255 : r, g: isNaN(g) ? 215 : g, b: isNaN(b) ? 0 : b };
  } catch (_) { return { r: 255, g: 215, b: 0 }; }
}
