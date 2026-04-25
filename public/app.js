/* ── State ───────────────────────────────────────────────────────────────── */
let currentTab = 'home';
let stickerType = 'whatsapp';
let stickerDownloadUrl = null;
let deferredInstallPrompt = null;

/* ── Navigation ──────────────────────────────────────────────────────────── */
function navigate(tab) {
  document.getElementById(`page-${currentTab}`).classList.remove('active');
  document.getElementById(`tab-${currentTab}`).classList.remove('active');
  document.getElementById(`tab-${currentTab}`).querySelector('i').classList.replace('ph-fill', 'ph');
  currentTab = tab;
  document.getElementById(`page-${tab}`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`tab-${currentTab}`).querySelector('i').classList.replace('ph', 'ph-fill');

  if (tab === 'history') loadHistory();
}

/* ── Status ──────────────────────────────────────────────────────────────── */
async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    const dot = document.getElementById('status-dot');
    dot.classList.toggle('online', data.online);
    document.getElementById('info-bot').textContent = data.online
      ? `@${data.botUsername} ✓` : 'Offline';
    document.getElementById('stat-uptime').textContent =
      Math.floor(data.uptime / 60);
  } catch {
    document.getElementById('info-bot').textContent = 'Sin conexión';
  }
}

async function loadHomeStats() {
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    document.getElementById('stat-downloads').textContent = data.items?.length ?? 0;
  } catch { /* ignore */ }
}

/* ── Platform detection ──────────────────────────────────────────────────── */
const PLATFORMS = {
  youtube:   { label: 'YouTube',    icon: 'ph-youtube-logo' },
  youtu:     { label: 'YouTube',    icon: 'ph-youtube-logo' },
  tiktok:    { label: 'TikTok',     icon: 'ph-tiktok-logo' },
  instagram: { label: 'Instagram',  icon: 'ph-instagram-logo' },
  twitter:   { label: 'Twitter/X',  icon: 'ph-x-logo' },
  'x.com':   { label: 'Twitter/X',  icon: 'ph-x-logo' },
  facebook:  { label: 'Facebook',   icon: 'ph-facebook-logo' },
  reddit:    { label: 'Reddit',     icon: 'ph-reddit-logo' },
  twitch:    { label: 'Twitch',     icon: 'ph-twitch-logo' },
  vimeo:     { label: 'Vimeo',      icon: 'ph-video' },
};

function detectPlatform(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const [key, val] of Object.entries(PLATFORMS)) {
      if (host.includes(key)) return val;
    }
  } catch { /* invalid url */ }
  return null;
}

document.getElementById('dl-url').addEventListener('input', function () {
  const badge = document.getElementById('dl-badge');
  const p = detectPlatform(this.value.trim());
  if (p) {
    badge.innerHTML = `<i class="ph ${p.icon}"></i> ${p.label}`;
    badge.className = 'platform-badge detected';
  } else {
    badge.innerHTML = '<i class="ph ph-globe"></i> Pegá una URL para detectar';
    badge.className = 'platform-badge';
  }
});

/* ── Downloader ──────────────────────────────────────────────────────────── */
function resetDownloader() {
  document.getElementById('dl-step2').style.display = 'none';
  document.getElementById('dl-result').classList.remove('visible');
  document.getElementById('dl-error').classList.remove('visible');
}

