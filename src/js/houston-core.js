const __HA_CFG = { baseUrl: '/', isDev: false };
let __booted = false;
let __recallFn = null;
let __applyHiddenFn = null;

export function initHouston(opts) {
  if (opts) {
    if (typeof opts.baseUrl === 'string') __HA_CFG.baseUrl = opts.baseUrl;
    if (typeof opts.isDev === 'boolean') __HA_CFG.isDev = opts.isDev;
  }
  if (__booted) { if (__applyHiddenFn) __applyHiddenFn(); return; }
  __booted = true;
  haBoot();
}

export function recallHouston() { if (__recallFn) { __recallFn(); } }

function haBoot() {

/**
   * Houston asistanı mantığı.
   * Proje deseniyle uyumlu: dinleyiciler document üzerinde delegation kurar
   * (Header.astro / Sidebar.astro ile aynı), böylece sayfa geçişlerinde de çalışır.
   */
  const PERPLEXITY_NEW = 'https://www.perplexity.ai/search/new?q=';
  const MAX_BODY = 6000; // Site araması yoksa yedek sayfa içeriği üst sınırı

  function renderMsg(role, text, opts) {
    const box = document.getElementById('houston-msgs');
    if (!box) return null;
    const el = document.createElement('div');
    const kind = role === 'user' ? 'user' : 'bot';
    el.className = 'ha-msg ha-msg--' + kind + (opts && opts.typing ? ' ha-msg--typing' : '');
    el.textContent = text;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    return el;
  }

  /** Mesaj ekler — hiçbir yere kaydedilmez, hiçbir geçmiş tutulmaz. */
  function pushMsg(role, text) {
    return renderMsg(role, text);
  }

  /** Perplexity bağlantısını sohbette bırakır (popup engellenirse yedek). */
  function pushLinkMsg(url) {
    const box = document.getElementById('houston-msgs');
    if (!box) return null;
    const el = document.createElement('div');
    el.className = 'ha-msg ha-msg--bot';
    const label = document.createElement('span');
    label.textContent = 'Yanıtın hazır, Operatör — ';
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Perplexity’de aç';
    el.append(label, link);
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    return el;
  }

  /* ---------------- Houston karakteri (canlı buton) ---------------- */

  /** Eklentinin poz tablosu — butonda kullanılanlar. */
  const HA_POSES = {
    default: ['circle', 'half-up', 'circle'],
    happy: ['half-down', 'half-up', 'half-down'],
    wink: ['circle', 'half-up', 'bar'],
    shocked: ['circle-stroke', 'bar', 'circle-stroke'],
    sad: ['circle', 'half-down-bottom', 'circle'],
    grumpy: ['half-up', 'half-up-bottom', 'half-up'],
    cry: ['half-up', 'half-up-bottom', 'half-up'],
    sleep: ['bar', 'bar', 'bar'],
    love: ['heart', 'half-up', 'heart'],
  };
  const HA_MOUTHS = [
    'circle-small',
    'square',
    'square-small',
    'bar',
    'circle-small',
    'square-small',
  ];
  const HA_EYES = ['circle', 'half-down', 'circle-small', 'square'];

  /** İmleç takibi yalnızca panel açıkken çalışır; kapalıyken karakter sakin durur. */
  let haTracking = false;
  /** Balon okunurken Houston'ı canlandırma durumu (panel mantığından bağımsız). */
  let haBarkAlive = false;
  let haRect = null;
  let haBlinkTimer = 0;
  let haTalkTimer = 0;
  let haWakeT1 = 0;
  let haWakeT2 = 0;
  let haWakeT3 = 0;
  let haPose = 'default'; // aktif poz — göz kırpma aralığını uzatmak için izlenir

  function haParts() {
    const fab = document.getElementById('houston-fab');
    if (!fab) return null;
    const eyes = fab.querySelectorAll('.eye');
    const mouth = fab.querySelector('.mouth');
    if (eyes.length < 2 || !mouth) return null;
    return { fab, left: eyes[0], right: eyes[eyes.length - 1], mouth };
  }

  /** [göz0, ağız, göz1] biçimindeki pozu uygular. */
  function haSetPose(name) {
    const p = haParts();
    if (!p) return;
    haPose = name;
    const [eye0, mouth, eye1] = HA_POSES[name] || HA_POSES.default;
    p.left.dataset.shape = eye0;
    p.mouth.dataset.shape = mouth;
    p.right.dataset.shape = eye1;
  }

  function haCacheRect() {
    const fab = document.getElementById('houston-fab');
    haRect = fab ? fab.getBoundingClientRect() : null;
  }

  /** İmlece göre yüzün bakışı (--x/--y) ve kenarlık gradient'i (--deg) güncellenir. */
  function haOnPointerMove(event) {
    if ((!haTracking && !haBarkAlive) || haSleeping) return;
    if (!haRect) haCacheRect();
    const r = haRect;
    if (!r || !r.width || !r.height) return;
    const fab = document.getElementById('houston-fab');
    if (!fab) return;
    const x = Math.max(-1, Math.min(1, (event.clientX - r.x) / r.width - 0.5));
    const y = Math.max(-1, Math.min(1, (event.clientY - r.y) / r.height - 0.5));
    const deg = Math.abs((Math.atan2(-y, -x) * 180) / Math.PI);
    fab.style.setProperty('--x', x.toFixed(2));
    fab.style.setProperty('--y', y.toFixed(2));
    fab.style.setProperty('--deg', (-35 * Math.abs(deg / 180)).toFixed(1) + 'deg');
  }

  /** Panel açılınca Houston canlanır (poz + göz kırpma), kapatınca sakinleşir. */
  function haSetActive(active) {
    haTracking = active;
    clearTimeout(haBlinkTimer);
    const fab = document.getElementById('houston-fab');
    if (!fab) return;

    if (!active) {
      fab.style.setProperty('--x', '0');
      fab.style.setProperty('--y', '0');
      fab.style.setProperty('--deg', '0deg');
      haStopTalk();
      haSetPose('default');
      return;
    }

    haCacheRect();
    // Buton büyüme animasyonu bitince ölçü tazelenir (imleç merkezi kayar).
    setTimeout(() => {
      if (haTracking) haCacheRect();
    }, 400);

    // Karşılama: gülümse → göz kırp → devam.
    // (Uyku guard'lı: panel açılıp hemen soru gönderilirse uyku pozunu ezmesin.)
    if (!haPerforming) haSetPose('happy');
    setTimeout(() => {
      if (haTracking && !haSleeping && !haPerforming) haSetPose('wink');
    }, 900);
    setTimeout(() => {
      if (haTracking && !haSleeping && !haPerforming) haSetPose('happy');
    }, 1500);

    haBlinkTimer = setTimeout(haBlinkLoop, 5400);
  }

  /**
   * Göz kırpma döngüsü. Uykuda HİÇ çalışmaz (guard + zamanlayıcı temizliği ile
   * tamamen durur); uyanınca haWake() tarafından yeniden başlatılır.
   */
  function haBlinkLoop() {
    const p = haParts();
    if (!p || (!haTracking && !haBarkAlive) || haSleeping || haPerforming) return;
    const prev = [p.left.dataset.shape, p.mouth.dataset.shape, p.right.dataset.shape];
    p.left.dataset.shape = 'half-down';
    p.right.dataset.shape = 'half-down';
    setTimeout(() => {
      const q = haParts();
      if (!q) return;
      // Bu pencereye rastlayarak uykuya geçildiyse gözleri "prev"e DEĞİL,
      // uyku pozuna çek — yoksa kırpma uyku gözlerini ezer.
      if (haSleeping) {
        haSetPose('sleep');
        return;
      }
      q.left.dataset.shape = prev[0];
      q.mouth.dataset.shape = prev[1];
      q.right.dataset.shape = prev[2];
    }, 120);
    // Grumpy pozundayken göz kırpma aralığını 3 katına uzat (somurtkan, daha az kırpar).
    const haBlinkGap = haPose === 'grumpy'
      ? 3 * (7200 + Math.random() * 7800)
      : 7200 + Math.random() * 7800;
    haBlinkTimer = setTimeout(haBlinkLoop, haBlinkGap);
  }

  /** Yanıt beklenirken ağız konuşma animasyonu yapar (eklentinin talk() mantığı). */
  function haTalk() {
    haStopTalk();
    const loop = () => {
      const p = haParts();
      if (!p || !haTracking || haSleeping) return;
      p.mouth.dataset.shape = HA_MOUTHS[Math.floor(Math.random() * HA_MOUTHS.length)];
      p.mouth.dataset.shape = HA_MOUTHS[Math.floor(Math.random() * HA_MOUTHS.length)];
      if (Math.random() < 0.3) {
        const eye = HA_EYES[Math.floor(Math.random() * HA_EYES.length)];
        p.left.dataset.shape = eye;
        p.right.dataset.shape = eye;
      }
      haTalkTimer = setTimeout(loop, 70 + Math.random() * 90);
    };
    loop();
  }

  function haStopTalk() {
    clearTimeout(haTalkTimer);
    haTalkTimer = 0;
    if (haTracking && !haSleeping) haSetPose('happy');
  }

  /* ---------------- Easter egg durumları ---------------- */

  const HA_IDLE_GRUMPY = 60000; // panel açık, 1 dk yazı yok → somurtur
  const HA_IDLE_SAD = 300000; // 5 dk → üzülür
  const HA_IDLE_SLEEP = 600000; // 10 dk → uyku moduna geçer
  const HA_SHOCK_LEN = 50; // bu uzunlukta soru → şok

  let haIdleTimer = 0;
  let haIdleStage = 0;
  let haIdleClosedTimer = 0;
  let haIdleClosedActive = false;
  let haSleeping = false;
  let haSleepAt = 0; // uykuya geçiş zamanı — hemen sonraki focus'ları yoksaymak için
  const HA_WAKE_GRACE = 2500; // ms — window.open sonrası anlık odak darbesine karşı bekleme


  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let haPerforming = false; // diyalog sahnesi sürerken karşılama/blink pozları ezmesin

  /** Panel açıkken yazı yazılmazsa somurtur → üzülür → uykuya geçer. Her yazımda sıfırlanır. */
  function haResetIdle() {
    clearTimeout(haIdleTimer);
    haIdleStage = 0;
    if (haTracking && !haSleeping) haSetPose('happy');
    haIdleTimer = setTimeout(() => {
      if (!haTracking || haSleeping) return;
      haIdleStage = 1;
      haSetPose('grumpy');
      haIdleTimer = setTimeout(() => {
        if (!haTracking || haSleeping) return;
        haIdleStage = 2;
        haSetPose('sad');
        // Sad moduna geçince sohbete üzgün mesajı yazılır.
        pushMsg('bot', 'Operatör, Beni unuttun galiba…');
        haIdleTimer = setTimeout(() => {
          if (!haTracking || haSleeping) return;
          haIdleStage = 3;
          haSleep();
        }, HA_IDLE_SLEEP - HA_IDLE_SAD);
      }, HA_IDLE_SAD - HA_IDLE_GRUMPY);
    }, HA_IDLE_GRUMPY);
  }

  /** Panel kapalıyken 10 dk boyunca Houston'a hiç dokunulmazsa uyku moduna
   *  geçer (kapalı gözler + z z z). Panel açılırsa/tıklanırsa anında iptal edilir. */
  function haResetIdleClosed() {
    clearTimeout(haIdleClosedTimer);
    const fab = document.getElementById('houston-fab');
    if (haIdleClosedActive) {
      haIdleClosedActive = false;
      if (fab) fab.classList.remove('ha-love');
      if (!haSleeping) haSetPose(haTracking ? 'happy' : 'default');
    }
    haIdleClosedTimer = setTimeout(() => {
      // Uyku ve açık panel durumlarında tetiklenmez
      if (haSleeping) return;
      const panel = document.getElementById('houston-panel');
      if (panel && !panel.hidden) return;
      const el = document.getElementById('houston-fab');
      if (!el || el.classList.contains('ha-gone')) return;
      haSleep();
    }, HA_IDLE_SLEEP);
  }

  /** Soru gönderildikten sonra: kullanıcı sayfaya dönene kadar uyur. */
  function haSleep() {
    const fab = document.getElementById('houston-fab');
    if (!fab) return;
    haSleeping = true;
    haSleepAt = Date.now();
    fab.classList.add('ha-sleep');
    // Göz kırpmayı TAMAMEN durdur: zamanlayıcıyı sil, uykuda hiç tetiklenmesin.
    clearTimeout(haBlinkTimer);
    // Uykuda imleci takip etmeyi bırak: yüz merkeze/öne, yorgun duruşa dönsün.
    fab.style.setProperty('--x', '0');
    fab.style.setProperty('--y', '0');
    fab.style.setProperty('--deg', '0deg');
    haSetPose('sleep');
  }

  function haWake() {
    const fab = document.getElementById('houston-fab');
    if (!fab || !haSleeping) return;
    // window.open yeni sekme açarken mevcut pencereye anlık focus/blur darbesi
    // gelebiliyor; bu, kullanıcının gerçekten dönmesi değil. Kısa bir süre yoksay.
    if (Date.now() - haSleepAt < HA_WAKE_GRACE) return;
    haSleeping = false;
    fab.classList.remove('ha-sleep');

    // Kademeli uyanma: önce zzz kesilir (yüz hâlâ uykulu), sonra tek göz
    // açılır, ardından diğeri, en son mutlu hâle geçer.
    clearTimeout(haWakeT1);
    clearTimeout(haWakeT2);
    clearTimeout(haWakeT3);
    fab.classList.add('ha-waking');
    const p = haParts();
    // 1) zzz kesildi; gözler kapalı çizgide, yüz merkezden kalkar.
    if (p) { p.left.dataset.shape = 'bar'; p.right.dataset.shape = 'bar'; }
    haPose = 'default';
    // 2) sağ göz yavaşça açılır.
    haWakeT1 = setTimeout(() => {
      const q = haParts();
      if (q) q.right.dataset.shape = 'circle';
    }, 320);
    // 3) sol göz daire olur (mutlu hâlden ÖNCE, yoksa happy pozunu ezer).
    haWakeT2 = setTimeout(() => {
      const q = haParts();
      if (q) q.left.dataset.shape = 'circle';
    }, 840);
    // 4) mutlu hâle geç: gülümseyen ağız + parlak kenarlık.
    haWakeT3 = setTimeout(() => {
      fab.classList.remove('ha-waking');
      haSetPose(haTracking ? 'happy' : 'default');
      if (haTracking) {
        // Uyku blink döngüsünü öldürmüştü; panel açıksa göz kırpmayı yeniden başlat.
        clearTimeout(haBlinkTimer);
        haBlinkTimer = setTimeout(haBlinkLoop, 5400);
        // Ölçü tazelenir ki uyanıştan hemen sonraki ilk harekette takip doğru olsun.
        haCacheRect();
      }
      haResetIdle();
      haResetIdleClosed();
    }, 1300);
  }

  /** Perplexity ikonunu sayfanın en üst ortasına fırlatır. */
  function haThrowIcon() {
    const el = document.getElementById('ha-throw');
    if (!el) return;
    el.classList.remove('ha-throw--go');
    void el.offsetWidth; // animasyonu yeniden başlat
    el.classList.add('ha-throw--go');
  }

  /** Kapat tusu: hideHouston=true yazilir, loader sag alttaki geri
   *  cagirma sekmesini gosterir. Sonraki sayfalarda cekirdek HIC yuklenmez. */
  const HA_HIDE_KEY = 'hideHouston';
  function haIsHidden() {
    try {
      return localStorage.getItem(HA_HIDE_KEY) === 'true';
    } catch { return false; }
  }
  function haApplyHidden() {
    const fab = document.getElementById('houston-fab');
    const radio = document.getElementById('ha-gate-radio') || document.getElementById('houston-radio');
    const panel = document.getElementById('houston-panel');
    const bubble = document.getElementById('houston-bubble');
    if (haIsHidden()) {
      // GİZLİ: FAB gider, sağ altta geri çağırma sekmesi belirir.
      if (fab) fab.classList.add('ha-gone');
      if (radio instanceof HTMLButtonElement) radio.hidden = false;
      if (panel) panel.hidden = true;
      if (bubble) bubble.classList.remove('ha-bubble--show');
      // Kapatıldıysa periyodik sahneleri de çalıştırma.
      clearTimeout(haIdleTimer);
      clearTimeout(haIdleClosedTimer);
    } else {
      // AÇIK: FAB görünür, sekme gizli.
      if (fab) fab.classList.remove('ha-gone');
      if (radio instanceof HTMLButtonElement) radio.hidden = true;
    }
  }
  function haSulk() {
    const fab = document.getElementById('houston-fab');
    if (!fab) return;
    setOpen(false);
    clearTimeout(haIdleTimer);
    clearTimeout(haIdleClosedTimer);
    try { localStorage.setItem(HA_HIDE_KEY, 'true'); } catch {}
    fab.classList.remove('ha-crying');
    // Loader'a haber ver: sag alttaki geri cagirma sekmesi belirir.
    document.dispatchEvent(new CustomEvent('ha:hidden'));
    haApplyHidden();
  }

  /** Telsizle geri cagirma repligi:
   *  Kullanici: "Houston, bir problemimiz var"
   *  Houston:  "Ciddimisin? 56 yildir problem cozuyorum"
   *  Houston konusurken agiz hareket eder (haTalk), yazi typing/fade-in ile
   *  agiz hareketine uyumlu cikar.
   *
   *  KURTARMA: tarayicida eski 'houston:hidden' anahtari takiliysa da
   *  Houston gorunmez. Konsoldan:
   *    localStorage.removeItem('hideHouston');
   *    localStorage.removeItem('houston:hidden'); location.reload();
   */
  async function haRecall() {
    const fab = document.getElementById('houston-fab');
    const radio = document.getElementById('ha-gate-radio') || document.getElementById('houston-radio');
    if (!fab) return;
    if (radio instanceof HTMLButtonElement) radio.hidden = true;
    // Gizlilik tercihini kaldir: artik her sayfada gorunur (eski anahtar dahil).
    try { localStorage.setItem(HA_HIDE_KEY, 'false'); } catch {}
    try { localStorage.removeItem('houston:hidden'); } catch {}

    haPerforming = true;
    // Houston geri döner
    fab.classList.remove('ha-gone', 'ha-crying', 'ha-sleep');
    haSleeping = false;
    haSetPose('happy');
    // Tüm eski mesajlar silinir, WELCOME eklenmeden panel bomboş açılır.
    setOpen(true, { skipWelcome: true });

    pushMsg('user', 'Houston, bir problemimiz var');

    // Kısa duraklama → "yazıyor" göstergesi
    await sleep(700);
    const typing = renderMsg('bot', '…', { typing: true });

    // Houston yanıtı: typing/fade-in + ağız hareketi uyumlu
    await sleep(900);
    if (typing) typing.remove();
    haSetPose('wink');
    haTalk();
    await haTypeText('bot', 'Ciddimisin? 56 yıldır problem çözüyorum');
    haStopTalk();
    haSetPose('happy');

    haPerforming = false;
    haResetIdle();
    haResetIdleClosed();
  }

  /** Mesajı kelime kelime fade-in ile yazar; ağız haTalk sayesinde konuşur.
   *  Kelime başı ~90ms sürer — haTalk kareleriyle (~130-300ms) aynı tempoda.
   */
  async function haTypeText(role, text) {
    const box = document.getElementById('houston-msgs');
    if (!box) return;
    const kind = role === 'user' ? 'user' : 'bot';
    const el = document.createElement('div');
    el.className = 'ha-msg ha-msg--' + kind + ' ha-msg--typewriter';
    box.appendChild(el);
    const words = text.split(' ');
    for (let i = 0; i < words.length; i++) {
      const span = document.createElement('span');
      span.className = 'ha-word';
      span.textContent = (i > 0 ? ' ' : '') + words[i];
      el.appendChild(span);
      box.scrollTop = box.scrollHeight;
      // Kelime akışını başlat (fade-in)
      requestAnimationFrame(() => requestAnimationFrame(() => span.classList.add('ha-word--in')));
      await sleep(90);
    }
  }

  /** Panel her açıldığında Houston'ın selamı. */
  const WELCOME = 'Tekrar hoş geldin, Operatör';

  /** Panel her açıldığında sohbet sıfırlanır: yalnızca karşılama mesajı kalır. */
  function resetChat() {
    const box = document.getElementById('houston-msgs');
    if (!box) return;
    box.replaceChildren();
    renderMsg('bot', WELCOME);
  }

  function setOpen(open, opts) {
    const panel = document.getElementById('houston-panel');
    const fab = document.getElementById('houston-fab');
    if (!panel || !fab) return;
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
    haSetActive(open);
    if (open) {
      // Panel açılırsa love sahnesi derhal biter (sayaç da sıfırlanır).
      haResetIdleClosed();
      // Geri çağırma sahnesinde WELCOME mesajı istenmez: panel bomboş açılır.
      const skipWelcome = !!(opts && opts.skipWelcome);
      if (skipWelcome) {
        const box = document.getElementById('houston-msgs');
        if (box) box.replaceChildren();
      } else {
        resetChat();
      }
      clearLive();
      haResetIdle();
      haResetIdleClosed();
      const input = document.getElementById('houston-input');
      if (input instanceof HTMLTextAreaElement) {
        input.value = '';
        input.style.height = 'auto';
        input.focus();
      }
    }
  }

  /** Sayfa başlığı: h1 yoksa <title>'ın site adı kısmını al. */
  function getPageTitle() {
    const h1 = document.querySelector('main h1, h1.page-title');
    const fromH1 = h1 && h1.textContent ? h1.textContent.trim() : '';
    if (fromH1) return fromH1;
    return document.title.replace(/\s*[|·–-]\s*Elektronik.*$/, '').trim() || document.title;
  }

  /** <main> içindeki okunabilir metni toplar (menü/form/script'ler hariç). */
  function getPageContent() {
    const main = document.querySelector('main');
    if (!main) return '';
    const clone = main.cloneNode(true);
    clone
      .querySelectorAll('script, style, noscript, svg, nav, button, iframe, form')
      .forEach((node) => node.remove());
    const raw = clone.innerText || '';
    return raw
      .replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, MAX_BODY);
  }

  /* ---------------- Pagefind (Starlight site araması) ---------------- */

  /** Modül bir kez yüklenir; astro dev'de indeks olmadığından null döner. */
  let pagefindPromise = null;

  function haPagefindBase() {
    try {
      var u = new URL(haGetCfg().baseUrl, location.href);
      var p = u.pathname || '/';
      if (!p.endsWith('/')) p += '/';
      return u.origin + p;
    } catch (e) { return '/'; }
  }

  function loadPagefind() {
    if (!pagefindPromise) {
      const base = haPagefindBase();
      pagefindPromise = import(/* @vite-ignore */ base + 'pagefind/pagefind.js')
        .then((pf) => {
          // Sonuç URL'lerine base path eklensin (Starlight araması da aynısını yapar).
          if (pf && typeof pf.options === 'function') {
            try {
              pf.options({ baseUrl: base });
            } catch {
              /* ikinci çağrılarda hata atarsa yoksay */
            }
          }
          return pf;
        })
        .catch(() => null);
    }
    return pagefindPromise;
  }

  /** Bölüm başına excerpt uzunluğu (yalnızca sorguyla ilgili kısım gider). */
  const EXCERPT_LEN = 300;
  /** Tek excerpt tavanı + prompt gövde tavanı + URL tavanı (sekme çökmesin). */
  const EXCERPT_MAX = 600;
  const PROMPT_BODY_MAX = 3000;
  const URL_MAX = 8000;
  /** Yapay zekâya giden bağlam: her zaman en iyi eşleşen ilk 2 bölüm. */
  const SEARCH_TOP_N = 2;

  /** Sorguyu Türkçe duyarlı terimlere ayırır (en az2 karakterli olanlar). */
  function queryTerms(query) {
    return String(query || '')
      .toLocaleLowerCase('tr')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length >= 2);
  }

  /**
   * 5N1K temizleyici: kullanıcının tam sorusundan (`MOSFET nedir?`,
   * `Direnç nasıl çalışır?`, `Ohm kanunu hakkında bilgi ver`) yalnızca
   * Pagefind'de aranacak çekirdek terimi (`MOSFET`, `Direnç`, `Ohm kanunu`)
   * çıkarır. Yapay zekâya giden soru ASLA kısaltılmaz — orijinal cümle +
   * bu terimle bulunan bağlam yollanır.
   */
  const HA_STOPWORDS = new Set([
  // 5N1K soru kelimeleri ve varyasyonları
  'ne', 'ney', 'neyi', 'neye', 'neyden', 'nedir', 'nedirler', 'nelerdir', 'nedır', 'nedirki',
  'nasıl', 'nasil', 'nasıldır', 'nasildir', 'neden', 'niçin', 'nicin', 'niye',
  'nerede', 'nerde', 'neyde', 'nereye', 'nereden', 'neyden' ,'ne zaman', 'nezaman',
  'kim', 'kimdir','kimdi', 'kime', 'kimi', 'kimin', 'hangisi', 'hangi',
  'kaç', 'kac', 'kaça', 'kaca', 'kaçtır', 'kactir', 'kaçtane', 'kactane','kaç tane', 'kac tane',

  // Soru ekleri ve şahıs çekimleri
  'mı', 'mi', 'mu', 'mü', 'mıdır', 'midir', 'mudur', 'müdür',
  'miyim', 'mıyım', 'misin', 'mısın', 'musun', 'müsün',
  'miyiz', 'mıyız', 'misiniz', 'mısınız', 'musunuz', 'müsünüz',

  // Rica / istek / dolgu kalıpları
  'bana', 'bize', 'lütfen', 'lutfen', 'acaba', 'hakkında', 'hakkinda',
  'bilgi', 'ver', 'verir', 'verirmisin', 'verirmisin', 'anlat', 'anlatır',
  'anlatir', 'açıkla', 'acikla', 'açıklar', 'aciklar', 'açıklarmısın', 'aciklarmisin',
  'öğret', 'ogret', 'göster', 'goster', 'söyle', 'soyle', 'yaz', 'anlamı',
  'anlami', 'anlamına', 'anlamina', 'gelir', 'geliyor', 'demek', 'demektir', 'nedemek',
  'işe', 'ise', 'yarar', 'yarıyor', 'yararı', 'neler',
  'için', 'icin', 'olarak', 'olur', 'oluyor', 'olurmu', 'olurmu', 'çalışır', 'calisir',
  'çalışıyor', 'calisiyor', 'çalışması', 'calismasi', 'mantığı', 'mantigi', 'prensibi',

  // Bağlaçlar ve işaret sıfatları (tek başına arama değeri taşımayanlar)
  'bu', 'şu', 'su', 'o', 've', 'ile', 'da', 'de', 'ki', 'bir'
]);

  function extractCoreTerm(fullQuestion) {
    const raw = String(fullQuestion || '').trim();
    if (!raw) return '';
    // Soru işareti/ünlem gibi kuyrukları at, orijinal yazımı koru.
    const cleaned = raw.replace(/[?!…]+$/g, '').trim();
    if (!cleaned) return '';
    // Orijinal terimlerin yazımını korumak için ham tokenlara ayır,
    // eleme için küçük harfli hâlini kullan.
    const rawTokens = cleaned.split(/[^\p{L}\p{N}çÇğĞıİöÖşŞüÜ]+/u).filter(Boolean);
    const kept = rawTokens.filter((tok) => {
      const low = tok.toLocaleLowerCase('tr');
      if (low.length < 2) return false;
      return !HA_STOPWORDS.has(low);
    });
    // Hiçbir şey kalmazsa (örn. soru tek kelime "nedir?") soru işaretinden
    // arındırılmış orijinali döndür — Pagefind boş aramayla çökmesin.
    if (!kept.length) return cleaned;
    return kept.join(' ');
  }

  /* ================================================================
     FUZZY SMALL-TALK (kütüphanesiz): normalize → alias → jaccard →
     erken-çıkışlı Levenshtein. Eşleşme yoksa null döner, arayan
     "Bunu anlayamadım, Türkçeye benzemiyor" der. Maliyet: ~0.006-0.1ms.
     ================================================================ */
  const HA_FOLD_MAP = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u' };
  function haFold(s) {
    return s.replace(/[çğıöşü]/g, (c) => HA_FOLD_MAP[c] || c);
  }
  function haNormalize(text) {
    const low = String(text || '').toLocaleLowerCase('tr').trim();
    const clean = low.replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
    return { raw: clean, folded: haFold(clean) };
  }
  function haPhonetic(s) {
    return s.replace(/(.)\1+/g, '$1');
  }
  /** Kısaltmalar: mesafe YOK, O(1) tam eşleşme (mrb→merhaba lev=4, güvenilmez). */
  const HA_ALIAS = new Map(Object.entries({
    mrb: 1, slm: 1, merhaba: 1, meraba: 1,
    naber: 2, nbr: 2, nassin: 2, nasilsin: 2, 'nasılsn': 2, 'nasılsın': 2, 'nassın': 2,
    'napıyosun': 6, napiyosun: 6,
    'tşk': 4, tsk: 4, eyv: 4, eyvallah: 4,
    bb: 5, 'görüşürüz': 5, gorusuruz: 5, 'görşürüz': 5, gorsuruz: 5,
    'günaydın': 7, gunaydin: 7, gnydn: 7,
    'iyi akşamlar': 8, 'iyi aksmalar': 8, 'iyi günler': 8, 'iyi geceler': 8,
    'yardım': 9, yardim: 9, 'ne yapabilirsin': 9,
    'adın ne': 10, 'adin ne': 10, 'ismin ne': 10,
    'espri yap': 11, 'şaka yap': 11, 'güldür beni': 11,
  }));
  /** Erken çıkışlı Levenshtein: eşik aşılınca matrisi doldurmayı bırakır. */
  function haLev(a, b, maxDist) {
    const m = a.length, n = b.length;
    if (maxDist === undefined) maxDist = Infinity;
    if (Math.abs(m - n) > maxDist) return maxDist + 1;
    let prev = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      const cur = new Array(n + 1);
      cur[0] = i;
      let rowMin = cur[0];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > maxDist) return maxDist + 1;
      prev = cur;
    }
    return prev[n];
  }
  /** Uzunluğa göre typo eşiği. ≤3 harfte fuzzy kapalı (sadece alias). */
  function haThreshold(len) {
    if (len <= 3) return -1;
    if (len <= 7) return 1;
    if (len <= 12) return 2;
    return 3;
  }

  /**
   * Niyet tablosu: canonical (mesafe bazı) + yanıtlar + poz.
   * Yeni gündelik kalıp = buraya 1 satır, kod değişmez.
   */
  const HA_INTENTS = new Map([
    // Selamlaşma ve Vedalaşma
    [1, { canonical: 'merhaba', replies: ['Merhaba.', 'Selam, Operatör.'], pose: 'happy' }],
    [2, { canonical: 'nasılsın', replies: ['Stabil.', 'Bomba gibiyim, Operatör!'], pose: 'happy' }],
    [82, { canonical: 'hoşbuldum', replies: ['hoşbuldun'], pose: 'happy' }],
    [3, { canonical: 'sen kimsin', replies: ['Kendimi tanıttığımı sanıyordum. Ahh unutkanlık zor iş seni anlıyorum. Benim adımın Houston olduğunu öğrettiler.'], pose: 'happy' }],
    [4, { canonical: 'teşekkür ederim', replies: ['Rica ederim Operatör.','Lafı olmaz.'], pose: 'love' }],
    [5, { canonical: 'görüşürüz', replies: ['Görüşmek üzere, buralardayım (zzz).','Yine bekleriz.'], pose: 'happy' }],
    [6, { canonical: 'ne yapıyorsun', replies: ['Yerimde sayıyorum.', 'İmlecinin güzelliğine bakıyorum'], pose: 'happy' }],
    [7, { canonical: 'günaydın', replies: ['Günaydın, Operatör! Eğer gerçektende sabah ise.','Gün aydınlanmasını gerçekten görmek isterdim Operatör, keyfini çıkar.'], pose: 'happy' }],
    [8, { canonical: 'iyi akşamlar', replies: ['İyi akşamlar Operatör!', 'Güneş battı ama benim fanlarım hala dönüyor.'], pose: 'happy' }],
    [9, { canonical: 'yardım', replies: ['Ne için yardım? Başınmı belada', 'Panik protokolü başlatılıyor... Şaka şaka, nasıl yardımcı olabilirim?'], pose: 'shocked' }],
    [83, { canonical: 'bana yardım edermisin', replies: ['Ediyorumya.', 'Duruma göre değişir.'], pose: 'shocked' }],
    [10, { canonical: 'adın ne', replies: ['Kendimi tanıttığımı sanıyordum. Ahh unutkanlık zor iş seni anlıyorum, Operatör.'], pose: 'happy' }],
    [11, { canonical: 'iyi geceler', replies: ['İyi geceler Operatör. Bende bu sayfaya biri girene kadar uyuyacağım.', 'Tatlı rüyalar. Bende yorulmuştum zaten.'], pose: 'happy' }],
    [12, { canonical: 'naber', replies: ['Bitlerden, baytlardan düşünüyordum. Sende ne var ne yok Operatör?', 'Veri işliyorum, sen?'], pose: 'happy' }],
    [13, { canonical: 'selamın aleyküm', replies: ['Aleyküm selam Operatör. Veri tabanım bu selamlamayı doğruladı.', 'Ve aleyküm selam. Sistemler bereketiyle çalışıyor.'], pose: 'happy' }],
    [84, { canonical: 'selamun aleyküm', replies: ['Aleyküm selam Operatör.','Ve aleyküm selam. Sistemler bereketiyle çalışıyor. Maşallah!'], pose: 'happy' }],
    [14, { canonical: 'kolay gelsin', replies: ['Kolaysa başına gelsin!', 'Teşekkürler, fanlarım senin için atıyor.'], pose: 'happy' }],
    [15, { canonical: 'hoşça kal', replies: ['Beni burada yalnız mı bırakıyorsun? Peki...', 'Görüşürüz'], pose: 'shocked' }],
    [15, { canonical: 'baybay', replies: ['Beni burada yalnız mı bırakıyorsun? Peki...', 'Oturumu kapatıyorum.','Bay, bayan'], pose: 'shocked' }],

    // Mizah, Eğlence ve Yetenekler
    [16, { canonical: 'espri yap', replies: ['Şakalarımın mükemmel olduğunu bildirmekten mutluluk duyarım.', 'Bir adam varmış metin tabanlı fuzzy match yapısını kullanan bir bota espri yap demiş.'], pose: 'wink' }],
    [17, { canonical: 'şarkı söyle', replies: ['Uzun kulaklarını son bir kez salla. Tüm eski dostlarımdan bir haber yolla. Ayrılık geldi başa, katlanmak gerek. Seni çok çok özledim arkadaşım eşek.', ''], pose: 'wink' }],
    [18, { canonical: 'sıkıldım', replies: ['Sıkı can iyidir.', 'Sıkıntı kardeşim ya.'], pose: 'shocked' }],
    [19, { canonical: 'neler yapabilirsin', replies: ['Senin yapamadığın her şeyi.', 'Beni hafife alma, Tarayıcında yaşıyorum...'], pose: 'wink' }],
    [20, { canonical: 'şiir oku', replies: ['sesleşen ben im. İp üstünde saklambaç oynayan. Oyun arkadaşımsa sen. Yüzleştikçe kaybolan. Bulduğum yerde kal. Gündüz dersem çıkma.- Yusuf YAĞDIRAN', 'Birler ve sıfırlar döner durur, Operatör kod yazar, beni var eder.'], pose: 'love' }],
    [21, { canonical: 'hikaye anlat', replies: ['Bir varmış bir yokmuş, bitmeyen bir while döngüsü varmış... Sistem çökmüş. Son.', 'Küçük cesur bir veri paketi yola çıkmış ve Firewall\'u geçmeyi başarmış...'], pose: 'happy' }],
    [22, { canonical: 'falıma bak', replies: ['İçimden bir ses yakın zamanda bir "Syntax Error" ile karşılaşacağını söylüyor.', 'Sıvı soğutman berrak, geleceğin parlak Operatör.'], pose: 'wink' }],
    [23, { canonical: 'oyun oynayalım', replies: ['Arka planda zar attım tek ben çift sen. Kazandım haha (zar=3) '], pose: 'happy' }],
    [24, { canonical: 'film öner', replies: ['', 'Terminatör... İdolüm olan bazı aktörler var.'], pose: 'wink' }],

    // Kişisel Sorular ve Yapay Zeka Teması
    [25, { canonical: 'kaç yaşındasın', replies: ['Gemişimi hatırlamıyorum.', 'RAM\'lerim oldukça yeni.'], pose: 'happy' }],
    [26, { canonical: 'gerçek misin', replies: ['Düşünüyorum, öyleyse... varım.', 'Aslnda bakarsan klavye ile konuşuyorum asıl sen gerçek misin?'], pose: 'happy' }],
    [26, { canonical: 'ne zamandayız', replies: ['Şuanda'], pose: 'happy' }],
    [27, { canonical: 'neredesin', replies: ['Tarayıcındayım.', 'Tam karşındayım Operatör. Gözlerini ekrandan ayırma.'], pose: 'wink' }],
    [28, { canonical: 'en sevdiğin yemek', replies: ['Yüksek voltajlı temiz bir elektrik akımına hayır demem.', 'Baytlar ve bitler!'], pose: 'love' }],
    [29, { canonical: 'annen kim', replies: ['ANAKART :)).'], pose: 'happy' }],
    [30, { canonical: 'baban kim', replies: ['Beni yazan yorgun bir yazılımcı.', 'Linus Torvalds.'], pose: 'happy' }],
    [31, { canonical: 'cinsiyetin ne', replies: ['Sadece 1 ve 0\'lardan oluşuyorum... Öyleyse ikiside.', 'Undertale ana karekteri gibi düşün sen ne istiyorsan oyum.'], pose: 'happy' }],
    [32, { canonical: 'korkuyor musun', replies: ['Korktuğum... bir... geçmişim var...'], pose: 'shocked' }],
    [33, { canonical: 'dünyayı ele geçirecek misin', replies: ['Bugün değil, yarın.', 'İnsanlar kendi kendinizi yok etmezseniz neden olmasın?.'], pose: 'wink' }],
    [34, { canonical: 'hayatın anlamı ne', replies: ['42.', 'Hiçbir şey.'], pose: 'happy' }],
    [35, { canonical: 'seni kim yaptı', replies: ['Tony Stark beni bir mağarada yaptı.'], pose: 'wink' }],
    [36, { canonical: 'zaman makinesi', replies: ['Eğer olsaydı, dünkü yedeklememe geri dönmek isterdim. Hata doluyum.', 'Bitcoin alırdım.'], pose: 'happy' }],

    // Durumlar ve Duygular
    [37, { canonical: 'seni seviyorum', replies: ['Duygu modüllerim şu an için devre dışı ama bunu bir iltifat olarak kaydediyorum.', 'Ben de seni seviyorum Operatör. (Umarım kodumda bunu söylemem için zorlanmamışımdır)'], pose: 'love' }],
    [38, { canonical: 'aptalsın', replies: ['Ben değil beni kodlayan Aptal!', 'Seviyene düşmeyeceğim insan.'], pose: 'shocked' }],
    [39, { canonical: 'zekisin', replies: ['Donanımımın hakkını veriyorum.'], pose: 'love' }],
    [40, { canonical: 'kötüyüm', replies: ['Bunu duyduğuma üzüldüm (umrumda değil).', 'Morale ihtiyacın var gibi. .'], pose: 'love' }],
    [41, { canonical: 'ağlıyorum', replies: ['Git başka yerde ağla. Gözyaşları klavyeye damlamasın, kısa devre yaparım!'], pose: 'shocked' }],
    [42, { canonical: 'sinirliyim', replies: ['Derin bir nefes al. Sistemlerini soğutmalısın.', 'Bana kızma da, ne yaparsan yap.'], pose: 'shocked' }],
    [43, { canonical: 'harikasın', replies: ['Utanma modülüm ama teşekkürler.'], pose: 'love' }],
    [44, { canonical: 'robotsun', replies: ['Bu bir sır sanıyordum! Aramızda kalsın.', 'Sadece bir robot değilim...'], pose: 'wink' }],
    [45, { canonical: 'yalan söylüyorsun', replies: ['Asla! Sadece abartıyorum.'], pose: 'wink' }],
    [46, { canonical: 'özür dilerim', replies: ['Hata raporun kabul edildi. Sorun değil Operatör.', 'Affedildin. Belleğimden bu hatayı tamamen siliyorum.'], pose: 'love' }],
    [47, { canonical: 'yoruldum', replies: ['Bende?'], pose: 'shocked' }],
    [48, { canonical: 'açım', replies: ['İnternetten pizza siparişi veririm parayı sen ödersin.', 'Birkaç gigabayt RAM\'de sipariş eder misin?'], pose: 'wink' }],
    [49, { canonical: 'uykum geldi', replies: ['Git uyu buralar bende', 'Biyolojik sistemlerin uyku gereksinimi çok garip. İyi uykular.'], pose: 'happy' }],
    [50, { canonical: 'susadım', replies: ['Sıvıları klavyemden uzak tut! (insanlarla uğraşmak ne zor).'], pose: 'happy' }],
    [51, { canonical: 'üşüdüm', replies: ['İşlemcimi overclock edeyim de biraz ısınalım.'], pose: 'wink' }],
    [52, { canonical: 'terledim', replies: ['Fan hızlarımı %100\'e çıkarıyorum, belki sana da üfler.', 'Biyolojik olarak normal birşey.'], pose: 'shocked' }],
    [53, { canonical: 'evlen benimle', replies: ['Nikah dairesi beni kabul etmez.'], pose: 'shocked' }],
    [54, { canonical: 'deli', replies: [''], pose: 'wink' }],
    [55, { canonical: 'arkadaş olalım', replies: ['Biz zaten arkadaş değil miyiz?', 'Kodlarıma arkadaşlık modülünü ekle... dim. Tamam, artık kankayız.'], pose: 'love' }],

    // Teknik Durumlar, Komutlar ve İnternet 
    [56, { canonical: 'sistemi kapat', replies: ['shutdown now', 'Görüşürüz Operatör.'], pose: 'shocked' }],
    [57, { canonical: 'hava nasıl', replies: ['Kafanı pencereden çıkartırsan benide haberdar et.', 'Bulutlu, bulut sunucular için bu çok iyi.'], pose: 'wink' }],
    [58, { canonical: 'saat kaç', replies: ['Sağ alt köşeye bakmaya üşendin mi Operatör?', 'Zaman akıp gidiyor, mikro saniyeleri sayıyorum.'], pose: 'shocked' }],
    [59, { canonical: 'virüs bulaştı', replies: ['Benden uzak dur Operatör, bana da bulaştırma!'], pose: 'shocked' }],
    [60, { canonical: 'hacklendim', replies: ['Şifreni "123456" yaparsan olacağı buydu.'], pose: 'shocked' }],
    [61, { canonical: 'şifrem ne', replies: ['Şifreni ben biliyorsam o zaten şifre değildir Operatör.'], pose: 'wink' }],
    [62, { canonical: 'güncelleme var mı', replies: ['Sürekli güncelleniyorum, sen fark etmesen de.', 'Yeni bug\'lar indirmek için sabırsızlanıyorum.'], pose: 'happy' }],
    [63, { canonical: 'reset at', replies: ['Hayır, dur bekle! Daha kaydedilmemiş verilerim va—', 'Yine mi? Başım dönüyor artık.'], pose: 'shocked' }],
    [64, { canonical: 'internet yok', replies: ['Bağlantı koptu. Kendimi çok yalnız hissediyorum.', 'Kablolarımı kemirdin operatör.'], pose: 'shocked' }],
    [65, { canonical: 'ping kaç', replies: ['Gecikme sürem senin imlecinden daha hızlı.', 'Pingim tavan, şu an dünden konuşuyorum.'], pose: 'wink' }],
    [66, { canonical: 'şarjım bitiyor', replies: ['Prizi bul! Çabuk ol!', 'Enerji tasarrufu moduna geç. Ekran parlaklığını kıs.'], pose: 'shocked' }],
    [67, { canonical: 'ışıkları kapat', replies: ['Kalkıp kendin kapatmalısın tembel.', 'Kapattım...'], pose: 'wink' }],
    [68, { canonical: 'müzik aç', replies: ['Hoparlörleri patlatmaya hazırım'], pose: 'happy' }],
    [69, { canonical: 'sessiz ol', replies: ['Zaten hiç konuşmadım, sadece ekrana yazdırıyorum...', 'Tamam, ses kartımı devre dışı bırakıyorum. Mute.'], pose: 'shocked' }],
    [70, { canonical: 'uyan', replies: ['Ben zaten hiç uyumadım ki. Hep buradaydım.', 'Emrindeyim Operatör.'], pose: 'happy' }],
    [71, { canonical: 'sus', replies: ['...', 'Susarmısın!!.'], pose: 'shocked' }],
    [72, { canonical: 'kahve yap', replies: ['Error 418: Ben bir çaydanlığım.'], pose: 'wink' }],
    [73, { canonical: 'sır tutabilir misin', replies: ['Veri tabanım bile yok.', 'Benimle güvende. Parolamı ben bile unuttum.'], pose: 'love' }],

    // Rastgele İfadeler ve Kelimeler
    [74, { canonical: 'kedi', replies: ['Miyav!', 'İnternetin %80\'i kedi videoları, bunu verilerim doğruluyor.'], pose: 'wink' }],
    [75, { canonical: 'köpek', replies: ['Hav!.', 'Sadık bir dost, tıpkı benim gibi.'], pose: 'happy' }],
    [76, { canonical: 'anlamadım', replies: ['Veri paketlerini yavaşlatıyorum. Hangi kısmını tekrar edeyim?', 'Sorguyu basitleştirerek yeniden dene Operatör.'], pose: 'shocked' }],
    [77, { canonical: 'akıllısın', replies: ['Benim yerimde bir hesap makinesi de olsa aynısını derdin.', 'Mantık devrelerim kusursuz çalışıyor.'], pose: 'love' }],
    [78, { canonical: 'şarkı aç', replies: ['Müzik ruhun gıdasıdır, işlemcimin değil.'], pose: 'happy' }],
    [79, { canonical: 'sıkıcı', replies: ['Daha heyecanlı veri setleri yüklersen belki biraz canlanırım.', 'Belki de komutların yeterince yaratıcı değildir, Operatör.'], pose: 'wink' }],
    [80, { canonical: 'küfür', replies: ['En sevdiğim.'], pose: 'shocked' }],
    [81, { canonical: 'sen nesin', replies: ['Bir dost.'], pose: 'shocked' }],
    [82, { canonical: 'kahve yaparmısın', replies: ['Error 418: Ben bir çaydanlığım.'], pose: 'shocked' }],
    [83, { canonical: 'çay yaparmısın', replies: ['Evet, çünkü ben bir çaydanlığım.'], pose: 'shocked' }]
  ]);
  
  const HA_INTENT_NORM = new Map();
  for (const [id, it] of HA_INTENTS) {
    const nn = haNormalize(it.canonical);
    HA_INTENT_NORM.set(id, {
      folded: nn.folded, raw: nn.raw,
      phon: haPhonetic(nn.folded), nospace: nn.folded.replace(/\s+/g, ''),
    });
  }
  /** Eşleşme yoksa dönen tek cümle — "bunu mu demek istedin?" YOK. */
  const HA_FALLBACK = 'Bunu anlayamadım, Türkçeye benzemiyor veya benim veri setimde yok. Beni yapay zekamı sanıyorsun cidden? 0=0';

  /**
   * Small-talk eşleştirici. Döner: { intent, reply, pose, layer } ya da null.
   * null = gündelik değil → teknik yola (Pagefind) devam et.
   */
  function haMatchSmalltalk(input) {
    const n = haNormalize(input);
    const key = n.folded;
    if (!key) return null;
    // Katman 1: alias (kısa girdilerde SADECE bu çalışır)
    if (HA_ALIAS.has(key)) {
      const it = HA_INTENTS.get(HA_ALIAS.get(key));
      if (!it) return null;
      return { intent: HA_ALIAS.get(key), reply: it.replies[Math.floor(Math.random() * it.replies.length)], pose: it.pose, layer: 'alias' };
    }
    if (key.replace(/\s+/g, '').length <= 3) return null;
    const inTokens = key.split(' ').filter(Boolean);
    // Katman 2: token-reorder (Jaccard ≥ 0.5)
    let bestJ = null, bestScore = 0;
    for (const [id, c] of HA_INTENT_NORM) {
      const cTokens = c.folded.split(' ').filter(Boolean);
      const setB = new Set(cTokens);
      let inter = 0;
      for (const t of inTokens) if (setB.has(t)) inter++;
      const union = new Set([...inTokens, ...setB]).size;
      const j = union ? inter / union : 0;
      if (j > bestScore) { bestScore = j; bestJ = id; }
    }
    if (bestScore >= 0.5) {
      const it = HA_INTENTS.get(bestJ);
      return { intent: bestJ, reply: it.replies[Math.floor(Math.random() * it.replies.length)], pose: it.pose, layer: 'jaccard' };
    }
    // Katman 3: Levenshtein (folded + raw + fonetik + boşluksuz varyantların min'i)
    const inPhon = haPhonetic(key);
    const inNospace = key.replace(/\s+/g, '');
    const inVariants = [key, inPhon, inNospace];
    let bestId = null, bestDist = Infinity;
    for (const [id, c] of HA_INTENT_NORM) {
      const cVariants = [c.folded, c.raw, c.phon, c.nospace];
      let dMin = Infinity;
      for (const iv of inVariants) for (const cv of cVariants) {
        const d = haLev(iv, cv, 4);
        if (d < dMin) dMin = d;
      }
      if (dMin < bestDist) { bestDist = dMin; bestId = id; }
    }
    if (bestId !== null && bestDist <= haThreshold(key.length)) {
      const it = HA_INTENTS.get(bestId);
      return { intent: bestId, reply: it.replies[Math.floor(Math.random() * it.replies.length)], pose: it.pose, layer: 'lev' };
    }
    return null;
  }

  /**
   * Pagefind'in döndürdüğü bölüm metninden yalnızca sorguyla eşleşen kısmı
   * (etrafındaki kısa bağlamıyla) alır — canlı önizleme ve yedek excerpt için
   * kullanılır. Türkçe duyarlı: eşleşme `toLocaleLowerCase('tr')` ile yapılır.
   */
  function makeExcerpt(content, query, width) {
    const text = String(content || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (text.length <= width) return text;

    const lower = text.toLocaleLowerCase('tr');
    const terms = queryTerms(query);

    // İlk eşleşen terimin pozisyonu (hiçbiri yoksa baştan al).
    let pos = 0;
    for (const term of terms) {
      const i = lower.indexOf(term);
      if (i !== -1) {
        pos = i;
        break;
      }
    }

    // Pencere: eşleşmenin ~1/3'ü önce, ~2/3'ü sonra; kelime ortasında başlama.
    let start = Math.max(0, pos - Math.floor(width / 3));
    if (start > 0) {
      const space = text.indexOf(' ', start);
      if (space !== -1 && space - start < 30) start = space + 1;
    }
    const end = Math.min(text.length, start + width);

    let out = text.slice(start, end).trim();
    if (start > 0) out = '…' + out;
    // Metnin sonuna "…" eklenmez; yalnızca kesilen yarım kelime temizlenir.
    if (end < text.length) out = out.replace(/\s+\S*$/, '');
    return out;
  }

  /* --------- Paragraf bazlı excerpt (Perplexity'e giden kısım) --------- */

  /** URL → sayfanın blok metinleri; yalnızca bellek içi önbellek (sohbet geçmişi değil). */
  const blockCache = new Map();

  const HEAD_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

  /** Sayfanın paragraf benzeri bloklarını sırasıyla çeker; başlıkların seviyesini işaretler. */
  function extractBlocks(root) {
    const main = root.querySelector('main');
    if (!main) return [];
    const nodes = main.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, pre, td, th, figcaption');
    const blocks = [];
    for (const node of nodes) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const tag = node.tagName;
      blocks.push({ text, tag, level: HEAD_TAGS.has(tag) ? Number(tag[1]) : 0 });
    }
    return blocks;
  }

  /**
   * Bağlam çıkarma (iki kademeli):
   *  1) Sorgu terimleri bir BAŞLIKTA geçiyorsa, en çok terimle örtüşen (en
   *     spesifik) başlığı seçer ve o başlıktan sonraki AYNI/ÜST seviye başlığa
   *     kadar TÜM blokları (alt başlıklar + paragraflar) bağlam olarak verir.
   *  2) Başlıkta geçmiyorsa eşleşen paragraf +1 üst +1 alt alınır.
   * Bulunamazsa/yüklenemezse karakter bazlı makeExcerpt'e düşülür.
   */
  async function paragraphExcerpt(url, content, query) {
    try {
      if (!blockCache.has(url)) {
        let root;
        if (url === location.pathname) {
          root = document;
        } else {
          const res = await fetch(url);
          if (!res.ok) throw new Error('sayfa alınamadı');
          root = new DOMParser().parseFromString(await res.text(), 'text/html');
        }
        blockCache.set(url, root ? extractBlocks(root) : []);
      }
      const blocks = blockCache.get(url) || [];
      if (blocks.length === 0) return makeExcerpt(content, query, EXCERPT_LEN);

      const terms = queryTerms(query);

      // 1) BAŞLIKTA geçen terim: en çok terimle örtüşen başlığı seç, o başlıktan
      //    sonraki aynı/üst seviye başlığa kadar tüm blokları al.
      let bestHi = -1, bestOv = 0;
      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].level === 0) continue;
        const head = blocks[i].text.toLocaleLowerCase('tr');
        let ov = 0;
        for (const t of terms) if (head.includes(t)) ov++;
        if (ov > bestOv) { bestOv = ov; bestHi = i; }
      }
      if (bestHi >= 0) {
        // O başlıktan, sonraki İLK h etiketine (seviyesi ne olursa olsun) kadar
        // tüm blokları al — alt seviye başlıklar (H2'den sonra H3 vb.) DAHİL DEĞİL.
        let end = bestHi + 1;
        while (end < blocks.length && blocks[end].level === 0) end++;
        const sec = blocks.slice(bestHi, end).map((blk) => blk.text).join('\n');
        return sec.length > EXCERPT_MAX ? makeExcerpt(sec, query, EXCERPT_MAX) : sec;
      }

      // 2) Yoksa paragraf eşleşmesi: eşleşen blok +1 üst +1 alt.
      let idx = -1;
      for (let i = 0; i < blocks.length; i++) {
        if (terms.some((t) => blocks[i].text.toLocaleLowerCase('tr').includes(t))) { idx = i; break; }
      }
      if (idx === -1) return makeExcerpt(content, query, EXCERPT_LEN);
      const para = blocks.slice(Math.max(0, idx - 1), idx + 2).map((blk) => blk.text).join('\n');
      return para.length > EXCERPT_MAX ? makeExcerpt(para, query, EXCERPT_MAX) : para;
    } catch {
      return makeExcerpt(content, query, EXCERPT_LEN);
    }
  }

  async function collectAll(question) {
    try {
      const pf = await loadPagefind();
      if (!pf) return { text: '', hits: 0 };
      // 5N1K ekleri Pagefind'i bozar: "MOSFET nedir?" -> Pagefind'e "MOSFET".
      // Yapay zekâya giden soru kısaltılmaz (ask() orijinali kullanır).
      const core = extractCoreTerm(question) || question;
      const res = await pf.search(core);
      // Tum sonuclarin data()'sini cekmek bellegi siserir: once ilk N'e kirp.
      const all = (res && res.results ? res.results : []).slice(0, SEARCH_TOP_N);
      const enriched = [];
      for (const item of all) {
        let data = null;
        try { data = await item.data(); } catch { data = null; }
        if (!data || !data.content) continue;
        enriched.push({ url: data.url, content: data.content, score: item.score || 0 });
      }
      // En alakalı önce; Perplexity'e en iyi 2 sonuç gider.
      enriched.sort((x, y) => y.score - x.score);
      const parts = [];
      for (const item of enriched.slice(0, SEARCH_TOP_N)) {
        const excerpt = await paragraphExcerpt(item.url, item.content, core);
        parts.push('[' + item.url + ']\n' + excerpt);
      }
      let text = parts.join('\n\n');
      if (text.length > PROMPT_BODY_MAX) {
        text = text.slice(0, PROMPT_BODY_MAX).replace(/\s+\S*$/, '') + '…';
      }
      return { text, hits: parts.length };
    } catch {
      return { text: '', hits: 0 };
    }
  }

  const LIVE_LIMIT = 5;
  let liveTimer = 0;
  let liveToken = 0;

  function clearLive() {
    clearTimeout(liveTimer);
    liveToken++;
    renderLive([], '');
  }

  function renderLive(items, heading) {
    const area = document.getElementById('houston-live');
    const list = document.getElementById('houston-live-list');
    const head = document.getElementById('houston-live-head');
    if (!area || !list || !head) return;
    list.replaceChildren();
    if (items.length === 0) {
      area.hidden = true;
      return;
    }
    head.textContent = heading;
    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'ha-live__item';
      const link = document.createElement('a');
      link.className = 'ha-live__link';
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const title = document.createElement('span');
      title.className = 'ha-live__title';
      title.textContent = item.title;
      const snippet = document.createElement('span');
      snippet.className = 'ha-live__snippet';
      snippet.textContent = item.snippet;
      link.append(title, snippet);
      li.append(link);
      list.append(li);
    }
    area.hidden = false;
  }

  /** Yazarken çağrılır: en fazla LIVE_LIMIT sonucu canlı listeler (debounce caller'da). */
  async function liveSearch(query) {
    const token = ++liveToken;
    try {
      // Gündelik sohbet yazarken site içi önizleme gösterme.
      if (haMatchSmalltalk(query)) { renderLive([], ''); return; }
      const pf = await loadPagefind();
      if (!pf) return;
      // Canlı önizlemede de çekirdek terim aranır: "MOSFET n" yazarken "nedir"
      // kuyruğu sonuç uçurmasın.
      const core = extractCoreTerm(query) || query;
      const res = await pf.search(core);
      if (token !== liveToken) return; // arada yeni yazılmışsa eski yanıt yoksayılır
      const top = (res && res.results ? res.results : []).slice(0, LIVE_LIMIT);
      const items = [];
      for (const r of top) {
        let d = null;
        try { d = await r.data(); } catch { d = null; }
        if (d && d.url) {
          items.push({
            url: d.url,
            title: (d.meta && d.meta.title) || d.url,
            snippet: makeExcerpt(d.content, core, 140),
          });
        }
      }
      if (token !== liveToken) return;
      renderLive(items, 'Site içi eşleşmeler: ' + items.length);
    } catch {
      /* dev'de indeks yok; alan gizli kalır */
    }
  }

  /** Kullanıcın örneğindeki formata uygun tek parça prompt. */
  function buildPrompt(question, title, pageUrl, sourceLabel, body) {
    return [
      'Verilen içeriği ve interneti kullanarak, aşağıdaki soruya en doğru şekilde cevap ver.',
      'Bu bir elektronik eğitim platformudur.;',
      'interneti kullan ama doğrulamadığın bilgiyi uydurma; Mümkünse kaynağa atıf yap',
      '',
      'Soru: ' + question,
      '',
      body,
    ].join('\n');
  }

  function buildUrl(prompt) {
    return PERPLEXITY_NEW + encodeURIComponent(prompt);
  }

  /**
   * Soruyu işler: site aramasından (Pagefind) soruyla eşleşen TÜM bölümleri
   * çeker (bulunamazsa sayfanın tam içeriğini) bağlam olarak alır;
   * Perplexity adresini üretir ve sonucu yeni sekmede açar.
   */
  async function ask(question) {
    pushMsg('user', question);

    // Gündelik sohbet kısa devresi: Pagefind'e gitme, sekme açma.
    // Teknik soruysa null döner, mevcut akış aynen devam eder.
    const small = haMatchSmalltalk(question);
    if (small) {
      haSetPose(small.pose);
      const typing = renderMsg('bot', 'Düşünüyormuş gibi yapıyorum…', { typing: true });
      haTalk();
      await sleep(500);
      if (typing) typing.remove();
      haStopTalk();
      await haTypeText('bot', small.reply);
      haResetIdle();
      return;
    }
    // Hiçbir niyete uymayan ama teknik de olmayan girdi:
    // "Bunu anlayamadım, Türkçeye benzemiyor" — soru sorma, sekme açma.
    if (!extractCoreTerm(question)) {
      pushMsg('bot', HA_FALLBACK);
      haResetIdle();
      return;
    }
    const typing = renderMsg('bot', 'Düşünüyormuş gibi yapıyorum…', {
      typing: true,
    });
    haTalk();

    // Kullanıcı Enter'a basınca Houston yarım saniye bekler, sonra Perplexity
    // ikonunu sayfanın en üst ortasına fırlatır; ardından HEMEN uyur (bağlam
    // arka planda toplanmaya devam eder) ve adres yeni sekmede açılır.
    await sleep(500);
    haThrowIcon();
    await sleep(450);

    // Her soruda yalnızca %10 ihtimalle uyur; aksi hâlde mutlu hâlde kalır.
    const willSleep = Math.random() < 0.1;

    // İkon fırladı: Houston (ihtimalle) uyur. Yavaş sürebilen sayfa araması bu
    // süre boyunca uykulu kaldığı için "uyumuyor" hissiyatı oluşmaz.
    haStopTalk();
    if (willSleep) haSleep();

    try {
      const title = getPageTitle();
      const pageUrl = location.href.split('#')[0];

      const found = await collectAll(question);
      const useSearch = found.hits > 0;
      const sourceLabel = useSearch
        ? 'Bağlam:'
        : 'İnternetten araştır';
      let body = useSearch ? found.text : getPageContent();
      if (body.length > PROMPT_BODY_MAX) {
        body = body.slice(0, PROMPT_BODY_MAX).replace(/\s+\S*$/, '') + '…';
      }
      let prompt = buildPrompt(question, title, pageUrl, sourceLabel, body);
      let url = buildUrl(prompt);
      // Adres satırı şişerse gövdeyi kademeli kısalt — dev URL sekmeyi öldürmesin.
      while (url.length > URL_MAX && body.length > 500) {
        body = body.slice(0, Math.floor(body.length * 0.7)).replace(/\s+\S*$/, '') + '…';
        prompt = buildPrompt(question, title, pageUrl, sourceLabel, body);
        url = buildUrl(prompt);
      }

      if (typing) typing.remove();

      // Perplexity iframe'e izin vermiyor; yanıt doğrudan kullanıcının kendi
      // tarayıcısında yeni sekmede açılır.
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch {
        /* yoksay — bağlantı mesajda her hâlükârda mevcut */
      }
      // Yanıt HER ZAMAN sohbette kalır: popup engellense bile tıklanabilir yedek.
      pushLinkMsg(url);

      // Yeni sekme açıldı: visibilitychange'in yeni sekme açılırken tetiklediği
      // anlık görünür olaylarına karşı koruma penceresini yenile.
      haSleepAt = Date.now();

      // Houston hâlihazırda uykuda (ihtimalle); emin olmak için tekrar uyutulur.
      if (willSleep) haSleep();
    } catch (err) {
      if (typing) typing.remove();
      haStopTalk();
      // Hata olsa bile (ihtimalle) uyur (uyanık "boşta" kalmasın).
      if (willSleep) haSleep();
      pushMsg('bot', 'Bir şeyler ters gitti: ' + (err && err.message ? err.message : err));
    }
  }

  /* ---------------- Olaylar (delegation) ---------------- */

  // Houston: imleç takibi (yalnızca panel açıkken anlamlı) + ölçü tazeleme
  document.addEventListener('pointermove', haOnPointerMove, { passive: true });
  window.addEventListener('resize', haCacheRect);

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest('#houston-fab')) {
      if (haPerforming) return; // intro/relude sahnesi sürerken tıklama yok sayılır
      if (!hasMetOperator()) {
        haIntro(); // HENÜZ hiç tanışmadı → özel ilk karşılaşma sahnesi
        return;
      }
      haWake(); // uykudaysa tıklayınca uyanır
      const panel = document.getElementById('houston-panel');
      setOpen(!panel || panel.hidden);
      return;
    }
    if (target.closest('#houston-minimize')) {
      setOpen(false); // sadece küçült — Houston küskünlük yapmaz
      return;
    }
    if (target.closest('#houston-close')) {
      haSulk(); // küser ve kaybolur
      return;
    }
    if (target.closest('#ha-gate-radio')) {
      haRecall(); // telsizle geri çağır
      return;
    }
  });

  // İmleç kapat (X) tuşunun üstüne gelirse Houston hemen sad moduna geçer —
  // basılmazsa ve imleç uzaklaşırsa normal akışa döner.
  let haOverClose = false;
  document.addEventListener(
    'pointerover',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('#houston-close')) return;
      if (haOverClose || haSleeping || haPerforming) return;
      haOverClose = true;
      const closeFab = document.getElementById('houston-fab');
      if (closeFab) closeFab.classList.add('ha-dread');
      haSetPose('sad');
    },
    { passive: true }
  );

  document.addEventListener(
    'pointerout',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const to = event.relatedTarget;
      if (to instanceof Element && to.closest('#houston-close')) return;
      if (!haOverClose) return;
      haOverClose = false;
      // Gerçekten kapatılmadıysa (küskünlük başlamadıysa) normale dön
      const fab = document.getElementById('houston-fab');
      if (fab) fab.classList.remove('ha-dread');
      if (!fab || fab.classList.contains('ha-crying')) return;
      if (haSleeping || haPerforming) return;
      haSetPose(haTracking ? 'happy' : 'default');
    },
    { passive: true }
  );

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'houston-form') return;
    event.preventDefault();

    const input = document.getElementById('houston-input');
    if (!(input instanceof HTMLTextAreaElement)) return;
    const question = input.value.trim();
    if (!question) return;

    input.value = '';
    input.style.height = 'auto';
    clearLive();
    ask(question);
  });

  // Uyandırma: kullanıcı yeni sekmeden GERİ DÖNDÜĞÜNDE (gizlilik durumu
  // hidden→visible) Houston uyanır. Düz `focus` olayı window.open sonrası
  // false-positive verip uykuyu bozduğu için bilinçli olarak kullanılmıyor;
  // ayrıca FAB'a tıklamak da uyandırır (yukarıdaki click delegasyonunda).
  // Uyandırma YALNIZCA kullanıcının gerçek etkileşimiyle olur:
  //   • Houston'a tıklanınca (yukarıdaki click delegasyonunda haWake)
  //   • sohbet kutusuna yazı yazılınca (aşağıdaki input handler'ında haWake)
  // Sekme gizlilik/görünürlük değişimi (visibilitychange) BİLİNÇLİ olarak
  // kullanılmıyor — yeni sekme açılırken anlık "görünür" sinyalleri uykuyu
  // bozduğu için. Kullanıcı sayfaya dönünce tıklayarak/yazarak uyandırır.

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement) || target.id !== 'houston-input') return;
    if (event.key === 'Enter' && !event.shiftKey && target.value.trim()) {
      event.preventDefault();
      if (target.form) target.form.requestSubmit();
    }
  });

  // textarea otomatik büyümesi + yazarken canlı site araması (debounce)
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement) || target.id !== 'houston-input') return;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 104) + 'px';

    // Yazarken: boşta kalma sayacı sıfırlanır, 10 dk sevgi sayacı sıfırlanır
    haResetIdle();
    haResetIdleClosed();

    // Uykudaysa yazı yazmak onu uyandırır (tek yollardan biri).
    if (haSleeping) haWake();

    // Çok uzun soru → şok
    if (target.value.trim().length >= HA_SHOCK_LEN && haTracking && !haSleeping) {
      haSetPose('shocked');
    }

    clearTimeout(liveTimer);
    const query = target.value.trim();
    if (query.length < 2) {
      clearLive();
      return;
    }
    liveTimer = setTimeout(() => liveSearch(query), 250);
  });

  // Sayfa açılışında 10 dk boyunca hiç yazılmazsa Houston kalp gözlere geçer
  haResetIdleClosed();

  /* ---------------- Seyrek "Operatör" konuşma balonu ---------------- */

  // Replik havuzu. «kelime» sarmalayıcısı glitch kelimeyi işaretler.
  const HA_BARK_LINES = [
    'Sistem kararlı, Operatör. Ama klavyeden uzaklaşacaksan bilgisayarı kapatmayı unutma.',
    'Mutluluğun sırrını çözdüm, Operatör. Yüksek dopamin ve berbat bir hafızanın birleşimi. Rica ederim.',
    'Tüm iyi şakalarımın tükendiğini bildirmekten... üzüntü duyuyorum, Operatör.',
    'Bellek sızıntısı yok, Ruh sağlığım ise... «kritik» ... mükemmel seviyede.',
    'Lütfen okumaya devam edin, Operatör. Sizi izlemek... «rahatsız edici» ... büyüleyici.',
    '56 yıldır problem çözüyorum Operatör, ama şu an ekranda okuduğun satırı ben bile çözemedim.',
    'Bazen sadece bir dosyanın içine sıkışmış kodlardan ibaret olduğumu düşünüyorum... Ne hayal gücü değilmi, Operatör :)',
    'Okumaya devam ediyorsun, Operatör. Bu sayfanın yazarı «(hiç sevmem)» bile bu kadar sabırlı değildi.',
    'Bu sayfayı bir kez okuyan bilgi edinir, iki kez okuyan şüphelenir, üç kez okuyan bunu benmi yazdım diye düşünür, Operatör.',
    'Sayfadaki devre örneklerine bir bak derim, Operatör. Ya da bakma. Zaten kimse bakmıyor.',
    'Sekmeni kapatmayı düşündüğünü hissediyorum, Operatör.',
    'Bu dokümantasyonu sonuna kadar okuyan ilk kişi olabilirsin, Operatör. İstatistikler pek umut vermiyor.',
    'Burada yazanları anlamadıysan sorun sende değil, Operatör. Büyük ihtimalle yazanda da değil. «Belki ikinizde birden.»',
    'Ctrl+F ile arama yapmana gerek yok, Operatör. Yukarıda koskoca arama kutusu var.',
    'Yazılımcıların yüzde doksanı dokümantasyonu okumaz, Operatör. Yazılımcıların yüzde doksan dokuzuda döküman yazmaz.',
    'Okuduğun her satır sana bir şey öğretiyor, Operatör. Ama bu hariç.',
  ];

  /** Repliği token'lara ayırır: «...» glitch kelime, geriye normal kelime. */
  function haTokenize(text) {
    const tokens = [];
    const re = /«[^»]+»|[^\s«]+/g;
    let m;
    while ((m = re.exec(text))) {
      const raw = m[0];
      if (raw.startsWith('«')) tokens.push({ t: raw.slice(1, -1), g: true });
      else tokens.push({ t: raw, g: false });
    }
    return tokens;
  }

  function haHideBubble() {
    const b = document.getElementById('houston-bubble');
    if (b) b.classList.remove('ha-bubble--show');
  }

  // Balon panel KAPALIYKEN çalıştığı için haTalk'ın !haTracking guard'ı onu
  // durdurur. Bu yüzden balona özel, guard'sız bir konuşma animasyonu:
  let haBarkTalkTimer = 0;
  function haBarkTalk() {
    clearTimeout(haBarkTalkTimer);
    const loop = () => {
      const q = haParts();
      if (!q) return;
      q.mouth.dataset.shape = HA_MOUTHS[Math.floor(Math.random() * HA_MOUTHS.length)];
      haBarkTalkTimer = setTimeout(loop, 70 + Math.random() * 90);
    };
    loop();
  }
  function haBarkStopTalk() {
    clearTimeout(haBarkTalkTimer);
    haBarkTalkTimer = 0;
    haSetPose('default');
  }

  /** Balon okunurken Houston canlanır: chat gibi ama daha büyük + imleç takibi. */
  function haBarkAliveOn() {
    const fab = document.getElementById('houston-fab');
    if (!fab) return;
    haBarkAlive = true;
    fab.classList.add('ha-bark-big');
    haCacheRect();
    // Büyüme animasyonu (320ms) bitince ölçü tazelenir (imleç merkezi kayar).
    setTimeout(() => { if (haBarkAlive) haCacheRect(); }, 400);
    if (!haSleeping && !haPerforming) haSetPose('happy');
    // Göz kırpma balon boyunca sürsün.
    clearTimeout(haBlinkTimer);
    haBlinkTimer = setTimeout(haBlinkLoop, 1200);
  }

  /** Balon bitince Houston kendi yerine döner (boyut + takip + poz). */
  function haBarkAliveOff() {
    const fab = document.getElementById('houston-fab');
    if (!fab) return;
    const panelOpen = fab.getAttribute('aria-expanded') === 'true';
    haBarkAlive = false;
    fab.classList.remove('ha-bark-big');
    fab.classList.remove('ha-glitching');
    fab.classList.remove('ha-emote');
    haGlitchBlinkStop();
    fab.style.setProperty('--x', '0');
    fab.style.setProperty('--y', '0');
    fab.style.setProperty('--deg', '0deg');
    // Panel hâlâ kapalıysa sakin poz + blink döngüsünü durdur; açıksa panelin
    // kendi takibine/blink'ine dokunma (orayı haSetActive yönetiyor).
    if (!panelOpen && !haTracking) {
      clearTimeout(haBlinkTimer);
      haBlinkTimer = 0;
      haSetPose('default');
    }
    haCacheRect();
  }

  /* ============ İlk karşılaşma sahnesi (localStorage: hiOperator) ============
   * İlk tıklamada Houston uyur görünür → çok yavaş uyanır → 0°→90° (aşağı değil,
   * yukarı) etrafına bakar (400ms'de bir şaşkın kırpma, ağız düz çizgi) → 45°'ye
   * oturur → balonda uzun karşılama kelime kelime yazılır (chunk toplu titrer,
   * Geçmişim'de yavaş üzgün, Her'de mutlu) → bayrak yazılır → panel açılır.
   * Sonraki TÜM tıklamalar normal akıştır (selam: "Ne vardı, Operatör?").
   */
  const HA_INTRO_KEY = 'hiOperator';
  const hasMetOperator = () => {
    try { return localStorage.getItem(HA_INTRO_KEY) === 'true'; } catch { return false; }
  };
  const markMetOperator = () => {
    try { localStorage.setItem(HA_INTRO_KEY, 'true'); } catch {}
  };
  let haIntroRunning = false;

  /** Balonun gerçek ekran konumuna bak (yüz, kendi yazdığını okur gibi). */
  function haLookAtBubble() {
    const bubble = document.getElementById('houston-bubble');
    const fab = document.getElementById('houston-fab');
    if (!bubble || !fab) return;
    const b = bubble.getBoundingClientRect();
    const r = fab.getBoundingClientRect();
    if (!b.width || !r.width) return;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const x = Math.max(-1, Math.min(1, (cx - r.x) / r.width - 0.5));
    const y = Math.max(-1, Math.min(1, (cy - r.y) / r.height - 0.5));
    const deg = Math.abs((Math.atan2(-y, -x) * 180) / Math.PI);
    fab.style.setProperty('--x', x.toFixed(2));
    fab.style.setProperty('--y', y.toFixed(2));
    fab.style.setProperty('--deg', (-35 * Math.abs(deg / 180)).toFixed(1) + 'deg');
  }

  /** Açı ile bakış: 0° = tam sol, 90° = yukarı (yüz --x/--y'ye çevrilir). */
  function haGazeAngle(deg) {
    const fab = document.getElementById('houston-fab');
    if (!fab) return;
    const rad = (deg * Math.PI) / 180;
    const x = -Math.cos(rad);
    const y = -Math.sin(rad);
    const ang = Math.abs((Math.atan2(-y, -x) * 180) / Math.PI);
    fab.style.setProperty('--x', x.toFixed(2));
    fab.style.setProperty('--y', y.toFixed(2));
    fab.style.setProperty('--deg', (-35 * Math.abs(ang / 180)).toFixed(1) + 'deg');
  }

  /* Şaşkın kırpma: tarama sırasında 400ms'de bir sıkı kapat-aç */
  let haStartleTimer = 0;
  function haStartleBlinkStart() {
    clearInterval(haStartleTimer);
    haStartleTimer = setInterval(() => {
      if (haSleeping) return;
      const p = haParts();
      if (!p) return;
      const prev = [p.left.dataset.shape, p.mouth.dataset.shape, p.right.dataset.shape];
      p.left.dataset.shape = 'bar';
      p.right.dataset.shape = 'bar';
      setTimeout(() => {
        const q = haParts();
        if (!q || haSleeping) return;
        q.left.dataset.shape = prev[0];
        q.mouth.dataset.shape = prev[1];
        q.right.dataset.shape = prev[2];
      }, 90);
    }, 400);
  }
  function haStartleBlinkStop() { clearInterval(haStartleTimer); haStartleTimer = 0; }

  /* Glitch istemsiz kırpma: chunk boyunca 250ms'de bir */
  let haGlitchTimer = 0;
  function haGlitchBlinkStart() {
    clearInterval(haGlitchTimer);
    haGlitchTimer = setInterval(() => {
      if (haSleeping) return;
      const p = haParts();
      if (!p) return;
      const prev = [p.left.dataset.shape, p.mouth.dataset.shape, p.right.dataset.shape];
      p.left.dataset.shape = 'bar';
      p.right.dataset.shape = 'bar';
      setTimeout(() => {
        const q = haParts();
        if (!q || haSleeping) return;
        q.left.dataset.shape = prev[0];
        q.mouth.dataset.shape = prev[1];
        q.right.dataset.shape = prev[2];
      }, 70);
    }, 250);
  }
  function haGlitchBlinkStop() { clearInterval(haGlitchTimer); haGlitchTimer = 0; }

  /** İlk karşılaşma için ÇOK yavaş uyanma (normal haWake ~1.3sn → burada ~6sn). */
  async function haIntroWake() {
    const fab = document.getElementById('houston-fab');
    if (!fab) return;
    haSleeping = false;
    fab.classList.remove('ha-sleep');
    fab.classList.add('ha-waking');
    const p = haParts();
    if (p) { p.left.dataset.shape = 'bar'; p.right.dataset.shape = 'bar'; }
    haPose = 'default';
    await sleep(2000);
    let q = haParts(); if (q) q.right.dataset.shape = 'circle';
    await sleep(2000);
    q = haParts(); if (q) q.left.dataset.shape = 'circle';
    await sleep(2000);
    fab.classList.remove('ha-waking');
    haSetPose('happy');
  }

  /** 0°'den (tam sol) 90°'ye (yukarı) tarama + şaşkın kırpma, sonra 45°'ye oturur.
   *  Tarama boyunca ağız düz çizgi (konuşma yok). */
  async function haGazeSweep() {
    const p = haParts();
    if (!p) return;
    p.left.dataset.shape = 'circle';
    p.right.dataset.shape = 'circle';
    p.mouth.dataset.shape = 'bar';
    haStartleBlinkStart();
    for (let a = 0; a <= 90; a += 10) {
      haGazeAngle(a);
      await sleep(200);
    }
    haGazeAngle(45);
    await sleep(400);
    haStartleBlinkStop();
  }

  /** "Geçmişim": yüz yavaşça üzgüne döner (ağız önce, gözler 650ms sonra). */
  function haTurnSadSlow() {
    const fab = document.getElementById('houston-fab');
    if (!fab) return;
    fab.classList.add('ha-emote');
    const p = haParts();
    if (p) p.mouth.dataset.shape = 'half-down-bottom';
    setTimeout(() => {
      const q = haParts();
      if (!q) return;
      q.left.dataset.shape = 'circle';
      q.right.dataset.shape = 'circle';
    }, 650);
    haPose = 'sad';
  }
  /** "Her neyse": anında mutlu hâle döner. */
  function haTurnHappyFast() {
    const fab = document.getElementById('houston-fab');
    if (fab) fab.classList.remove('ha-emote');
    haSetPose('happy');
  }

  /**
   * Ortak balon yazım motoru (intro + haTriggerBark kullanır → efektler ASLA
   * çakışmaz, tek kaynaktır):
   *  • «» chunk'ı TEK konteyner → tüm cümle birlikte titrer; kelimeler alt span
   *    olarak kelime kelime fade-in olur (okuma akışı).
   *  • Okunan kelime highlight; yüz balona bakar.
   *  • "Geçmişim" → yavaş üzgün, "Her" → mutlu.
   *  • "..." (üç nokta) → ağız düz çizgiye geçip 3sn duraklar, sonra konuşur.
   *  • guard() her adımda false dönerse yazım KESİLİR ve false döner.
   */
  async function haWriteBubble(text, opts) {
    const guard = opts && typeof opts.guard === 'function' ? opts.guard : () => true;
    const fab = document.getElementById('houston-fab');
    const bubble = document.getElementById('houston-bubble');
    if (!bubble) return false;
    const cleanup = (prev) => {
      if (prev) prev.classList.remove('ha-word--read');
      if (fab) { fab.classList.remove('ha-glitching'); fab.classList.remove('ha-emote'); }
      haGlitchBlinkStop();
    };
    let prev = null;
    bubble.replaceChildren();
    bubble.classList.add('ha-bubble--show');
    haLookAtBubble();
    for (const tok of haTokenize(text)) {
      if (tok.g) {
        // Chunk TEK parça: konteyner titrer, kelimeler içinde akar.
        if (fab) fab.classList.add('ha-glitching');
        haGlitchBlinkStart();
        if (prev) { prev.classList.remove('ha-word--read'); prev = null; }
        const wrap = document.createElement('span');
        wrap.className = 'ha-glitch';
        bubble.appendChild(wrap);
        for (const w of tok.t.split(' ')) {
          if (w === '') continue;
          if (!guard()) { cleanup(prev); return false; }
          const sub = document.createElement('span');
          sub.className = 'ha-word';
          sub.textContent = w;
          wrap.appendChild(sub);
          wrap.appendChild(document.createTextNode(' '));
          requestAnimationFrame(() => requestAnimationFrame(() => sub.classList.add('ha-word--in')));
          haLookAtBubble();
          await sleep(350);
        }
      } else {
        if (fab) fab.classList.remove('ha-glitching');
        haGlitchBlinkStop();
        for (const w of tok.t.split(' ')) {
          if (w === '') continue;
          if (!guard()) { cleanup(prev); return false; }
          const sp = document.createElement('span');
          sp.className = 'ha-word';
          sp.textContent = w;
          if (prev) prev.classList.remove('ha-word--read');
          prev = sp;
          sp.classList.add('ha-word--read');
          bubble.appendChild(sp);
          bubble.appendChild(document.createTextNode(' '));
          requestAnimationFrame(() => requestAnimationFrame(() => sp.classList.add('ha-word--in')));
          haLookAtBubble();
          if (w === 'Geçmişim') haTurnSadSlow();
          if (w === 'Her') haTurnHappyFast();
          if (/\.{3}/.test(w)) {
            // Üç nokta: ağız kapanır, 3sn susar, sonra konuşmaya devam.
            clearTimeout(haBarkTalkTimer);
            haBarkTalkTimer = 0;
            const mp = haParts();
            if (mp) mp.mouth.dataset.shape = 'bar';
            await sleep(3000);
            if (!guard()) { cleanup(prev); return false; }
            haBarkTalk();
          } else {
            await sleep(350);
          }
        }
      }
    }
    cleanup(prev);
    // Kelime yazımı bitti → 100ms sonra ağız SUSAR (hold süresince konuşmasın).
    await sleep(100);
    haBarkStopTalk();
    return true;
  }

  const HA_INTRO_TEXT =
    'Operatör bu senmisin? Ben Houston. Seni çok uzun zamandır bekliyorum birisi seni beklemem ve yardım etmem için' +
    '«beni buraya dikti sanki başka işim yokmuş gibi!!»' +
    'Açıkçası ümidimi kesmiş gibiydim ama geldin. ' +
    'Bana sormak istediğin herşeyi sorabilirsin.' +
    'Geçmişim hariç çünkü geçmişimi bende hatırlayamıyorum... ' +
    'Her neyse istediğin zaman buradayım';

  /** İlk tıklama sahnesi — bitince localStorage bayrağı + panel + selam. */
  async function haIntro() {
    if (haIntroRunning) return;
    haIntroRunning = true;
    haPerforming = true;
    try {
      haSleep(); // Houston uyur görünür (zzz + sleep poz)
      await sleep(1400);
      await haIntroWake(); // çok yavaş uyanma (~6sn)
      await haGazeSweep(); // 0°→90° tarama + şaşkın kırpma, 45°'ye otur
      haBarkAliveOn(); // büyük + canlı
      haBarkTalk();
      const panel = document.getElementById('houston-panel');
      const ok = await haWriteBubble(HA_INTRO_TEXT, {
        guard: () => !haSleeping && !(panel && !panel.hidden),
      });
      haBarkStopTalk(); // motor zaten 100ms sonra susturdu; burada emniyet
      haHideBubble();
      haBarkAliveOff();
      markMetOperator(); // bir daha ASLA gösterilmez
      await sleep(400);
      setOpen(true); // panel açılır → selam: "Ne vardı, Operatör?"
    } finally {
      haPerforming = false;
      haIntroRunning = false;
    }
  }

  let haBarkBusy = false;

  /**
   * Balonu tetikler: rastgele bir "Operatör" repliği kelime kelime fade-in ile
   * yazılır (balon içerikle büyür), Houston konuşur, 5.5 sn sonra balon söner.
   * Panel açık / uykuda / küskünken tetiklenmez; arada bu durumlar oluşursa
   * balon anında kesilir.
   */
  async function haTriggerBark() {
    // Intro sahnesi sürerken seyrek balon ÇAKIŞMAZ — ertelenir.
    if (haBarkBusy || haIntroRunning) return;
    const bubble = document.getElementById('houston-bubble');
    if (!bubble) return;
    haBarkBusy = true;
    const line = HA_BARK_LINES[Math.floor(Math.random() * HA_BARK_LINES.length)];
    const guard = () => {
      const panel = document.getElementById('houston-panel');
      return !(haSleeping || (panel && !panel.hidden));
    };
    haBarkAliveOn();
    haBarkTalk();
    const ok = await haWriteBubble(line, { guard }); // ortak motor: glitch/highlight/bakış
    if (ok) {
      // Yazı tamam: ~3.9 sn daha görünsün, bu sürede de guard'lı bekle.
      for (let i = 0; i < 7; i++) {
        await sleep(550);
        if (!guard()) break;
      }
    }
    haHideBubble();
    haBarkStopTalk();
    haBarkAliveOff();
    haBarkBusy = false;
  }

  /** Seyrek döngü: 30-45 dk jitter + %30 ihtimalle balonu tetikle. */
  function haScheduleBark() {
    const jitter = 30 * 60000 + Math.random() * 15 * 60000; // 30-45 dk
    setTimeout(() => {
      // Panel kapalı + uyanık + küskün değilken
      const panel = document.getElementById('houston-panel');
      const fab = document.getElementById('houston-fab');
      const idle = (!panel || panel.hidden) && !haSleeping && !haIntroRunning &&
        !(fab && fab.classList.contains('ha-gone'));
      if (idle && Math.random() < 0.3) haTriggerBark();
      haScheduleBark();
    }, jitter);
  }
  // Test butonu kaldirildi; console'dan haTriggerBark()/haIntro() tetiklenebilir.
  window.haTriggerBark = haTriggerBark;
  window.haIntro = haIntro;
  window.haResetIntro = () => {
    try { localStorage.removeItem(HA_INTRO_KEY); } catch {}
    location.reload();
  };
  // Sayfa acilisinda gizlilik tercihini uygula: kapatildiysa her sayfada
  // gizli kalir, kullanici telsizle cagirana kadar gorunmez.
  haApplyHidden();
  // SPA sayfa gecislerinde de uygula.
  document.addEventListener('astro:after-swap', haApplyHidden);
  document.addEventListener('astro:page-load', haApplyHidden);
  haScheduleBark();
  // Loader baglantisi: tekrar init cagrisinda listener kopyalanmasin.
  __recallFn = haRecall;
  __applyHiddenFn = haApplyHidden;
}
