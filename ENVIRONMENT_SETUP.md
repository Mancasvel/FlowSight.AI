# 🛠️ Guía de Configuración de Variables de Entorno

FlowSight requiere configurar varios servicios externos para funcionar correctamente (Autenticación, Sincronización y APIs de terceros).

Crea un archivo `.env.local` en la carpeta raíz (`apps/agent`) basándote en `.env.example`.

## 1. Supabase (Backend & Auth)
Es la base de datos principal y proveedor de autenticación.

**Cómo obtener las claves:**
1. Ve a tu proyecto en [Supabase Dashboard](https://supabase.com/dashboard).
2. Navega a **Project Settings** -> **API**.
3. Copia la `Project URL` en `VITE_SUPABASE_URL`.
4. Copia la `anon / public` Key en `VITE_SUPABASE_PUBLIC_KEY`.

**Configuración OAuth en Supabase:**
1. En **Authentication** -> **Providers**, habilita **Google** y configura sus claves.
2. **Jira y Linear:** Estos proveedores **NO** aparecen en la lista de Supabase. El Agente maneja la autenticación con ellos directamente usando las claves de `.env.local`. No necesitas configurarlos en el panel de Supabase.
3. Añade la **Callback URL**: `https://<PROJECT_REF>.supabase.co/auth/v1/callback` solo en el proveedor **Google**.

**Configuración de URLs (Authentication -> URL Configuration):**
- **Site URL:** `http://localhost:3000` (Para el Dashboard local).
- **Redirect URLs:**
  - `http://localhost:1420/*` (Agente desarrollo).
  - `http://localhost:12345/callback?state=*` (retorno del login de escritorio; el `state` cambia en cada intento).
  - `tauri://localhost` (Agente producción).

⚠️ **No es necesario activar "Supabase OAuth Server"** (Authorization Path /oauth/consent). Déjalo desactivado a menos que quieras que otras apps usen tu login.

---

## 2. Google OAuth
Para permitir login con cuentas de Google.

**Pasos:**
1. Ve a [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Crea un nuevo proyecto o selecciona uno existente.
3. Ve a **Credenciales** -> **Crear credenciales** -> **ID de cliente de OAuth**.
4. Tipo de aplicación: **Aplicación Web**.
5. **Orígenes autorizados:** `http://localhost:1420` (para desarrollo Taurus) y la URL de Supabase.
6. **URIs de redirección:**
   - La URL callback de Supabase (ver arriba).
   - El agente vuelve desde Supabase al `localhost` incluido en Redirect URLs de Supabase, no desde Google directamente.
7. Configura el **Client ID** y **Client Secret** de este cliente Web solo en
   Supabase Dashboard -> Authentication -> Sign In / Providers -> Google.
   No pongas el Client Secret en una variable `VITE_` ni en el bundle de Tauri.

Este cliente **Web** es solo para Google como proveedor de login de Supabase.
No sirve para Calendar companion: Google rechaza el callback local de puerto
temporal con `redirect_uri_mismatch`. Para Calendar companion crea **otro** ID
de cliente OAuth, tipo **Aplicacion de escritorio**, habilita Google Calendar
API y configura la pantalla de consentimiento para
`calendar.events.owned` y `calendar.calendarlist.readonly`. Coloca solo ese
Client ID publico en `TAURI_GOOGLE_CALENDAR_CLIENT_ID`; no incluyas ningun
Client Secret en el bundle de la app. Google exige el secret incluso con PKCE
en el canje de este cliente de escritorio, por lo que la funcion Supabase
`calendar-token` hace solo el canje y la renovacion; FlowSight conserva los
tokens cifrados y procesa los eventos localmente. Configura
`GOOGLE_CALENDAR_CLIENT_SECRET` como secreto de Supabase Edge Functions y
`TAURI_GOOGLE_CALENDAR_CLIENT_ID` como variable publica de GitHub Actions.
La cuenta de Supabase que despliega funciones necesita `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_PROJECT_REF` y `SUPABASE_DB_PASSWORD` en los secretos de GitHub
Actions. Nunca pegues el client secret en `.env`, `.env.local`, `VITE_*` o el
repositorio.

### Extensión de navegador para usuarios finales

Las automatizaciones del navegador requieren publicar **FlowSight Browser Controls**
en Chrome Web Store (Arc/Chrome) y Microsoft Edge Add-ons (Edge). No se debe
pedir a usuarios finales que activen el modo desarrollador ni que abran
`options.html` desde `file://`: esa página solo funciona dentro de la extensión
instalada. Cuando la tienda asigne un ID a la ficha, configura su URL oficial
como variable de GitHub Actions `FLOWSIGHT_CHROME_EXTENSION_STORE_URL` o
`FLOWSIGHT_EDGE_EXTENSION_STORE_URL`. FlowSight muestra el enlace y un recorrido
de instalación, emparejamiento y comprobación; la instalación de usuarios
finales solo es posible cuando la tienda publique la extensión. La clave de
emparejamiento local se copia desde FlowSight, no se comparte con servidores.

---

## 3. Jira OAuth (Atlassian)
Para importar tareas y login con Jira.

**Pasos:**
1. Ve a [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/).
2. Crea una app OAuth 2.0.
3. En **Permissions**, añade scopes: `read:jira-work`, `read:jira-user`, `read:me`, `offline_access`.
4. En **Authorization**, añade la Callback URL: `http://localhost:12345/callback`
5. Copia el **Client ID** y **Secret**.

```env
VITE_JIRA_CLIENT_ID="3..."
VITE_JIRA_CLIENT_SECRET="ATO..."
```

---

## 4. Linear OAuth
Para importar tareas de Linear.

**Pasos:**
1. Ve a [Linear Settings -> API](https://linear.app/settings/api).
2. Crea una nueva **OAuth Application**.
3. Callback URL: `http://localhost:12345/callback`
4. Copia el **Client ID** y **Client Secret**.

```env
VITE_LINEAR_CLIENT_ID="..."
VITE_LINEAR_CLIENT_SECRET="..."
```

---

## 5. Variables Opcionales / Legacy
- **VITE_PM_URL**: URL donde está desplegado el Dashboard web (por defecto `http://localhost:3000` o producción).
- **VITE_API_KEY**: Si usas un backend custom aparte de Supabase.

---

## 6. Notion OAuth para reportes Pro

La integración de Notion es una **public integration**. Sus credenciales son secretos exclusivos de las Supabase Edge Functions: no deben usar el prefijo `VITE_`, incluirse en el bundle Tauri ni guardarse en el cliente.

1. Crea una conexión pública en [Notion Developer Portal](https://www.notion.so/developers).
2. Habilita las capacidades para leer contenido y para insertar/actualizar contenido.
3. Configura como redirect URI exacta:

```text
https://<PROJECT_REF>.supabase.co/functions/v1/notion-oauth
```

4. Añade estos secretos al entorno de Supabase Edge Functions:

```env
NOTION_CLIENT_ID="..."
NOTION_CLIENT_SECRET="..."
NOTION_REDIRECT_URI="https://<PROJECT_REF>.supabase.co/functions/v1/notion-oauth"
NOTION_TOKEN_ENCRYPTION_KEY="<base64 de 32 bytes aleatorios>"
```

`NOTION_TOKEN_ENCRYPTION_KEY` debe ser una clave AES-256 independiente. Puede generarse localmente con `openssl rand -base64 32`; no la imprimas en logs, no la reutilices para otros servicios y guárdala en el gestor de secretos de Supabase/Azure.

5. Aplica la migración de `supabase/migrations/` y despliega las funciones `notion-oauth`, `notion-destinations` y `publish-notion-report`. El callback OAuth tiene `verify_jwt = false` porque Notion lo abre directamente; valida en su lugar un `state` aleatorio, hasheado, con caducidad y de un solo uso. Las acciones iniciadas por la app siguen exigiendo un JWT de Supabase y verifican el plan Pro en servidor.

La publicación actual es determinista: formatea las métricas canónicas de `focus_semantics` sin una nueva llamada de IA. Cuando el despliegue privado del modelo Mistral europeo esté disponible, podrá añadirse redacción reutilizando el pipeline de reportes Pro; hasta entonces no se envía actividad a un proveedor de IA adicional.