async function analyzeUrl() {
  const url = document.getElementById('dl-url').value.trim();
  if (!url) return;

  const btn = document.getElementById('dl-analyze-btn');
  const errEl = document.getElementById('dl-error');
  
  resetDownloader();
  btn.disabled = true;
  btn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Analizando…';

  try {
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();

    if (!data.success) throw new Error(data.error || 'Error al analizar link');

    document.getElementById('dl-thumb').src = data.info.thumbnail || '';
    document.getElementById('dl-info-title').textContent = data.info.title || 'Video';
    
    const select = document.getElementById('dl-format-select');
    select.innerHTML = '';
    
    // Default best
    select.innerHTML += `<option value="best">🌟 Mejor Calidad (Automático)</option>`;
    // Audio only
    select.innerHTML += `<option value="audio">🎵 Solo Audio (MP3)</option>`;

    // Available formats
    if (data.info.formats && data.info.formats.length > 0) {
      data.info.formats.forEach(f => {
        const fps = f.fps ? ` ${f.fps}fps` : '';
        select.innerHTML += `<option value="${f.format_id}">🎞️ ${f.resolution || 'Video'}${fps} (${f.ext})</option>`;
      });
    }

    document.getElementById('dl-step2').style.display = 'block';
  } catch (err) {
    errEl.textContent = '❌ ' + err.message;
    errEl.classList.add('visible');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ph ph-magnifying-glass"></i> <span>Analizar Link</span>';
  }
}

async function startDownload() {
  const url = document.getElementById('dl-url').value.trim();
  const format = document.getElementById('dl-format-select').value;
  if (!url) return;

  const btn = document.getElementById('dl-btn');
  const result = document.getElementById('dl-result');
  const errEl = document.getElementById('dl-error');

  result.classList.remove('visible');
  errEl.classList.remove('visible');
  btn.disabled = true;
  btn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Descargando…';

  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format }),
    });
    const data = await res.json();

    if (!data.success) throw new Error(data.error || 'Error al descargar');

    document.getElementById('dl-title').textContent = data.title || data.filename;
    const link = document.getElementById('dl-link');
    link.href = data.downloadUrl;
    link.download = data.filename;
    result.classList.add('visible');
  } catch (err) {
    errEl.textContent = '❌ ' + err.message;
    errEl.classList.add('visible');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ph ph-download-simple"></i> <span>Descargar Selección</span>';
  }
}

// Enter key on URL input
document.getElementById('dl-url').addEventListener('keydown', e => {
  if (e.key === 'Enter') analyzeUrl();
});

/* ── Stickers ────────────────────────────────────────────────────────────── */
function setStickerType(type) {
  stickerType = type;
  document.getElementById('sticker-toggles').dataset.state = type;
  document.getElementById('toggle-wa').classList.toggle('active', type === 'whatsapp');
  document.getElementById('toggle-tg').classList.toggle('active', type === 'telegram');
  // Reset result
  document.getElementById('sticker-result').classList.remove('visible');
  document.getElementById('sticker-error').classList.remove('visible');
}

function onFileSelected() {
  const file = document.getElementById('sticker-file').files[0];
  if (!file) return;

  const imgPreview = document.getElementById('sticker-preview');
  const vidPreview = document.getElementById('sticker-video-preview');
  
  imgPreview.classList.remove('visible');
  imgPreview.style.display = 'none';
  vidPreview.classList.remove('visible');
  vidPreview.style.display = 'none';

  const objUrl = URL.createObjectURL(file);

  if (file.type.startsWith('video/')) {
    vidPreview.src = objUrl;
    vidPreview.style.display = 'block';
    // Pequeño timeout para que se aplique el display block antes de animar
    setTimeout(() => vidPreview.classList.add('visible'), 10);
  } else {
    imgPreview.src = objUrl;
    imgPreview.style.display = 'block';
    setTimeout(() => imgPreview.classList.add('visible'), 10);
  }

  document.getElementById('sticker-btn').disabled = false;
  document.getElementById('sticker-result').classList.remove('visible');
  document.getElementById('sticker-error').classList.remove('visible');
}

// Drag & drop
const zone = document.getElementById('upload-zone');
zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
zone.addEventListener('drop', e => {
  e.preventDefault();
  zone.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type.startsWith('image/')) {
    const input = document.getElementById('sticker-file');
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    onFileSelected();
  }
});

