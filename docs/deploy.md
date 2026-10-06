# Deploy: entorno UAT en Hostinger

Entorno de pruebas para validar integraciones (MercadoLibre, WhatsApp, Resend) y revisar avances con Norde. Corre en el VPS de Hostinger compartido con otros proyectos.

| App     | URL                                       | Puerto local | Proceso PM2     |
| ------- | ----------------------------------------- | ------------ | --------------- |
| Web     | `https://landingnorde.apzsoftware.online` | 3020         | `norde-web`     |
| Gestión | `https://gestionnorde.apzsoftware.online` | 3021         | `norde-gestion` |
| Agente  | `https://agentenorde.apzsoftware.online`  | 3022         | `norde-agent`   |

- **VPS**: `srv1589149.hstgr.cloud` (`82.29.59.19`), KVM 1 (1 vCPU / 4 GB), Ubuntu. Las otras apps usan los puertos 3000 a 3003 y 3010.
- **Carpeta**: `/var/www/norde-uat`. **Base**: PostgreSQL local, base `norde_uat`.
- **Node**: las apps de Norde usan Node 24 en `/opt/node-24`. El Node del sistema queda para los otros proyectos.

## Flujo

`git push` a `uat` → CI (`.github/workflows/ci.yml`) → si pasa, el job `deploy-uat` llama a `.github/workflows/deploy-uat.yml`:

1. **En GitHub Actions**: `pnpm install` y build de web y gestión, en la misma ruta que en el VPS (`/var/www/norde-uat`). Así `.next` no arrastra rutas del runner y el VPS no compila.
2. **rsync al VPS**: código y builds. No se tocan `node_modules`, los `.env`, los archivos subidos (`apps/web/media`, `.storage`) ni las cachés.
3. **En el VPS**: `pnpm install --frozen-lockfile`, migraciones de core (`drizzle-kit migrate`), migraciones de Payload y `pm2 startOrReload ecosystem.config.cjs`.
4. **Verificación**: compara el SHA desplegado (`DEPLOYED_SHA.txt`) y que las tres URLs respondan.

Se trabaja en `dev`. Para publicar en UAT: `git checkout uat && git merge dev && git push`, o un PR de `dev` a `uat`. Para volver a publicar sin cambios: Actions → **Deploy UAT** → _Run workflow_ sobre `uat`.

**Rollback**: revertir en `uat` (`git revert`) y pushear. Las migraciones son compatibles hacia atrás, así que el código anterior funciona con la base nueva.

---

## Setup único

Todo como `root` en el VPS (`ssh root@82.29.59.19`).

### 1. Node 24 aparte

```bash
cd /tmp
curl -fsSLO https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt
TARBALL=$(grep -o 'node-v24[^ ]*-linux-x64.tar.xz' SHASUMS256.txt)
curl -fsSLO "https://nodejs.org/dist/latest-v24.x/$TARBALL"
grep " $TARBALL\$" SHASUMS256.txt | sha256sum -c -
mkdir -p /opt/node-24 && tar -xJf "$TARBALL" -C /opt/node-24 --strip-components=1
/opt/node-24/bin/node -v
```

PM2 sigue siendo el global. Cada app de Norde arranca con el Node de `/opt/node-24` porque el deploy pasa `NORDE_NODE_BIN` a `ecosystem.config.cjs`.

### 2. Swap

Si no existe (ver `swapon --show`), crearlo como en `DS-DESIGN-Landing/DEPLOY.md` §1. Con las apps de Norde sumadas, la memoria queda justa.

### 3. Base de datos

PostgreSQL ya está instalado. Hace falta `postgresql-contrib` (`pg_trgm` y `unaccent`, que crea la migración `0001`).

```bash
apt-get install -y postgresql-contrib
sudo -u postgres psql <<'SQL'
CREATE USER norde WITH ENCRYPTED PASSWORD 'PONÉ_UNA_CONTRASEÑA_FUERTE';
CREATE DATABASE norde_uat OWNER norde;
SQL
```

Un solo usuario de base para las tres apps (ADR 0015).

### 4. Carpetas

```bash
mkdir -p /var/www/norde-uat/apps/{web,gestion,agent} /var/www/norde-uat-storage
```

### 5. `.env` de cada app

No se versionan y el deploy no los toca. Generá los secretos con `openssl rand -base64 32`. Las variables posibles están en el `.env.example` de cada app.

`/var/www/norde-uat/apps/web/.env`:

```bash
DATABASE_URL=postgres://norde:CONTRASEÑA@127.0.0.1:5432/norde_uat
PAYLOAD_SECRET=SECRETO_DE_32_O_MAS
NEXT_PUBLIC_SERVER_URL=https://landingnorde.apzsoftware.online
# Fotos de las propiedades: la misma carpeta que el panel (ADR 0023)
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=/var/www/norde-uat-storage
# El mismo valor que WEB_REVALIDATE_SECRET de gestion
REVALIDATE_SECRET=SECRETO_DE_32_O_MAS
# Formulario de consulta de la ficha: el mismo valor que INQUIRY_WEBHOOK_SECRET de gestion
INQUIRY_WEBHOOK_URL=https://gestionnorde.apzsoftware.online/api/webhooks/inquiries/web
INQUIRY_WEBHOOK_SECRET=SECRETO_DE_32_O_MAS
```

