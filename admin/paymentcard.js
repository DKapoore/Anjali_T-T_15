// ---------------------------------------------------------------------
// paymentcard.js
// Renders the branded, bilingual payment-card PNG entirely client-side
// using <canvas> + the qrcode.js library (loaded in index.html). No paid
// AI image API is used - this is a business information card, drawn with
// plain 2D canvas drawing (section 37).
//
// Devanagari text (section 38) uses the "Noto Sans Devanagari" web font
// loaded via Google Fonts in index.html. We wait for document.fonts to
// finish loading before drawing so characters never render as boxes.
// ---------------------------------------------------------------------

const CARD_W = 1080;
const CARD_H_MIN = 1350; // never shrink below this - actual height grows to fit content (see generatePaymentCardDataUrl)

const CARD_STRINGS = {
  EN: {
    heading: 'BOOKING PAYMENT',
    booking_id: 'Booking ID', travel_date: 'Travel Date', pickup: 'Pickup', drop: 'Drop',
    trip_type: 'Trip Type', total_fare: 'Total Fare', advance_required: 'Advance Required', balance: 'Balance',
    instr1: 'Please pay the advance using the UPI QR shared with you.',
    instr2: 'After payment, please send the payment screenshot/reference on this WhatsApp number.',
    for_booking: 'For Booking & Assistance', whatsapp_available: 'WhatsApp Available'
  },
  HI: {
    heading: 'बुकिंग भुगतान',
    booking_id: 'बुकिंग आईडी', travel_date: 'यात्रा की तारीख', pickup: 'पिकअप', drop: 'ड्रॉप',
    trip_type: 'यात्रा प्रकार', total_fare: 'कुल किराया', advance_required: 'एडवांस राशि', balance: 'बाकी राशि',
    instr1: 'कृपया UPI QR का उपयोग करके एडवांस भुगतान करें।',
    instr2: 'भुगतान के बाद कृपया इस WhatsApp नंबर पर पेमेंट का स्क्रीनशॉट/रेफरेंस भेजें।',
    for_booking: 'बुकिंग और सहायता के लिए', whatsapp_available: 'WhatsApp उपलब्ध'
  }
};

async function ensureCardFontsLoaded_() {
  try {
    await Promise.all([
      document.fonts.load('700 40px "Noto Sans"'),
      document.fonts.load('600 30px "Noto Sans"'),
      document.fonts.load('400 26px "Noto Sans"'),
      document.fonts.load('700 40px "Noto Sans Devanagari"'),
      document.fonts.load('600 30px "Noto Sans Devanagari"'),
      document.fonts.load('400 26px "Noto Sans Devanagari"')
    ]);
    await document.fonts.ready;
  } catch (e) { /* fonts best-effort; canvas falls back to system font */ }
}

