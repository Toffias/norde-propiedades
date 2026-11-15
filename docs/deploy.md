# Deploy: entorno UAT en Hostinger

Entorno de pruebas para validar integraciones (MercadoLibre, WhatsApp, Resend) y revisar avances con Norde. Corre en el VPS de Hostinger compartido con otros proyectos.

| App     | URL                                       | Puerto local | Proceso PM2     |
| ------- | ----------------------------------------- | ------------ | --------------- |
| Web     | `https://landingnorde.apzsoftware.online` | 3020         | `norde-web`     |
| Gestión | `https://gestionnorde.apzsoftware.online` | 3021         | `norde-gestion` |
| Agente  | `https://agentenorde.apzsoftware.online`  | 3022         | `norde-agent`   |

- **VPS**: `srv1589149.hstgr.cloud` (`82.29.59.19`), KVM 1 (1 vCPU / 4 GB), Ubuntu. Las otras apps usan los puertos 3000 a 3003 y 3010.
- **Carpeta**: `/var/www/norde-uat`. **Base**: PostgreSQL 17.10 local (compartido con los otros proyectos), base `norde_uat`. Es la versión de todo el proyecto (ADR 0041).
- **Node**: las apps de Norde usan Node 24 en `/opt/node-24`. El Node del sistema queda para los otros proyectos.

## Flujo

`git push` a `uat` → CI (`.github/workflows/ci.yml`) → si pasa, el job `deploy-uat` llama a `.github/workflows/deploy-uat.yml`:

1. **En GitHub Actions**: `pnpm install` y build de web y gestión, en la misma ruta que en el VPS (`/var/www/norde-uat`). Así `.next` no arrastra rutas del runner y el VPS no compila.
2. **rsync al VPS**: código y builds. No se tocan `node_modules`, los `.env`, los archivos subidos (`apps/web/media`, `.storage`) ni las cachés.
3. **En el VPS**: `pnpm install --frozen-lockfile`, backup de la base (`scripts/ops/backup-db.sh pre-deploy`; si falla, no se migra), migraciones de core (`drizzle-kit migrate`), migraciones de Payload y `pm2 startOrReload ecosystem.config.cjs`.
4. **Verificación**: compara el SHA desplegado (`DEPLOYED_SHA.txt`) y que las tres URLs respondan.

Se trabaja en `dev`. Para publicar en UAT: `git checkout uat && git merge dev && git push`, o un PR de `dev` a `uat`. Para volver a publicar sin cambios: Actions → **Deploy UAT** → _Run workflow_ sobre `uat`.

El workflow solo despliega `uat` (`if: github.ref == 'refs/heads/uat'`), aunque se lo corra a mano sobre otra rama.

