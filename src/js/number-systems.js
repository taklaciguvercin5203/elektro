/**
 * ============================================================================
 *  SAYI SİSTEMLERİ DÖNÜŞTÜRÜCÜ MODÜL
 *  (Number Systems Converter Module)
 * ============================================================================
 *
 *  Amaç: Yeryüzündeki yaygın sayı sistemleri arasında (onluk, ikili, sekizli,
 *  onaltılık/HEX, ASCII ve HEX byte rotası) kesintisiz dönüşüm sağlamak.
 *
 *  Kapsam:
 *    • Onluk  (10) → İkili (2)
 *    • Onluk  (10) → Sekizli (8)
 *    • Onluk  (10) → Onaltılık / HEX (16)
 *    • İkili (2)   → Onluk (10)
 *    • Sekizli (8) → Onluk (10)
 *    • Onaltılık (16) → Onluk (10)
 *    • İkili ↔ Sekizli ↔ Onaltılık uyumlu "küme / yayılım" dönüşümleri
 *    • ASCII kod <-> HEX byte rotası
 *    • String <-> ASCII kodlar <-> HEX
 *
 *  Kullanım (Astro bileşeninde):
 *    import * as ns from '../js/number-systems.js';
 *    ns.decimalToBinary(10);    // '1010'
 *    ns.binaryToDecimal('1010'); // 10
 *    ns.stringToHex('A');       // '41'
 *    ns.hexToString('41');      // 'A'
 *
 *  Mimari notu:
 *    • Tüm fonksiyonlar saf (pure) JavaScript'tir; DOM'a, tarayıcıya ya da
 *      ağa bağımlı değildir. Bu sayede statik bir Astro/Starlight sitesini
 *      değiştirmeden, sadece src/js altında bir modül olarak eklenir.
 *    • Projenin statik yapısı (astro build / preview / deploy) burada etkilenmez.
 *    • Sayılar JavaScript'te IEEE‑754 64‑bit double olarak tutulduğundan,
 *      2^53‑1 (Number.MAX_SAFE_INTEGER) üzeri hassas tam sayılar için
 *      dikkatli olunmalıdır; bu modül o aşırı değerleri engeller.
 *
 *  Yanıt (hata) durumları:
 *    • Negatif veya temiz olmayan (tam sayı olmayan) onluk değer
 *    • 2‑36 arası dışı taban
 *    • Belirli tabanda geçersiz / izinli dışı karakter
 *    • Boş veya boş olmayan dışarıdan gelen saider
 *    • 0‑255 dışı HEX / ASCII kodu
 *    • Fazla uzun dize (argument limiti)
 *
 *  Yazım kuralı:
 *    - Sabitleri ve fonksiyonları İngilizce isimlendirdim (JS kültürü).
 *    - Açıklamaları ve örnekleri Türkçe yazdım.
  *    - Her fonksiyon blok yorumlarla (JSDoc) sarmalanabilir;
 *      otomatik yüksek sıkıntı yapar.
 * ============================================================================
 */

// ────────────────────────────────────────────────────────────────────────────
//  1. YARDIMCI SABİTLER
// ────────────────────────────────────────────────────────────────────────────

// 2‑36 tabanı desteklemek için 0‑9 + A‑Z kararı yaratan karakter dizisi.
// Neden 36? 10 rakam (0‑9) + 26 alfabetik harf (A‑Z) = 36.
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Yaygın tabanların sabit şekli; base === 16 yerine BASES.HEX şeklinde okunur. */
export const BASES = Object.freeze({
  DECIMAL: 10,
  BINARY: 2,
  OCTAL: 8,
  HEX: 16,
});

// ────────────────────────────────────────────────────────────────────────────
//  2. HATA KONTROLÜ VECİDELERİ
// ────────────────────────────────────────────────────────────────────────────

/**
 * Bir değerin "küçük sayı (negatif) olmayan tam sayı" olduğunu doğrular.
 *
 * @param {number} value - Kontrol edilecek değer.
 * @param {string} name  - Hata mesajında kullanılan takma isim.
 * @throws {Error} Eğer tam sayı değilse veya negatifse.
 */
function assertNonNegativeInteger(value, name) {
  if (!Number.isInteger(value)) {
    throw new Error(`"${name}" bir tam sayı (integer) olmalıdır; alındı: ${value}.`);
  }
  if (value < 0) {
    throw new Error(`"${name}" negatif olabilir değil; alındı: ${value}.`);
  }
}

