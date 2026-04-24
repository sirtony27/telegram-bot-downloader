# Bot Personal de Telegram

Bot personal de Telegram con descarga de videos, creación de stickers e historial en Supabase. Solo responde al usuario con el Telegram ID configurado en `.env`.

## Funcionalidades

| Acción | Descripción |
|--------|-------------|
| Enviar un enlace | Descarga el video y lo envía (TikTok, Instagram, YouTube, Twitter/X, etc.) |
| Enviar una foto | La convierte en sticker estático WebP |
| Enviar imagen como documento | La convierte en sticker estático WebP |
| Reenviar sticker animado | Lo convierte a WebM VP9 compatible con Telegram |
| `/historial` | Muestra las últimas 10 descargas registradas |
| `/help` o `/start` | Muestra el menú de ayuda |

---

## Prerrequisitos

### Node.js 20 (via nvm)
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node --version  # debe mostrar v20.x.x
```

### yt-dlp
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
yt-dlp --version
```

### ffmpeg
```bash
sudo apt update
sudo apt install -y ffmpeg
ffmpeg -version
```

### PM2 (para producción)
```bash
npm install -g pm2
```

---

## Instalación

```bash
# 1. Clonar el repositorio
git clone <URL_DEL_REPO>
cd bot-wpp

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
nano .env
```

### Configurar `.env`

```env
# Token del bot — obtenelo hablando con @BotFather en Telegram
TELEGRAM_BOT_TOKEN=123456789:AAAA...

# Tu Telegram User ID — hablá con @userinfobot para obtenerlo
OWNER_CHAT_ID=123456789

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=xxxx

TEMP_DIR=./temp
MAX_FILE_SIZE_MB=50
YTDLP_TIMEOUT_MS=120000
```

#### Cómo obtener el token del bot
1. Abrí Telegram y buscá **@BotFather**
2. Enviá `/newbot` y seguí las instrucciones
3. Al finalizar, BotFather te da el token. Copialo en `TELEGRAM_BOT_TOKEN`

#### Cómo obtener tu User ID
1. Buscá **@userinfobot** en Telegram
2. Enviá cualquier mensaje → te responde con tu User ID numérico
3. Copialo en `OWNER_CHAT_ID`

---

## Base de datos (Supabase)

Ejecutar el siguiente SQL en el **SQL Editor** de tu proyecto en Supabase:

```sql
create table downloads (
  id uuid default gen_random_uuid() primary key,
  url text not null,
  platform text,
  filename text,
  filesize_mb numeric(6,2),
  created_at timestamptz default now()
);

-- Índice para consultas por fecha
create index downloads_created_at_idx on downloads (created_at desc);
```

---

## Uso en desarrollo

```bash
node src/index.js
```

El bot se conecta directamente a Telegram via long polling. No necesitás escanear QR ni configurar webhooks.

---

## Uso en producción con PM2

### Iniciar
```bash
pm2 start ecosystem.config.js
```

### Ver estado
```bash
pm2 status
```

### Ver logs en tiempo real
```bash
pm2 logs telegram-bot
```

### Ver logs con historial
```bash
pm2 logs telegram-bot --lines 100
```

### Reiniciar
```bash
pm2 restart telegram-bot
```

### Detener
```bash
pm2 stop telegram-bot
```

### Configurar inicio automático al bootear el servidor
```bash
pm2 startup
pm2 save
```

---

## Actualizar yt-dlp

```bash
yt-dlp -U
```

O forzar reinstalación:
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

---

## Estructura del proyecto

```
bot-wpp/
├── src/
│   ├── index.js                  # Entry point — inicia grammy en long polling
│   ├── config.js                 # Validación de variables de entorno
│   ├── handlers/
│   │   ├── messageHandler.js     # Router y middleware de autorización
│   │   ├── downloadHandler.js    # Descarga con yt-dlp
│   │   ├── stickerHandler.js     # Conversión de imágenes y stickers animados
│   │   └── historyHandler.js     # Historial en Supabase
│   └── utils/
│       ├── auth.js               # Verificación de OWNER_CHAT_ID
│       ├── ytdlp.js              # Wrapper de yt-dlp con Promise y timeout
│       ├── ffmpeg.js             # Wrapper de ffmpeg para stickers WebM
│       └── logger.js             # Logger simple con timestamp
├── temp/                         # Archivos temporales (gitignored, se limpian solos)
├── .env.example
├── .env                          # Gitignored
├── .gitignore
├── ecosystem.config.js           # Config de PM2
├── package.json
└── README.md
```

---

## Notas sobre stickers

### Estáticos
- Formato: WebP, 512×512 px
- Enviá una foto directamente (comprimida) o como documento
- Soporta: JPEG, PNG, WEBP, GIF estático

### Animados
- Formato: WebM con codec VP9, máximo 3 segundos, máximo 512×512 px
- Reenviá cualquier sticker animado o de video para convertirlo
- Nota: los stickers `.tgs` (lottie/animados clásicos) pueden no convertirse correctamente ya que requieren renderizado especial

---

## Troubleshooting

### "No autorizado" al usar el bot
Verificá que `OWNER_CHAT_ID` en `.env` sea tu User ID numérico correcto. Podés confirmarlo con @userinfobot.

### Error "yt-dlp no está instalado"
```bash
which yt-dlp
yt-dlp --version
```

### El video no se envía (supera límite)
Telegram tiene un límite de 50 MB para bots. Reducí `MAX_FILE_SIZE_MB` en `.env`.

### Error de Supabase
Verificá que `SUPABASE_URL` y `SUPABASE_ANON_KEY` sean correctos y que la tabla `downloads` exista.

### El bot no responde en producción
```bash
pm2 logs telegram-bot --lines 50
```

---

## Licencia

MIT
