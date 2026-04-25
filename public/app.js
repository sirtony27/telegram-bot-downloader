/* ── State ───────────────────────────────────────────────────────────────── */
let currentTab = "home";
let stickerType = "whatsapp";
let stickerDownloadUrl = null;
let deferredInstallPrompt = null;

/* ── Navigation ──────────────────────────────────────────────────────────── */
function navigate(tab) {
  document.getElementById(`page-${currentTab}`).classList.remove("active");
  document.getElementById(`tab-${currentTab}`).classList.remove("active");
  document
    .getElementById(`tab-${currentTab}`)
    .querySelector("i")
    .classList.replace("ph-fill", "ph");
  currentTab = tab;
  document.getElementById(`page-${tab}`).classList.add("active");
  document.getElementById(`tab-${tab}`).classList.add("active");
  document
    .classList.replace("ph", "ph-fill");
}

/* ── Status ──────────────────────────────────────────────────────────────── */
async function loadStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    const dot = document.getElementById("status-dot");
    dot.classList.toggle("online", data.online);
    document.getElementById("info-bot").textContent = data.online
      ? `@${data.botUsername} ✓`
      : "Offline";
    document.getElementById("stat-uptime").textContent = Math.floor(
      data.uptime / 60,
    );
  } catch {
    document.getElementById("info-bot").textContent = "Sin conexión";
  }
}

/* ── Platform detection ──────────────────────────────────────────────────── */
const PLATFORMS = {
  youtube: { label: "YouTube", icon: "ph-youtube-logo" },
  youtu: { label: "YouTube", icon: "ph-youtube-logo" },
  tiktok: { label: "TikTok", icon: "ph-tiktok-logo" },
  instagram: { label: "Instagram", icon: "ph-instagram-logo" },
  twitter: { label: "Twitter/X", icon: "ph-x-logo" },
  "x.com": { label: "Twitter/X", icon: "ph-x-logo" },
  facebook: { label: "Facebook", icon: "ph-facebook-logo" },
  reddit: { label: "Reddit", icon: "ph-reddit-logo" },
  twitch: { label: "Twitch", icon: "ph-twitch-logo" },
  vimeo: { label: "Vimeo", icon: "ph-video" },
};

function detectPlatform(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const [key, val] of Object.entries(PLATFORMS)) {
      if (host.includes(key)) return val;
    }
  } catch {
    /* invalid url */
  }
  return null;
}

document.getElementById("dl-url").addEventListener("input", function () {
  const badge = document.getElementById("dl-badge");
  const p = detectPlatform(this.value.trim());
  if (p) {
    badge.innerHTML = `<i class="ph ${p.icon}"></i> ${p.label}`;
    badge.className = "platform-badge detected";
  } else {
    badge.innerHTML = '<i class="ph ph-globe"></i> Pegá una URL para detectar';
    badge.className = "platform-badge";
  }
});

/* ── Downloader ──────────────────────────────────────────────────────────── */
function resetDownloader() {
  document.getElementById("dl-step2").style.display = "none";
  document.getElementById("dl-result").classList.remove("visible");
  document.getElementById("dl-error").classList.remove("visible");
  document.getElementById("dl-progress-container").style.display = "none";
}