/**
 * Bir tabanın (base) kabul edilen aralıkta (2‑36) olduğunu doğrular.
 *
 * @param {number} base  - Taban değeri.
 * @param {string} [label] - Hata mesajındaki etiket (varsayılan "taban").
 * @throws {Error} Tarih aralığının dışında ise.
 */
function assertValidRadix(base, label = 'taban') {
  if (!Number.isInteger(base) || base < 2 || base > 36) {
    throw new Error(`"${label}" 2 ile 36 arasında bir tam sayı olmalıdır; alındı: ${base}.`);
  }
}

/**
 * Bir base‑N dizgesini güvenli hale getirir:
 * boşluk temizliği + geçersiz karakter / sütun kontrolü.
 * Böylece ' 1010  ', '1010 1010' gibi girişler sorunsuz çalışır;
 * ancak '12' (iki tabanda 2 geçerli değil) gibi hatalar net hata olarak yakalanır.
 *
 * @param {string} str        - Ham girdi dizesi.
 * @param {number} base       - Kaynak taban.
 * @param {string} sourceName - Hata mesajı için kaynak ismi.
 * @returns {string} ÜstCase, boşluktan arındırılmış dize.
 * @throws {Error} Geçersiz karakter veya boş girdi durumunda.
 */
export function normalizeBaseN(str, base, sourceName) {
  if (typeof str !== 'string' || str.trim() === '') {
    throw new Error(`"${sourceName}" boş olamaz.`);
  }
  const sanitized = str.trim().toUpperCase();

  // 0‑9 ve A‑Z dışındaki karakterleri yakala.
  if (/[^0-9A-Z]/.test(sanitized)) {
    throw new Error(
      `"${sourceName}" içinde 0‑9 ve A‑Z dışı bir karakter var. ` +
        'Sadece rakam ve harf (tabana göre sınırlı) kullanın.'
    );
  }

  for (let i = 0; i < sanitized.length; i++) {
    const digit = DIGITS.indexOf(sanitized[i]);
    if (digit === -1 || digit >= base) {
      throw new Error(
        `"${sourceName}" içinde "${base}" tabanında geçersiz rakam var: "${sanitized[i]}". ` +
          `Bu tabanda 0‑${base - 1} arası rakamlar geçerli.`
      );
    }
  }

  return sanitized;
}


// ────────────────────────────────────────────────────────────────────────────
//  3. ANA ÇEVİRME FONKSİYONLARI (temel algoritma)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Onluk (10) → Herhangi bir tabana (2‑36) dönüşüm.
 *
 * Algoritma: sürekli böl (divide), kalanları (remainder)
 * geriye ekle. Buna "repeated division" denir; sayının değeri bozulmadan
 * doğru şekilde hesaplanır. Nokta: sonuç, küçük olgularda en az bir tane
 * 0'dan oluşur.
 *
 * @param {number}  decimal - Onluk tamsayı (0 ve üzeri).
 * @param {number}  base    - Hedef taban (2‑36).
 * @returns {string}         Dönüşüm değeri.
 * @throws {Error}          Negatif veya geçersiz taban durumunda.
 *
 * @example
 *   decimalToBase(10,  2);  // '1010'
 *   decimalToBase(255, 16); // 'FF'
 */
export function decimalToBase(decimal, base) {
  assertNonNegativeInteger(decimal, 'girilen onluk değer');
  assertValidRadix(base);

  if (decimal === 0) return '0';

  const digits = DIGITS;
  let n = decimal;
  let result = '';

  while (n > 0) {
    const remainder = n % base;           // kalan
    result = digits[remainder] + result;  // kalanı başa ekle (ters sıra)
    n = Math.floor(n / base);             // bölerek ilerle
  }

  return result;
}

/**
 * Herhangi bir taban (2‑36) → Onluk (10) dönüşüm.
 *
 * Algoritma: her basamağı tabanı üstüyle çarp, kalanı topla
 * ("repeated multiplication"). Diğer taraftan söylersen 10'luk sistemle
 * hesaplama mantığı birebir aynıdır; sadece başta 10 varsayılır.
 *
 * @param {string} str - Taban N tamsayı dizesi (ör. '1010', 'FF').
 * @param {number} base - Kaynak taban (2‑36).
 * @returns {number}    Onluk karşılığı.
 * @throws {Error}      Geçersiz karakter durumunda.
 *
 * @example
 *   baseToDecimal('1010', 2);  // 10
 *   baseToDecimal('FF', 16);   // 255
 */