function roundRect_(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fontStack_(weight, size) {
  return weight + ' ' + size + 'px "Noto Sans", "Noto Sans Devanagari", sans-serif';
}

function wrapText_(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  words.forEach(word => {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines;
}

async function drawQrToCanvas_(text, size) {
  if (typeof QRCode === 'undefined') {
    // Should not happen (see index.html script order), but if the CDN
    // is blocked/offline this tells the admin exactly why, instead of
    // the card silently coming out with no QR and no explanation.
    throw new Error('QR_LIBRARY_NOT_LOADED');
  }
  const qrCanvas = document.createElement('canvas');
  await new Promise((resolve, reject) => {
    QRCode.toCanvas(qrCanvas, text, { width: size, margin: 1, errorCorrectionLevel: 'M' }, (err) => {
      if (err) reject(err); else resolve();
    });
  });
  return qrCanvas;
}

async function loadImageFromDataUrl_(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * options: {
 *   businessName, logoDataUrl (or ''), footerText, tagline, address,
 *   cardLanguage: 'EN_HI' | 'EN' | 'HI',
 *   bookingId, travelDateDisplay, pickup, destination, tripType,
 *   totalFareDisplay, advanceDisplay, balanceDisplay,
 *   upiUri, whatsappNumberDisplay
 * }
 * Returns a PNG data URL.
 */
async function generatePaymentCardDataUrl(options) {
  await ensureCardFontsLoaded_();

  // Anything async that the paint pass needs must be resolved BEFORE we
  // know the final canvas height (resizing a canvas clears it, so the
  // paint pass itself must be a plain, synchronous function we can run
  // twice: once to measure the content's natural height, once for real).
  let logoImg = null;
  if (options.logoDataUrl) {
    try { logoImg = await loadImageFromDataUrl_(options.logoDataUrl); } catch (e) { logoImg = null; }
  }
  let qrCanvas = null;
  if (options.upiUri) {
    const qrSize = 380;
    qrCanvas = await drawQrToCanvas_(options.upiUri, qrSize - 40);
  }

  const PRIMARY = '#0f5132';
  const PRIMARY_DARK = '#0a3d24';
  const TEXT = '#1c2521';
  const MUTED = '#6b7770';
  const BORDER = '#e2e6e4';
  const BG_SOFT = '#eef6f0';
  const padX = 70;
  const boxW = CARD_W - padX * 2;
  const langs = options.cardLanguage === 'EN' ? ['EN'] : options.cardLanguage === 'HI' ? ['HI'] : ['EN', 'HI'];

  // Paints the entire card onto `ctx` (a context already sized to
  // CARD_W x cardHeight) and returns the final cy reached after the
  // footer - the actual content height, independent of cardHeight
  // itself. Pure and synchronous by design so it can safely be called
  // twice (once to measure, once to draw for real) without redoing any
  // network/async work.
  function paint(ctx, cardHeight) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CARD_W, cardHeight);

    const grad = ctx.createLinearGradient(0, 0, CARD_W, 0);
    grad.addColorStop(0, PRIMARY);
    grad.addColorStop(1, PRIMARY_DARK);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CARD_W, 260);

    let cy = 46;

    // ---- Circular logo ----
    const logoR = 78;
    const logoCx = CARD_W / 2;
    const logoCy = cy + logoR;
    ctx.save();
    ctx.beginPath();
    ctx.arc(logoCx, logoCy, logoR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.clip();
    if (logoImg) {
      const scale = Math.max((logoR * 2) / logoImg.width, (logoR * 2) / logoImg.height);
      const dw = logoImg.width * scale, dh = logoImg.height * scale;
      ctx.drawImage(logoImg, logoCx - dw / 2, logoCy - dh / 2, dw, dh);
    } else {
      drawFallbackLogo_(ctx, logoCx, logoCy, logoR, PRIMARY);
    }
    ctx.restore();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(logoCx, logoCy, logoR, 0, Math.PI * 2);
    ctx.stroke();

    cy = logoCy + logoR + 34;

    // ---- Business name ----
    ctx.fillStyle = '#ffffff';
    ctx.font = fontStack_(700, 42);
    ctx.textAlign = 'center';
    ctx.fillText(options.businessName || 'Anjali Tours & Travel', CARD_W / 2, cy);
    cy += 30;

    if (options.tagline) {
      ctx.font = fontStack_(400, 22);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(options.tagline, CARD_W / 2, cy);
    }

    // ---- Heading ----
    cy = 300;
    ctx.fillStyle = PRIMARY_DARK;
    ctx.font = fontStack_(700, 34);
    ctx.fillText(langs.map(l => CARD_STRINGS[l].heading).join(' / '), CARD_W / 2, cy);
    cy += 44;

    // ---- Detail rows card ----
    const rows = [
      ['booking_id', options.bookingId],
      ['travel_date', options.travelDateDisplay],
      ['pickup', options.pickup],
      ['drop', options.destination],
      ['trip_type', options.tripType],
      ['total_fare', options.totalFareDisplay],
      ['advance_required', options.advanceDisplay],
      ['balance', options.balanceDisplay]
    ];
    const rowH = langs.length > 1 ? 66 : 50;
    const boxH = rows.length * rowH + 30;

    ctx.fillStyle = '#fbfcfb';
    roundRect_(ctx, padX, cy, boxW, boxH, 18);
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1.5;
    roundRect_(ctx, padX, cy, boxW, boxH, 18);
    ctx.stroke();

    let ry = cy + 26;
    rows.forEach(([key, value], idx) => {
      const label = langs.map(l => CARD_STRINGS[l][key]).join(' / ');
      ctx.textAlign = 'left';
      ctx.fillStyle = MUTED;
      ctx.font = fontStack_(600, 24);
      ctx.fillText(label, padX + 30, ry);
      ctx.textAlign = 'right';
      const highlight = key === 'advance_required';
      ctx.fillStyle = highlight ? PRIMARY_DARK : TEXT;
      ctx.font = fontStack_(highlight ? 700 : 600, highlight ? 30 : 26);
      ctx.fillText(String(value == null ? '-' : value), padX + boxW - 30, ry + (highlight ? 2 : 0));
      ry += rowH;
      if (idx < rows.length - 1) {
        ctx.strokeStyle = BORDER;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padX + 24, ry - rowH / 2 + 8);
        ctx.lineTo(padX + boxW - 24, ry - rowH / 2 + 8);
        ctx.stroke();
      }
    });

    cy = cy + boxH + 40;

    // ---- QR code (amount stated directly above it, so the amount and
    // the QR read as one unit, not just another row in the table) ----
    if (qrCanvas) {
      const scanLabel = langs.map(l => (l === 'HI' ? 'स्कैन करें और भुगतान करें' : 'Scan & Pay')).join(' / ');
      ctx.textAlign = 'center';
      ctx.fillStyle = PRIMARY_DARK;
      ctx.font = fontStack_(700, 28);
      ctx.fillText(scanLabel, CARD_W / 2, cy);
      cy += 58;
      ctx.font = fontStack_(700, 44);
      ctx.fillStyle = PRIMARY;
      ctx.fillText(options.advanceDisplay || '', CARD_W / 2, cy);
      cy += 40;

      const qrSize = 380;
      const qrBoxX = (CARD_W - qrSize) / 2;
      ctx.fillStyle = '#ffffff';
      roundRect_(ctx, qrBoxX, cy, qrSize, qrSize, 20);
      ctx.fill();
      ctx.strokeStyle = BORDER;
      roundRect_(ctx, qrBoxX, cy, qrSize, qrSize, 20);
      ctx.stroke();
      ctx.drawImage(qrCanvas, qrBoxX + 20, cy + 20, qrSize - 40, qrSize - 40);
      cy += qrSize + 36;
    } else {
      ctx.fillStyle = BG_SOFT;
      roundRect_(ctx, (CARD_W - 700) / 2, cy, 700, 90, 14);
      ctx.fill();
      ctx.fillStyle = '#b3261e';
      ctx.font = fontStack_(600, 26);
      ctx.textAlign = 'center';
      ctx.fillText('Please configure UPI ID in Admin Settings.', CARD_W / 2, cy + 55);
      cy += 90 + 36;
    }

    // ---- Instructions ----
    ctx.textAlign = 'center';
    langs.forEach(l => {
      [CARD_STRINGS[l].instr1, CARD_STRINGS[l].instr2].forEach(line => {
        ctx.font = fontStack_(400, 24);
        ctx.fillStyle = TEXT;
        const wrapped = wrapText_(ctx, line, CARD_W - 140);
        wrapped.forEach(w => { ctx.fillText(w, CARD_W / 2, cy); cy += 32; });
      });
      cy += 8;
    });

    // ---- Footer - placed dynamically right after the content above,
    // NEVER hard-anchored to the bottom of a fixed-height canvas (that
    // was the bug: fixed content could overflow past a fixed anchor
    // point and overlap the QR/instructions above it). ----
    cy += 30;
    ctx.strokeStyle = BORDER;
    ctx.beginPath();
    ctx.moveTo(padX, cy);
    ctx.lineTo(CARD_W - padX, cy);
    ctx.stroke();
    cy += 40;

    ctx.fillStyle = PRIMARY_DARK;
    ctx.font = fontStack_(700, 26);
    ctx.fillText((options.businessName || 'Anjali Tours & Travel').toUpperCase(), CARD_W / 2, cy);
    cy += 34;
    ctx.fillStyle = MUTED;
    ctx.font = fontStack_(400, 22);
    const forBookingLabel = langs.map(l => CARD_STRINGS[l].for_booking).join(' / ');
    ctx.fillText(forBookingLabel + ': ' + (options.whatsappNumberDisplay || ''), CARD_W / 2, cy);
    cy += 30;
    ctx.fillStyle = '#25d366';
    ctx.font = fontStack_(600, 22);
    ctx.fillText(langs.map(l => CARD_STRINGS[l].whatsapp_available).join(' / '), CARD_W / 2, cy);
    cy += 40; // bottom breathing room

    return cy;
  }

  const canvas = document.getElementById('cardCanvas');

  // Pass 1: measure. A generously tall scratch canvas, never shown -
  // only used to find out how tall the real one needs to be.
  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = CARD_W;
  measureCanvas.height = 2400;
  const naturalHeight = paint(measureCanvas.getContext('2d'), 2400);

  // Pass 2: draw for real, on a canvas sized to fit exactly (never
  // smaller than the original design height).
  const finalHeight = Math.max(CARD_H_MIN, naturalHeight);
  canvas.width = CARD_W;
  canvas.height = finalHeight;
  paint(canvas.getContext('2d'), finalHeight);

  return canvas.toDataURL('image/png');
}

function drawFallbackLogo_(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.font = 'bold ' + Math.floor(r) + 'px "Noto Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AT', cx, cy);
  ctx.textBaseline = 'alphabetic';
}

/**
 * Resizes/compresses an uploaded logo file to a small square PNG data URL
 * (max 320x320) so it stays well under the Google Sheets cell size limit
 * when stored in Settings. Does not touch the admin's original file.
 */
async function resizeLogoFile(file, maxSize) {
  maxSize = maxSize || 320;
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await loadImageFromDataUrl_(dataUrl);
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}