async function analyzeUrl() {
  const url = document.getElementById("dl-url").value.trim();
  if (!url) return;

  const btn = document.getElementById("dl-analyze-btn");
  const errEl = document.getElementById("dl-error");

  resetDownloader();
  btn.disabled = true;
  btn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Analizando…';

  try {
    const res = await fetch("/api/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();

    if (!data.success) throw new Error(data.error || "Error al analizar link");

    document.getElementById("dl-thumb").src = data.info.thumbnail || "";
    document.getElementById("dl-info-title").textContent =
      data.info.title || "Video";

    const select = document.getElementById("dl-format-select");
    select.innerHTML = "";

    // Default best
    select.innerHTML += `<option value="best">🌟 Mejor Calidad (Automático)</option>`;
    // Audio only
    select.innerHTML += `<option value="audio">🎵 Solo Audio (MP3)</option>`;

    // Available formats
    if (data.info.formats && data.info.formats.length > 0) {
      data.info.formats.forEach((f) => {
        const fps = f.fps ? ` ${f.fps}fps` : "";
        select.innerHTML += `<option value="${f.format_id}">🎞️ ${f.resolution || "Video"}${fps} (${f.ext})</option>`;
      });
    }

    document.getElementById("dl-step2").style.display = "block";
    // Auto-scroll al botón de descargar
    setTimeout(() => {
      document
        .getElementById("dl-btn")
        .scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  } catch (err) {
    errEl.textContent = "❌ " + err.message;
    errEl.classList.add("visible");
  } finally {
    btn.disabled = false;
    btn.innerHTML =
      '<i class="ph ph-magnifying-glass"></i> <span>Analizar Link</span>';
  }
}

async function startDownload() {
  const url = document.getElementById("dl-url").value.trim();
  const format = document.getElementById("dl-format-select").value;
  if (!url) return;

  const btn = document.getElementById("dl-btn");
  const result = document.getElementById("dl-result");
  const errEl = document.getElementById("dl-error");
  const progContainer = document.getElementById("dl-progress-container");
  const progFill = document.getElementById("dl-progress-fill");
  const progText = document.getElementById("dl-progress-text");

  result.classList.remove("visible");
  errEl.classList.remove("visible");
  btn.disabled = true;
  btn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Descargando…';

  progContainer.style.display = "block";
  progFill.style.width = "0%";
  progText.textContent = "0%";

  const clientId = crypto.randomUUID();
  const es = new EventSource(`/api/progress/${clientId}`);
  es.onmessage = (e) => {
    try {
      const pData = JSON.parse(e.data);
      if (pData.percent) {
        progFill.style.width = `${pData.percent}%`;
        progText.textContent = `${pData.percent}%`;
      }
    } catch {
      /* ignore parse error */
    }
  };

  try {
    const res = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, format, clientId }),
    });
    const data = await res.json();

    if (!data.success) throw new Error(data.error || "Error al descargar");

    document.getElementById("dl-title").textContent =
      data.title || data.filename;
    const link = document.getElementById("dl-link");
    link.href = data.downloadUrl;
    link.download = data.filename;
    result.classList.add("visible");

    // Auto-scroll al resultado final
    setTimeout(() => {
      document
        .getElementById("dl-result")
        .scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  } catch (err) {
    errEl.textContent = "❌ " + err.message;
    errEl.classList.add("visible");
  } finally {
    es.close();
    btn.disabled = false;
    btn.innerHTML =
      '<i class="ph ph-download-simple"></i> <span>Descargar Selección</span>';
    progContainer.style.display = "none";
  }
}

// Enter key on URL input
document.getElementById("dl-url").addEventListener("keydown", (e) => {
  if (e.key === "Enter") analyzeUrl();
});

/* ── Stickers ────────────────────────────────────────────────────────────── */
function setStickerType(type) {
  stickerType = type;
  document.getElementById("sticker-toggles").dataset.state = type;
  document
    .getElementById("toggle-wa")
    .classList.toggle("active", type === "whatsapp");
  document
    .getElementById("toggle-tg")
    .classList.toggle("active", type === "telegram");
  // Reset result
  document.getElementById("sticker-result").classList.remove("visible");
  document.getElementById("sticker-error").classList.remove("visible");
}

function onFileSelected() {
  const file = document.getElementById("sticker-file").files[0];
  if (!file) return;

  const imgPreview = document.getElementById("sticker-preview");
  const vidPreview = document.getElementById("sticker-video-preview");

  imgPreview.classList.remove("visible");
  imgPreview.style.display = "none";
  vidPreview.classList.remove("visible");
  vidPreview.style.display = "none";

  const objUrl = URL.createObjectURL(file);

  if (file.type.startsWith("video/")) {
    vidPreview.src = objUrl;
    vidPreview.style.display = "block";
    document.getElementById("sticker-editor").style.display = "block";
    
    // Update slider max when video loads
    vidPreview.onloadedmetadata = () => {
      const startSlider = document.getElementById("sticker-start");
      startSlider.max = Math.max(0, vidPreview.duration).toFixed(1);
      startSlider.value = 0;
      document.getElementById("lbl-start").textContent = "0.0s";
      document.getElementById("sticker-duration").value = Math.min(6, vidPreview.duration).toFixed(1);
      document.getElementById("lbl-duration").textContent = document.getElementById("sticker-duration").value + "s";
    };
    
    setTimeout(() => vidPreview.classList.add("visible"), 10);
  } else {
    imgPreview.src = objUrl;
    imgPreview.style.display = "block";
    document.getElementById("sticker-editor").style.display = "none";
    setTimeout(() => imgPreview.classList.add("visible"), 10);
  }

  document.getElementById("sticker-btn").disabled = false;
  document.getElementById("sticker-result").classList.remove("visible");
  document.getElementById("sticker-error").classList.remove("visible");
}

// Drag & drop
const zone = document.getElementById("upload-zone");
zone.addEventListener("dragover", (e) => {
  e.preventDefault();
  zone.classList.add("dragover");
});
zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
zone.addEventListener("drop", (e) => {
  e.preventDefault();
  zone.classList.remove("dragover");
  const file = e.dataTransfer?.files?.[0];
  if (
    file &&
    (file.type.startsWith("image/") || file.type.startsWith("video/"))
  ) {
    const input = document.getElementById("sticker-file");
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    onFileSelected();
  }
});

async function convertSticker() {
  const file = document.getElementById("sticker-file").files[0];
  if (!file) return;

  const btn = document.getElementById("sticker-btn");
  const result = document.getElementById("sticker-result");
  const errEl = document.getElementById("sticker-error");

  result.classList.remove("visible");
  errEl.classList.remove("visible");
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Convirtiendo…';

  try {
    const form = new FormData();
    form.append("type", stickerType);
    
    if (file.type.startsWith("video/")) {
      form.append("speed", document.getElementById("sticker-speed").value);
      form.append("startTime", document.getElementById("sticker-start").value);
      form.append("duration", document.getElementById("sticker-duration").value);
    }
    
    form.append("image", file);

    const res = await fetch("/api/sticker", { method: "POST", body: form });
    const data = await res.json();

    if (!data.success) throw new Error(data.error || "Error al convertir");

    stickerDownloadUrl = data.downloadUrl;
    document.getElementById("sticker-size").textContent =
      `Tamaño: ${data.sizeKb} KB`;
    const link = document.getElementById("sticker-link");
    link.href = data.downloadUrl;

    // Mostrar botón de compartir solo si Web Share API soporta archivos
    const shareBtn = document.getElementById("sticker-share");
    shareBtn.style.display =
      navigator.share && stickerType === "whatsapp" ? "flex" : "none";

    result.classList.add("visible");
  } catch (err) {
    errEl.textContent = "❌ " + err.message;
    errEl.classList.add("visible");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "<span>Convertir</span>";
  }
}

async function shareSticker() {
  if (!stickerDownloadUrl) return;
  try {
    const response = await fetch(stickerDownloadUrl);
    const blob = await response.blob();
    const file = new File([blob], "sticker.webp", { type: "image/webp" });

    if (navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Sticker para WhatsApp" });
    } else {
      // Fallback: descarga directa
      const a = document.createElement("a");
      a.href = stickerDownloadUrl;
      a.download = "sticker.webp";
      a.click();
    }
  } catch (err) {
    if (err.name !== "AbortError") console.error("Share failed:", err);
  }
}


/* ── Storage Management ──────────────────────────────────────────────────── */
async function clearTempStorage() {
  const btn = document.getElementById("btn-clear-temp");
  if (
    !confirm(
      "¿Estás seguro de vaciar el almacenamiento temporal? Esto borrará los videos y stickers que no hayas descargado aún.",
    )
  )
    return;

  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Vaciando…';
  btn.disabled = true;

  try {
    const res = await fetch("/api/clear-temp", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      alert(
        `¡Limpieza completada!\nSe liberaron ${data.freedMb} MB de almacenamiento temporal.`,
      );
    } else {
      alert("Error al limpiar caché: " + data.error);
    }
  } catch (err) {
    alert("Error de conexión.");
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

/* ── PWA Install ─────────────────────────────────────────────────────────── */
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

function installPwa() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => {
      deferredInstallPrompt = null;
    });
  } else {
    alert(
      'Para instalar:\n• Chrome/Android: Menú → "Agregar a pantalla de inicio"\n• Safari/iOS: Compartir → "Agregar a pantalla de inicio"',
    );
  }
}