export function baseToDecimal(str, base) {
  assertValidRadix(base);

  // Küçük harfli 'ff' gibi girişleri toplayıcı olarak düzeltir.
  const sanitized = normalizeBaseN(str, base, 'girilen değer');
  if (sanitized === '') return 0;

  let result = 0;
  for (let i = 0; i < sanitized.length; i++) {
    const digit = DIGITS.indexOf(sanitized[i]);
    result = result * base + digit;
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
//  4. DÖNÜŞTÜRME KATLANMA SDL — İKİLİ / SEKİZLİ / ONALTILI KÖPRÜLER
// ────────────────────────────────────────────────────────────────────────────

/** Onluk → İkili (2) */
export function decimalToBinary(decimal) {
  return decimalToBase(decimal, BASES.BINARY);
}

/** Onluk → Sekizli (8) */
export function decimalToOctal(decimal) {
  return decimalToBase(decimal, BASES.OCTAL);
}

/** Onluk → Onaltılık / HEX (16) — büyük harfle döner. */
export function decimalToHex(decimal) {
  return decimalToBase(decimal, BASES.HEX).toUpperCase();
}

/** İkili (2) → Onluk (10) */
export function binaryToDecimal(binary) {
  return baseToDecimal(binary, BASES.BINARY);
}

/** Sekizli (8) → Onluk (10) */
export function octalToDecimal(octal) {
  return baseToDecimal(octal, BASES.OCTAL);
}

/** Onaltılık / HEX (16) → Onluk (10) */
export function hexToDecimal(hex) {
  return baseToDecimal(hex, BASES.HEX);
}


// ────────────────────────────────────────────────────────────────────────────
//  5. GENEL ŞEKİLDE DÖNÜŞTÜRME
// ────────────────────────────────────────────────────────────────────────────

/**
 * Çok amaçlı bir dönüşüm: `değer` zaten `fromBase` tabanında verilmişse
 * `toBase` tabanına çevirir.
 *
 * Kullanım: `convert('FF', 16, 2)` → '11111111'
 * `değer` onluk sayıysa ve `fromBase` 10 verilirse de çalışır.
 *
 * @param {string|number} value    - Dönüştürülen değer (taban veya onluk).
 * @param {number}        [fromBase] - Girdi tabanı (varsayılan 10).
 * @param {number}        toBase   - Çıktı tabanı.
 * @returns {string}               `toBase` tabanındaki sonuç.
 * @throws {Error}                  Taban/format hatası durumunda.
 *
 * @example
 *   convert(255, 16, 2);  // '11111111'
 *   convert('1010', 2, 10); // '10'
 */
export function convert(value, fromBase = BASES.DECIMAL, toBase) {
  if (toBase === undefined) {
    throw new Error('`toBase` parametresi zorunludur.');
  }
  assertValidRadix(toBase);

  // Tamsayı olarak verilmişse (onluk), doğrudan onluğa çevir.
  if (typeof value === 'number') {
    assertNonNegativeInteger(value, 'değer');
    return decimalToBase(value, toBase);
  }

  // Aksi halde tabanlı string olarak al ve tutarlı çalış.
  const fromDecimal = baseToDecimal(String(value), fromBase);
  return fromDecimal === 0 ? '0' : decimalToBase(fromDecimal, toBase);
}

// ────────────────────────────────────────────────────────────────────────────
//  6. YÜZEY DEĞERİNİ KORUYAN (width) BİLGİSEL AYARLAR
// ────────────────────────────────────────────────────────────────────────────

/**
 * Onluk değeri gösterir; `width` verilmezse çok sayıya bağlı kalmaz.
 *
 * @param {number}  decimal - Onluk tamsayı.
 * @param {number}  [width] - Minimum karakter sayısı (isteğe bağlı).
 * @returns {string}         Dönüşüm değeri.
 */
export function formatDecimal(decimal, width) {
  assertNonNegativeInteger(decimal, 'değişken');
  const s = String(decimal);
  return width != null ? s.padStart(width, '0') : s;
}

/**
 * Onluk değeri İKİLİ formatında gösterir.
 * `width` varsayılan 8 (8‑bitlik terser bellek gibi); 0‑255 aralığı
 * tamamlayan sayısal değerler için sabit genişlik sunar.
 *
 * @param {number}  decimal - Onluk tamsayı.
 * @param {number}  [width] - Minimum karakter sayısı (varsayılan 8).
 * @returns {string}         '00001010' gibi uzunluk fazla büyütülmüş binary.
 */
export function formatBinary(decimal, width = 8) {
  assertNonNegativeInteger(decimal, 'değişken');
  const s = decimalToBinary(decimal);
  return width != null ? s.padStart(width, '0') : s;
}

/**
 * Onluk değeri ONALTILI formatında gösterir.
 * `width` varsayılan 2'dir; 32‑bit gösterim için 8 veya 10 verilebilir.
 *
 * @param {number}  decimal - Onluk tamsayı.
 * @param {number}  [width] - Minimum karakter sayısı (varsayılan 2).
 * @returns {string}         'FF', '00FF', '000000FF' gibi genişletilmiş hex.
 */
export function formatHex(decimal, width = 2) {
  assertNonNegativeInteger(decimal, 'değişken');
  const s = decimalToHex(decimal);
  return width != null ? s.padStart(width, '0') : s;
}

/**
 * Onluk değeri SEKİZLİ formatında gösterir.
 *
 * @param {number}  decimal - Onluk tamsayı.
 * @param {number}  [width] - Minimum karakter sayısı (varsayılan 3).
 * @returns {string}         '14', '014' gibi genişletilmiş octal.
 */
export function formatOctal(decimal, width = 3) {
  assertNonNegativeInteger(decimal, 'değişken');
  const s = decimalToOctal(decimal);
  return width != null ? s.padStart(width, '0') : s;
}


// ────────────────────────────────────────────────────────────────────────────
//  7. ASCII – METİN <-> HEX <-> KOD ARASI DÖNÜŞTÜRÜM
// ────────────────────────────────────────────────────────────────────────────

/**
 * Bir charCode (0‑65535) aldı; ASCII tabelası içinde o koda karşılık gelen
 * karakteri döndürür.
 *  • 0‑127  : klasik ASCII
 *  • 128+   : genelde Unicode / UTF‑16 (Türkçe ö, ç, ı, ğ, ş ve diğerleri
 *             Asklepios 128 ustu olduğundan burada ayrıca işlenir).
 *
 * @param {number} code - Karakter kodu (0‑65535 kabul edilir).
 * @returns {string}     Kodun temsil ettiği tek karakter veya belirtme.
 * @throws {Error}       Kod geçerli değilse.
 */
export function asciiCodeToChar(code) {
  if (!Number.isInteger(code) || code < 0 || code > 65535) {
    throw new Error('ASCII kodu 0‑65535 arasında bir tamsayı olmalıdır.');
  }
  if (code > 127) {
    // 128+ değerler genellikle Unicode/UTF‑16'dır.
    return String.fromCharCode(code);
  }
  // 0‑31 ve 127: kontrollü (control) karakterler.
  if (code < 32 || code === 127) {
    return `U+${code.toString(16).padStart(2, '0')}  (kontrol karakteri)`;
  }
  // 32‑126: yazdırılabilir ASCII.
  return String.fromCharCode(code);
}

/**
 * Bir dizedeki her karakterin Unicode/ASCII kodunu (dec) gösteren dizi döner.
 *
 * @param {string} str - Girdi dizesi.
 * @returns {number[]}  Kod dizisi.
 */
export function stringToAscii(str) {
  const codes = [];
  for (let i = 0; i < str.length; i++) {
    codes.push(str.charCodeAt(i));
  }
  return codes;
}

/**
 * Bir dizeyi ASCII kodlarına (hex) dönüştürür. Her byte 2‑haneli hex olarak
 * gelir ve aralarında boşluk konur.
 *
 * Örnek: stringToHex('AB') → '41 42'
 *
 * @param {string} str             - Girdi dizesi.
 * @param {number} [bytesPerGroup] - Gruplandırma (default 1 = her char tek byte).
 * @returns {string} HEX stringi.
 */
export function stringToHex(str, bytesPerGroup = 1) {
  const codes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code > 255) {
      throw new Error(
        'Bu fonksiyon sadece 0‑255 arası (bayt) kodlar kabul eder. ' +
          'Uzun Unicode için `hexToStringSafe` kullanın.'
      );
    }
    codes.push(code.toString(16).padStart(2, '0'));
  }
  return codes.join(' ');
}