**Rollback**: revertir en `uat` (`git revert`) y pushear. Las migraciones son compatibles hacia atrás, así que el código anterior funciona con la base nueva. Si una migración rompió datos, se restaura el backup `pre-deploy` (ver [Backups](#backups)).

---

## Setup único

Como `root` en el VPS (`ssh root@82.29.59.19`), salvo lo que se indica como usuario `norde`.

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
# Chat con el agente de IA (ADR 0037): el mismo valor que WEB_CHAT_SECRET del agente
AGENT_CHAT_URL=http://127.0.0.1:3022/chat/messages
AGENT_CHAT_SECRET=SECRETO_DE_32_O_MAS
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

**Fotos en S3.** MercadoLibre descarga las fotos con links firmados, y eso pide `STORAGE_DRIVER=s3`. Con `local` no se puede publicar en ML. UAT usa el bucket compartido `apzsoftware.online` (AWS, `us-east-2`), en la carpeta `norde-uat/`:

- Un usuario IAM para gestión, con `s3:GetObject`, `s3:PutObject` y `s3:DeleteObject`, y otro para la web, solo con `s3:GetObject`. Los dos sobre `arn:aws:s3:::apzsoftware.online/norde-uat/*`, sin acceso al resto del bucket.
- En los dos `.env`, cada uno con su clave:

```bash
STORAGE_DRIVER=s3
S3_REGION=us-east-2
S3_BUCKET=apzsoftware.online
S3_PREFIX=norde-uat
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

- Las fotos que ya estaban en `/var/www/norde-uat-storage` no se mueven solas. Se suben con las mismas rutas: `aws s3 sync /var/www/norde-uat-storage s3://apzsoftware.online/norde-uat/`.

`/var/www/norde-uat/apps/agent/.env`:

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=3022
DATABASE_URL=postgres://norde:CONTRASEÑA@127.0.0.1:5432/norde_uat
PUBLIC_SITE_URL=https://landingnorde.apzsoftware.online
OPENAI_API_KEY=sk-...
# Chat del sitio (ADR 0037): el mismo valor que AGENT_CHAT_SECRET de la web
WEB_CHAT_SECRET=SECRETO_DE_32_O_MAS
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

### 7. Usuario propio y clave de GitHub Actions

El VPS es compartido: si el deploy y los procesos corren como `root`, una ejecución remota de código en cualquier app o dependencia de Norde da root sobre todos los proyectos. Las apps corren con un usuario sin privilegios, dueño de su carpeta y de su propio PM2.

```bash
adduser --system --group --shell /bin/bash --home /home/norde norde
chown -R norde:norde /var/www/norde-uat /var/www/norde-uat-storage
mkdir -p /var/backups/norde-uat && chown norde:norde /var/backups/norde-uat && chmod 700 /var/backups/norde-uat
chmod 600 /var/www/norde-uat/apps/*/.env
```

En tu máquina, generá un par exclusivo para este deploy:

```bash
ssh-keygen -t ed25519 -C "norde-uat-deploy" -f ~/.ssh/norde_uat_deploy -N ""
```

Agregá la **pública** (`~/.ssh/norde_uat_deploy.pub`) en `/home/norde/.ssh/authorized_keys` (carpeta `700`, archivo `600`, dueño `norde`), **no** en la de `root`. El VPS no necesita acceso a GitHub: el código llega por rsync.

PM2 propio del usuario `norde` (no el de root), con arranque al reiniciar:

```bash
sudo -u norde -i bash -c 'PATH=/opt/node-24/bin:$PATH pm2 ping'
env PATH=$PATH:/opt/node-24/bin pm2 startup systemd -u norde --hp /home/norde
```

**Migrar una instalación que corre como `root`:** hacé lo de arriba, bajá los procesos del PM2 de root (`pm2 delete norde-web norde-gestion norde-agent && pm2 save`), sacá la clave de deploy de `/root/.ssh/authorized_keys`, creá la variable `VPS_USER=norde` (§8) y volvé a correr el deploy: los levanta el PM2 de `norde`. Mientras `VPS_USER` no exista, el workflow sigue entrando como `root`.

`pm2 startOrReload` no toma cambios en los `args` de un proceso que ya existe: si `ecosystem.config.cjs` cambia los argumentos (por ejemplo, `--hostname`), borrá el proceso (`pm2 delete norde-web`) y redesplegá.

### 8. GitHub

En `Toffias/norde-propiedades` → Settings → Environments, creá el entorno **`uat`** con estos secrets:

| Secret              | Valor                                                              |
| ------------------- | ------------------------------------------------------------------ |
| `VPS_HOST`          | `82.29.59.19`                                                      |
| `VPS_SSH_KEY`       | la clave **privada** `~/.ssh/norde_uat_deploy` (completa)          |
| `SENTRY_AUTH_TOKEN` | token de Sentry para subir los source maps de `gestion` (ADR 0049) |

Y esta variable (no es secreta), que el build incrusta en el panel:

| Variable             | Valor                                                                      |
| -------------------- | -------------------------------------------------------------------------- |
| `SENTRY_DSN_GESTION` | el DSN del proyecto `norde-propiedades` en Sentry (Settings → Client Keys) |

Sin ellos el deploy anda igual, pero el panel no reporta errores a Sentry. El token de Sentry va con el alcance mínimo para subir source maps (`project:releases`), no uno de organización.

En Settings → Secrets and variables → Actions → **Variables** del repositorio (no del entorno: el workflow la lee antes de entrar al job):

| Variable   | Valor                                 |
| ---------- | ------------------------------------- |
| `VPS_USER` | `norde` (sin ella, entra como `root`) |

**Obligatorio** en el entorno `uat`:

- _Deployment branches and tags_ → **Selected branches** → solo `uat`. Sin esto, cualquier rama que declare `environment: uat` usa `VPS_SSH_KEY`.
- _Required reviewers_: al menos una persona. El deploy queda esperando aprobación en Actions.

Y en Settings → Branches, protección de `uat` y `main`: sin push forzado ni borrado, y con el check de CI requerido.

### 9. Rama y primer deploy

```bash
git checkout dev && git pull
git checkout -b uat
git push -u origin uat
```

El push dispara CI y el deploy. El primer `pnpm install` en el VPS tarda varios minutos. Cuando termine:

```bash
cd /var/www/norde-uat
PATH=/opt/node-24/bin:$PATH corepack pnpm user:create-admin --whatsapp +54911...   # primer usuario del panel y casa central
pm2 status
```

`pm2 startup` ya está configurado por los otros proyectos, y el deploy corre `pm2 save`: los procesos vuelven solos si el VPS se reinicia.

## Backups

`scripts/ops/backup-db.sh` hace `pg_dump` (formato custom) de `norde_uat` en `/var/backups/norde-uat`:

- **`pre-deploy`**: lo corre el deploy antes de las migraciones. Si falla, el deploy se corta sin migrar.
- **`daily`**: la base más los archivos subidos (`/var/www/norde-uat-storage` y `apps/web/media`). Va por cron del usuario `norde`.

Se borran los de más de `BACKUP_KEEP_DAYS` días (14 por defecto). Con `BACKUP_S3_URI`, cada archivo se copia además fuera del servidor (necesita la CLI de AWS y una clave IAM aparte, solo con `s3:PutObject` sobre esa carpeta; no la del storage de fotos).

Cron (`sudo -u norde crontab -e`), todos los días a las 4 (hora del servidor):

```bash
0 4 * * * BACKUP_S3_URI=s3://apzsoftware.online/norde-uat-backups /var/www/norde-uat/scripts/ops/backup-db.sh daily >> /var/backups/norde-uat/backup.log 2>&1
```

**Restaurar** (con las apps bajadas):

```bash
pm2 stop norde-web norde-gestion norde-agent
DATABASE_URL="$(grep -E '^DATABASE_URL=' /var/www/norde-uat/apps/gestion/.env | cut -d= -f2-)"
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" /var/backups/norde-uat/db-daily-AAAAMMDDTHHMMSSZ.dump
tar -xzf /var/backups/norde-uat/files-AAAAMMDDTHHMMSSZ.tar.gz -C /   # archivos subidos, si hace falta
pm2 start norde-web norde-gestion norde-agent
```

Probá una restauración en una base aparte cada tanto: un backup que nunca se restauró no está probado.

## Chequeos de seguridad del servidor

No se ven desde el repo; revisalos al hacer el setup y después de cambios en el VPS:

- Las apps escuchan solo en `127.0.0.1` (`ss -ltnp | grep -E ':302[0-2]'`). Igual, el firewall bloquea 3020 a 3022 desde afuera (`ufw status`) y Postgres escucha solo en localhost (`listen_addresses` en `postgresql.conf`).
- Los `.env` tienen permisos `600` y dueño `norde`; `PAYLOAD_SECRET` y los demás secretos no son los de `.env.example`.
- No hay source maps públicos de gestión: `find apps/gestion/.next/static -name '*.map'` no devuelve nada.
- Si `norde_uat` tiene datos reales de clientes (import de Tokko, leads de portales), UAT es producción de hecho: backups, usuario propio y entorno protegido no son opcionales.

## Diagnóstico

```bash
pm2 logs norde-gestion --lines 100
pm2 logs norde-agent --lines 100
cat /var/www/norde-uat/DEPLOYED_SHA.txt
```

**Eventos del outbox agotados** (Sentry: "Outbox has N exhausted events"): el relay los reintentó 20 veces sin poder publicarlos, y nadie reaccionó a ellos (portales, sitio, notificaciones). Revisá `last_error`, arreglá la causa y reintentalos:

```sql
select id, event_type, attempts, last_error from core.outbox where published_at is null and attempts >= 20;
update core.outbox set attempts = 0, next_attempt_at = null where published_at is null and attempts >= 20;
```