/* ── Service Worker ──────────────────────────────────────────────────────── */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// Editor UI Listeners
const vidPreview = document.getElementById("sticker-video-preview");
const startSlider = document.getElementById("sticker-start");
const durationSlider = document.getElementById("sticker-duration");

startSlider.addEventListener("input", (e) => {
  const start = parseFloat(e.target.value);
  document.getElementById("lbl-start").textContent = start.toFixed(1) + "s";
  vidPreview.currentTime = start;
});

durationSlider.addEventListener("input", (e) => {
  document.getElementById("lbl-duration").textContent = parseFloat(e.target.value).toFixed(1) + "s";
});

// Bucle simulado de video
vidPreview.addEventListener("timeupdate", () => {
  const start = parseFloat(startSlider.value) || 0;
  const duration = parseFloat(durationSlider.value) || 6;
  const end = start + duration;
  
  if (vidPreview.currentTime >= end) {
    vidPreview.currentTime = start;
    vidPreview.play().catch(()=>{});
  } else if (vidPreview.currentTime < start) {
    vidPreview.currentTime = start;
  }
});

window.setStickerSpeed = function(speed) {
  document.getElementById("sticker-speed").value = speed;
  document.getElementById("lbl-speed").textContent = speed.toFixed(1) + "x";
  
  // Actualizar UI de botones
  document.querySelectorAll(".speed-btn").forEach(btn => {
    btn.classList.remove("btn-primary");
    btn.classList.add("btn-ghost");
  });
  const activeBtn = document.querySelector(`.speed-btn[data-speed="${speed}"]`);
  if (activeBtn) {
    activeBtn.classList.remove("btn-ghost");
    activeBtn.classList.add("btn-primary");
  }
  
  // Aplicar velocidad al video en vivo
  vidPreview.playbackRate = speed;
};

/* ── Init ────────────────────────────────────────────────────────────────── */
loadStatus();
// Refresh status every 30s
setInterval(loadStatus, 30_000);