/**

 * HEX stringini dizge çevirir. Boşluk, ondalık virgül veya veri URL si gibi
 * ayrıştırılmış hallerdeki grupları birlikte işler.
 *
 * Örnek: hexToString('48 65 6c 6c 6f') → 'Hello'
 *
 * @param {string} hex - HEX stringi (boşluk/virgülle ayrılmış olabilir).
 * @returns {string}     Dönüşüm değeri.
 * @throws {Error}       Geçersiz HEX token veya 0‑255 dışı koda sahipken.
 */
export function hexToString(hex) {
  const trimmed = String(hex).trim();
  if (trimmed === '') return '';

  // Boşluk veya virgülle ayrılmış grupları bu parçada ayrıştır.
  const tokens = trimmed.split(/[\s,]+/).filter((t) => t !== '');
  if (tokens.length === 0) return '';

  const codes = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const code = parseInt(token, 16);
    if (Number.isNaN(code) || code < 0 || code > 255) {
      throw new Error(`HEX tokeni "${token}" 0‑255 arasında bir değer olmalıdır.`);
    }
    codes.push(code);
  }

  // Küçük (Asklepios, HTML işaretleri) için sorun yoktur.
  return String.fromCharCode(...codes);
}

/**
 * `hexToString` ile aynı işi yapar; adı daha anlaşılır.
 *
 * @param {string} hex - HEX stringi.
 * @returns {string}     Dönüşüm değeri.
 */