`/var/www/norde-uat/apps/gestion/.env` (lo mínimo; sumá Resend, MercadoLibre, etc. a medida que pruebes cada integración):

```bash
DATABASE_URL=postgres://norde:CONTRASEÑA@127.0.0.1:5432/norde_uat
BETTER_AUTH_SECRET=SECRETO
BETTER_AUTH_URL=https://gestionnorde.apzsoftware.online
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=/var/www/norde-uat-storage
GEOCODER_USER_AGENT=NordePropiedades-UAT/1.0 (TU_EMAIL)
JOBS_ENABLED=true
# Avisos a la web cuando cambia una propiedad (ADR 0023)
WEB_REVALIDATE_URL=https://landingnorde.apzsoftware.online/api/revalidate
WEB_REVALIDATE_SECRET=SECRETO_DE_32_O_MAS
# Consultas del formulario de la web
INQUIRY_WEBHOOK_SECRET=SECRETO_DE_32_O_MAS
# Para probar MercadoLibre:
# PORTALS_ENABLED=true
# PORTALS_SECRET_KEY=SECRETO
# MERCADOLIBRE_REDIRECT_URI=https://gestionnorde.apzsoftware.online/api/portals/mercadolibre/callback
```

`/var/www/norde-uat/apps/agent/.env`:

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=3022
DATABASE_URL=postgres://norde:CONTRASEÑA@127.0.0.1:5432/norde_uat
PUBLIC_SITE_URL=https://landingnorde.apzsoftware.online
# WhatsApp: webhook en https://agentenorde.apzsoftware.online/webhooks/whatsapp
```

Si cambiás un `.env` sin hacer un deploy, recargá el proceso: `pm2 reload norde-gestion --update-env` (o `norde-web` / `norde-agent`). Un cambio en `NEXT_PUBLIC_SERVER_URL` se incrusta en el build: también hay que cambiar `WEB_URL` en `deploy-uat.yml` y volver a publicar.

### 6. Nginx y SSL

```bash
for pair in landingnorde:3020 gestionnorde:3021 agentenorde:3022; do
  name=${pair%%:*}.apzsoftware.online; port=${pair##*:}
  cat > /etc/nginx/sites-available/$name <<NGINX
server {
    server_name $name;
    client_max_body_size 30M;   # gestor de archivos y fotos (hasta 26 MB por envío)

    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
  ln -sf /etc/nginx/sites-available/$name /etc/nginx/sites-enabled/$name
done
nginx -t && systemctl reload nginx
# Un certificado por subdominio, como el resto de los sitios del VPS.
for d in landingnorde gestionnorde agentenorde; do
  certbot --nginx --non-interactive --redirect -d $d.apzsoftware.online
done
```

Los tres subdominios ya apuntan a `82.29.59.19`. El bloque de `landingnorde` lleva además `add_header X-Robots-Tag "noindex, nofollow" always;`, para que la web de pruebas no se indexe.

### 7. Clave de GitHub Actions hacia el VPS

En tu máquina, generá un par exclusivo para este deploy:

```bash
ssh-keygen -t ed25519 -C "norde-uat-deploy" -f ~/.ssh/norde_uat_deploy -N ""
```

Agregá la **pública** (`~/.ssh/norde_uat_deploy.pub`) en una línea nueva de `/root/.ssh/authorized_keys` del VPS. El VPS no necesita acceso a GitHub: el código llega por rsync.

### 8. GitHub

En `Toffias/norde-propiedades` → Settings → Environments, creá el entorno **`uat`** con estos secrets:

| Secret        | Valor                                                     |
| ------------- | --------------------------------------------------------- |
| `VPS_HOST`    | `82.29.59.19`                                             |
| `VPS_SSH_KEY` | la clave **privada** `~/.ssh/norde_uat_deploy` (completa) |

Opcional: en el entorno, limitá los _deployment branches_ a `uat`.

### 9. Rama y primer deploy

```bash
git checkout dev && git pull
git checkout -b uat
git push -u origin uat
```

El push dispara CI y el deploy. El primer `pnpm install` en el VPS tarda varios minutos. Cuando termine:

```bash
cd /var/www/norde-uat
PATH=/opt/node-24/bin:$PATH corepack pnpm user:create-admin   # primer usuario del panel
pm2 status
```

`pm2 startup` ya está configurado por los otros proyectos, y el deploy corre `pm2 save`: los procesos vuelven solos si el VPS se reinicia.

## Diagnóstico

```bash
pm2 logs norde-gestion --lines 100
pm2 logs norde-agent --lines 100
cat /var/www/norde-uat/DEPLOYED_SHA.txt
```