async function convertSticker() {
  const file = document.getElementById('sticker-file').files[0];
  if (!file) return;

  const btn = document.getElementById('sticker-btn');
  const result = document.getElementById('sticker-result');
  const errEl = document.getElementById('sticker-error');

  result.classList.remove('visible');
  errEl.classList.remove('visible');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Convirtiendo…';

  try {
    const form = new FormData();
    form.append('image', file);
    form.append('type', stickerType);

    const res = await fetch('/api/sticker', { method: 'POST', body: form });
    const data = await res.json();

    if (!data.success) throw new Error(data.error || 'Error al convertir');

    stickerDownloadUrl = data.downloadUrl;
    document.getElementById('sticker-size').textContent = `Tamaño: ${data.sizeKb} KB`;
    const link = document.getElementById('sticker-link');
    link.href = data.downloadUrl;

    // Mostrar botón de compartir solo si Web Share API soporta archivos
    const shareBtn = document.getElementById('sticker-share');
    shareBtn.style.display = (navigator.share && stickerType === 'whatsapp') ? 'flex' : 'none';

    result.classList.add('visible');
  } catch (err) {
    errEl.textContent = '❌ ' + err.message;
    errEl.classList.add('visible');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Convertir</span>';
  }
}

async function shareSticker() {
  if (!stickerDownloadUrl) return;
  try {
    const response = await fetch(stickerDownloadUrl);
    const blob = await response.blob();
    const file = new File([blob], 'sticker.webp', { type: 'image/webp' });

    if (navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Sticker para WhatsApp' });
    } else {
      // Fallback: descarga directa
      const a = document.createElement('a');
      a.href = stickerDownloadUrl;
      a.download = 'sticker.webp';
      a.click();
    }
  } catch (err) {
    if (err.name !== 'AbortError') console.error('Share failed:', err);
  }
}

/* ── History ─────────────────────────────────────────────────────────────── */
async function loadHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '<div class="empty-state"><i class="ph ph-spinner-gap ph-spin"></i><div>Cargando…</div></div>';

  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    const items = data.items ?? [];

    if (items.length === 0) {
      list.innerHTML = '<div class="empty-state"><i class="ph ph-tray"></i><div>No hay descargas recientes.</div></div>';
      return;
    }

    list.innerHTML = items.map(item => {
      const p = PLATFORMS[item.platform.toLowerCase()] || Object.values(PLATFORMS).find(x => x.label.toLowerCase() === item.platform.toLowerCase());
      const icon = p ? p.icon : 'ph-globe';
      const date = new Date(item.created_at).toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
      const size = item.filesize_mb != null ? `${item.filesize_mb} MB · ` : '';
      return `
        <div class="history-item">
          <div class="history-icon"><i class="ph ${icon}"></i></div>
          <div class="history-info">
            <div class="history-title">${escHtml(item.filename)}</div>
            <div class="history-meta">${size}${item.platform} · ${date}</div>
          </div>
        </div>`;
    }).join('');
  } catch {
    list.innerHTML = '<div class="empty-state"><i class="ph ph-warning"></i><div>No se pudo cargar la actividad.</div></div>';
  }
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Storage Management ──────────────────────────────────────────────────── */
async function clearTempStorage() {
  const btn = document.getElementById('btn-clear-temp');
  if (!confirm('¿Estás seguro de vaciar el almacenamiento temporal? Esto borrará los videos y stickers que no hayas descargado aún.')) return;

  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Vaciando…';
  btn.disabled = true;

  try {
    const res = await fetch('/api/clear-temp', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(`¡Limpieza completada!\nSe liberaron ${data.freedMb} MB de almacenamiento temporal.`);
    } else {
      alert('Error al limpiar caché: ' + data.error);
    }
  } catch (err) {
    alert('Error de conexión.');
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

/* ── PWA Install ─────────────────────────────────────────────────────────── */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

function installPwa() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => { deferredInstallPrompt = null; });
  } else {
    alert('Para instalar:\n• Chrome/Android: Menú → "Agregar a pantalla de inicio"\n• Safari/iOS: Compartir → "Agregar a pantalla de inicio"');
  }
}

/* ── Service Worker ──────────────────────────────────────────────────────── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

/* ── Init ────────────────────────────────────────────────────────────────── */
loadStatus();
loadHomeStats();
// Refresh status every 30s
setInterval(loadStatus, 30_000);