export function hexToText(hex) {
  return hexToString(hex);
}

/**
 * 32‑126 arasındaki yazdırılabilir ASCII tablosunu oluşturur.
 * Her öğe: { code, hex, char, type } şeklinde;
 * `type` alanı 'control' | 'printable' | 'extended' (128+) olabilir.
 *
 * @param {number} [start=32] - Başlangıç kodu (32 = boşluk).
 * @param {number} [end=126]  - Bitiş kodu (126 = '~').
 * @returns {Array<{code:number, hex:string, char:string, type:string}>}
 */
export function generateAsciiTable(start = 32, end = 126) {
  const rows = [];
  for (let code = start; code <= end; code++) {
    const isControl = code < 32 || code === 127;
    const isPrintable = code >= 32 && code <= 126;
    const isExtended = code > 127;
    let char = '';
    if (isControl) {
      char = `U+${code.toString(16).padStart(2, '0')}`;
    } else if (isPrintable) {
      char = String.fromCharCode(code);
    } else {
      char = `U+${code.toString(16).padStart(4, '0')}`;
    }
    rows.push({
      code,
      hex: code.toString(16).padStart(2, '0').toUpperCase(),
      char,
      type: isControl ? 'control' : isExtended ? 'extended' : 'printable',
    });
  }
  return rows;
}

/**
 * `hexToString` ile aynı işi yapar, ancak çok uzun (100+ karakter) dizelere
 * dönüştürmek isteyenler için (argument limiti altına düşürmek için)
 * ardışık parçalara böler.
 *
 * @param {string} hex - HEX stringi.
 * @returns {string}     Dönüşüm değeri.
 */
export function hexToStringSafe(hex) {
  const trimmed = String(hex).trim();
  if (trimmed === '') return '';
  const tokens = trimmed.split(/[\s,]+/).filter((t) => t !== '');
  const chunkSize = 6000; // ~ 6000 * 2 hex chars = 12000 arg sınırı
  const chunks = [];
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const part = tokens.slice(i, i + chunkSize);
    chunks.push(
      String.fromCharCode(
        ...part.map((t) => parseInt(t, 16))
      )
    );
  }
  return chunks.join('');
}


// ────────────────────────────────────────────────────────────────────────────
//  8. BAZALAR ARASINDA "AYRINTI" DÖNÜŞÜMLER
// ────────────────────────────────────────────────────────────────────────────

/**
 * İkili (2) → Sekizli (8) dönüşümü: 3 bitlik kümeler.
 * İkibiti 3'e tamamlayın (solda sıfır doldurma), 3‑3 gruplandırın.
 * Her kümenin onluk karşılığı octal basamağı olur.
 *
 * @param {string} binary - İkili dize.
 * @returns {string} Octal stringi.
 */
export function binaryToOctal(binary) {
  const sanitized = binary.trim();
  if (!/^[01]+$/.test(sanitized)) {
    throw new Error('İkili sistemde yalnızca 0 ve 1 karakterleri kullanılabilir.');
  }
  const padded = sanitized.padStart(Math.ceil(sanitized.length / 3) * 3, '0');
  let octal = '';
  for (let i = 0; i < padded.length; i += 3) {
    const group = padded.slice(i, i + 3);
    const val = group[0] * 4 + group[1] * 2 + group[2] * 1;
    octal += val;
  }
  return octal;
}

