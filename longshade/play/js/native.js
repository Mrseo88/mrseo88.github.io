// LONGSHADE — thin bridge to the native shell (Capacitor). Everything degrades gracefully on the web.
import { ADS_TEST } from './build-flags.js';

const cap = () => window.Capacitor;

export function isNative() {
  try { return !!(cap() && cap().isNativePlatform && cap().isNativePlatform()); } catch (e) { return false; }
}

function plugin(name) {
  try { return isNative() ? cap().Plugins[name] : null; } catch (e) { return null; }
}

// 'light' for landings, 'heavy' for deaths. Native haptics on iOS/Android, vibration API on the web.
export function haptic(strength) {
  try {
    const h = plugin('Haptics');
    if (h) { h.impact({ style: strength === 'heavy' ? 'HEAVY' : 'LIGHT' }); return; }
    if (navigator.vibrate) navigator.vibrate(strength === 'heavy' ? 60 : 8);
  } catch (e) { /* haptics are optional */ }
}

export function initNative({ onBack, onPause }) {
  if (!isNative()) return;
  // System bars are hidden by the SystemBars config in capacitor.config.json.
  try {
    const app = plugin('App');
    app?.addListener('backButton', onBack);
    app?.addListener('pause', onPause);
  } catch (e) { /* optional */ }
  // Hide the launch screen once the first frame is on screen.
  requestAnimationFrame(() => requestAnimationFrame(() => { try { plugin('SplashScreen')?.hide({ fadeOutDuration: 200 }); } catch (e) { /* optional */ } }));
}

export function exitApp() {
  try { plugin('App')?.exitApp(); } catch (e) { /* optional */ }
}

// ---------------------------------------------------------------------------
// AdMob (Android only): one interstitial at most every 5 game overs, never during play.
const ADMOB = {
  interstitial: 'ca-app-pub-1025817158182846/4284322294',
  testInterstitial: 'ca-app-pub-3940256099942544/1033173712', // Google's public test unit
};
let adLoaded = false, adClose = null, privacyRequired = false;

function platform() { try { return cap().getPlatform(); } catch (e) { return 'web'; } }
function admob() { return platform() === 'android' ? plugin('AdMob') : null; }

function loadInterstitial() {
  const ad = admob();
  if (!ad) return;
  adLoaded = false;
  ad.prepareInterstitial({ adId: ADS_TEST ? ADMOB.testInterstitial : ADMOB.interstitial, isTesting: ADS_TEST })
    .then(() => { adLoaded = true; })
    .catch(() => setTimeout(loadInterstitial, 60000));
}

function closed() {
  const cb = adClose;
  adClose = null;
  loadInterstitial();
  if (cb) cb();
}

// Initialise the SDK after asking for consent where the law requires it (Google UMP form).
export async function initAds() {
  const ad = admob();
  if (!ad) return;
  try {
    await ad.initialize({ initializeForTesting: ADS_TEST });
    let canRequestAds = false;
    try {
      let info = await ad.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === 'REQUIRED') info = await ad.showConsentForm();
      privacyRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
      canRequestAds = info.canRequestAds;
    } catch (e) {
      // Usually: no GDPR message configured in AdMob (Privacy & messaging). Production stays ad-free
      // until consent works; test builds carry on so ads can be checked.
      console.warn('AdMob consent unavailable:', e && e.message);
      canRequestAds = ADS_TEST;
    }
    if (!canRequestAds) return;
    ad.addListener('interstitialAdDismissed', closed);
    ad.addListener('interstitialAdFailedToShow', closed);
    loadInterstitial();
  } catch (e) { /* no ads: the game works the same */ }
}

// Shows the interstitial if one is ready. Returns true when it was shown; onClose runs when it is gone.
export function showInterstitial(onClose) {
  const ad = admob();
  if (!ad || !adLoaded) return false;
  adLoaded = false;
  adClose = onClose;
  ad.showInterstitial().catch(closed);
  return true;
}

// EEA/UK users must be able to change their consent: the title screen shows a PRIVACY button.
export function privacyOptionsRequired() { return privacyRequired; }
export function openPrivacyOptions() {
  const ad = admob();
  if (ad) ad.showPrivacyOptionsForm().catch(() => {});
}
