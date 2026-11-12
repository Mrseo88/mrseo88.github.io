// Interstitial AdMob al game over, con una frequenza che non rovina il "ancora una volta".
// Nel browser (niente Capacitor) tutto è un no-op: il gioco funziona identico.
(function () {
  // true = annunci di prova Google (obbligatorio mentre testi sul tuo telefono:
  // cliccare i propri annunci reali può far sospendere l'account AdMob).
  // Metti false solo per la build che pubblichi sugli store.
  const TEST_MODE = false;

  const UNITS = {
    android: 'ca-app-pub-1025817158182846/4440628170',
    ios: 'ca-app-pub-1025817158182846/5202036343',
  };

  // Regole di frequenza
  const FIRST_AD_AFTER_GAMES = 5;   // le prime partite in assoluto (per sessione) sono sempre libere
  // Tra un annuncio e l'altro basta UNA delle due: 1 minuto passato oppure 10 partite giocate.
  const MIN_SECONDS_BETWEEN = 60;
  const MIN_GAMES_BETWEEN = 10;
  const MIN_RUN_SECONDS = 8;        // dopo una partita lampo niente annuncio (salvo alla 10ª partita)

  const cap = window.Capacitor;
  const AdMob = cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.AdMob;
  const unit = AdMob ? UNITS[cap.getPlatform()] : null;

  let ready = false, loading = false, showing = false;
  let privacyRequired = false;     // GDPR: serve un pulsante per rivedere il consenso
  let gamesSinceAd = 0, sessionGames = 0;
  let lastAdAt = Date.now();        // conta il tempo dall'apertura dell'app

  function load() {
    if (!unit || ready || loading) return;
    loading = true;
    AdMob.prepareInterstitial({ adId: unit, isTesting: TEST_MODE })
      .then(() => { ready = true; })
      .catch(() => { setTimeout(load, 60000); })   // nessun annuncio/offline: riprova più tardi
      .finally(() => { loading = false; });
  }

  async function init() {
    if (!unit) return;
    try {
      await AdMob.initialize({ initializeForTesting: TEST_MODE });
      // Consenso GDPR (UMP): mostra il modulo solo se richiesto (utenti UE)
      const c = await AdMob.requestConsentInfo();
      if (c.isConsentFormAvailable && c.status === 'REQUIRED') await AdMob.showConsentForm();
      privacyRequired = (await AdMob.requestConsentInfo()).privacyOptionsRequirementStatus === 'REQUIRED';
    } catch (e) { /* senza consenso/rete il gioco va avanti lo stesso */ }
    try {
      // iOS: richiesta App Tracking Transparency, DOPO il modulo GDPR. Va fatta con l'app già attiva,
      // altrimenti iOS la ignora e il popup compare più tardi sopra il gioco.
      if (cap.getPlatform() === 'ios') {
        await new Promise(r => setTimeout(r, 600));
        const t = await AdMob.trackingAuthorizationStatus();
        if (t.status === 'notDetermined') await AdMob.requestTrackingAuthorization();
      }
    } catch (e) {}
    load();
  }

  // Chiamata una volta a ogni game over: dice se questa volta tocca a un annuncio.
  function due({ runSeconds, newRecord }) {
    sessionGames++; gamesSinceAd++;
    return ready && !showing &&
      sessionGames >= FIRST_AD_AFTER_GAMES &&
      (gamesSinceAd >= MIN_GAMES_BETWEEN ||
        ((Date.now() - lastAdAt) / 1000 >= MIN_SECONDS_BETWEEN && runSeconds >= MIN_RUN_SECONDS)) &&
      !newRecord;                    // mai rovinare il momento del record
  }

  // Mostra l'annuncio. La Promise si risolve quando è chiuso (o se non riesce a mostrarsi).
  function show() {
    showing = true; ready = false;
    // showInterstitial si risolve quando l'annuncio APPARE: aspettiamo la chiusura.
    return new Promise(resolve => {
      let done = false;
      const handles = [];
      const finish = () => {
        if (done) return; done = true;
        // addListener può restituire l'handle o una Promise, a seconda di come è chiamato
        handles.forEach(h => Promise.resolve(h).then(x => x.remove()).catch(() => {}));
        showing = false; gamesSinceAd = 0; lastAdAt = Date.now();
        load();
        resolve();
      };
      handles.push(AdMob.addListener('interstitialAdDismissed', finish));
      handles.push(AdMob.addListener('interstitialAdFailedToShow', finish));
      AdMob.showInterstitial().catch(finish);
    });
  }

  function showPrivacy() {
    if (!unit || showing) return;
    AdMob.showPrivacyOptionsForm().catch(() => {});
  }

  window.Ads = { due, show, showPrivacy, privacyRequired: () => privacyRequired };
  init();
})();