/**
 * Sekizli (8) → İkili (2) dönüşümü: her octal basamağını 3 bitle genişletir.
 *
 * @param {string} octal - Sekizli dize.
 * @returns {string} İkili stringi.
 */
export function octalToBinary(octal) {
  const sanitized = octal.trim().toUpperCase();
  if (!/^[0-7]+$/.test(sanitized)) {
    throw new Error('Sekizli sistemde yalnızca 0‑7 rakamları kullanılabilir.');
  }
  let binary = '';
  for (let i = 0; i < sanitized.length; i++) {
    const digit = Number(sanitized[i]);
    binary += digit.toString(2).padStart(3, '0');
  }
  return binary;
}

/**
 * İkili (2) → Onaltılık/HEX (16) dönüşümü: 4 bitlik kümeler.
 *
 * @param {string} binary - İkili dize.
 * @returns {string} HEX stringi.
 */
export function binaryToHex(binary) {
  const sanitized = binary.trim();
  if (!/^[01]+$/.test(sanitized)) {
    throw new Error('İkili sistemde yalnızca 0 ve 1 karakterleri kullanılabilir.');
  }
  const padded = sanitized.padStart(Math.ceil(sanitized.length / 4) * 4, '0');
  let hex = '';
  for (let i = 0; i < padded.length; i += 4) {
    const group = padded.slice(i, i + 4);
    const val = group[0] * 8 + group[1] * 4 + group[2] * 2 + group[3] * 1;
    hex += val.toString(16).toUpperCase();
  }
  return hex;
}

/**
 * Onaltılık/HEX (16) → İkili (2) dönüşümü: her HEX basamağını 4 bitle genişletir.
 *
 * @param {string} hex - Onaltılık dize.
 * @returns {string} İkili stringi.
 */
export function hexToBinary(hex) {
  const sanitized = hex.trim().toUpperCase();
  if (!/^[0-9A-F]+$/.test(sanitized)) {
    throw new Error('Onaltılık sistemde yalnızca 0‑9 ve A‑F karakterleri kullanılabilir.');
  }
  let binary = '';
  for (let i = 0; i < sanitized.length; i++) {
    const digit = sanitized[i];
    const val = parseInt(digit, 16);
    binary += val.toString(2).padStart(4, '0');
  }
  return binary;
}

/**
 * Sekizli (8) → Onaltılık/HEX (16) dönüşümü.
 *
 * @param {string} octal - Sekizli dize.
 * @returns {string} HEX stringi.
 */
export function octalToHex(octal) {
  const decimal = octalToDecimal(octal);
  return decimalToHex(decimal);
}

/**
 * Onaltılık/HEX (16) → Sekizli (8) dönüşümü.
 *
 * @param {string} hex - Onaltılık dize.
 * @returns {string} Octal stringi.
 */
export function hexToOctal(hex) {
  const decimal = hexToDecimal(hex);
  return decimalToOctal(decimal);
}

/**
 * Kodun yazdırılabilir ASCII (32‑126) olup olmadığını belirler.
 *
 * @param {number} code - Kontrol edilecek karakter kodu.
 * @returns {boolean}
 */
export function isPrintableAscii(code) {
  return Number.isInteger(code) && code >= 32 && code <= 126;
}


// ────────────────────────────────────────────────────────────────────────────
//  9. MODÜL EKRANI (namespace) – Sunum / Eğitim için
// ────────────────────────────────────────────────────────────────────────────

/** Asıl fonksiyonları tek adreste görüntülemek için bir "kategori". */
export const NumberSystems = {
  BASES,
  decimalToBase,
  baseToDecimal,
  decimalToBinary,
  decimalToOctal,
  decimalToHex,
  binaryToDecimal,
  octalToDecimal,
  hexToDecimal,
  convert,
  formatDecimal,
  formatBinary,
  formatHex,
  formatOctal,
  binaryToOctal,
  octalToBinary,
  binaryToHex,
  hexToBinary,
  octalToHex,
  hexToOctal,
  stringToHex,
  hexToString,
  hexToStringSafe,
  hexToText,
  stringToAscii,
  asciiCodeToChar,
  generateAsciiTable,
  isPrintableAscii: (code) =>
    Number.isInteger(code) && code >= 32 && code <= 126,
};

