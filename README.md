# Emprende +

Aplicación web progresiva para administrar empresas con cuentas autenticadas y datos sincronizados mediante Supabase. GitHub Pages solo aloja los archivos estáticos del cliente; no administra las cuentas ni almacena los datos empresariales.

## Requisitos

- Node.js 20 o superior para construir y previsualizar.
- Git para versionar el proyecto y publicarlo desde una cuenta propia de GitHub.
- Un proyecto Supabase propio para autenticación y almacenamiento.

## Vista previa en el computador

Desde una terminal abierta en la carpeta del proyecto:

```powershell
npm ci
npm run build
npm run preview
```

Abre `http://127.0.0.1:4173/` en el navegador. El servidor de vista previa solo escucha en el computador local.

## Publicación de una vista previa en GitHub Pages

1. Abre esta carpeta con GitHub Desktop e inicializa un repositorio Git local si te lo solicita.
2. Usa **Publish repository** para crear un repositorio nuevo en tu cuenta. No subas contraseñas, tokens ni archivos `.env`.
3. En GitHub, abre **Settings > Pages** y elige **GitHub Actions** como fuente de publicación.
4. Cada envío de cambios a `main` ejecutará `.github/workflows/deploy-pages.yml`. También puedes iniciarlo desde la pestaña **Actions**.
5. Cuando termine la acción, GitHub mostrará la dirección pública del sitio en el entorno `github-pages`.

El flujo genera `dist/` con los archivos públicos de la aplicación y publica solo esa carpeta. Sin Supabase, el sitio funciona como **vista previa visual**: muestra ingreso y registro, pero los controles quedan deshabilitados y no existen cuentas reales ni acceso a los paneles. No uses esta publicación para datos reales.

Para activar autenticación y datos empresariales más adelante, crea un proyecto Supabase y añade estas **Actions variables**:

- `VITE_SUPABASE_URL`: URL del proyecto Supabase.
- `VITE_SUPABASE_ANON_KEY`: clave pública `anon`/publishable del proyecto.

Estas dos variables se incorporan al cliente público durante el build. Nunca pongas una clave `service_role`, contraseñas ni tokens en el cliente, en GitHub Pages o en archivos versionados. Después de guardarlas, vuelve a ejecutar el workflow desde **Actions**.

## Preparar Supabase

1. Crea un proyecto Supabase desde tu cuenta.
2. En **SQL Editor**, ejecuta el contenido de `supabase/migrations/202610310001_initial_schema.sql`.
3. En **Authentication > URL Configuration**, configura la URL de GitHub Pages y la URL local de desarrollo como redirect URLs permitidas.
4. Crea manualmente la cuenta inicial del administrador en el panel de autenticación de Supabase. Después promueve exclusivamente ese usuario con una consulta controlada como:

   ```sql
   update public.profiles
   set role = 'platform_admin', status = 'active', company_id = null
   where email = 'correo-administrador@example.com';
   ```

5. Añade la URL y la clave pública como variables del repositorio, y vuelve a ejecutar el workflow de Pages.

El formulario público crea una cuenta propietaria y una empresa. Cada cuenta de propietario solo puede crear una empresa; además, el cliente recuerda qué cuenta empresarial se usó primero en ese perfil de navegador y no permite cambiar a otra. Ese vínculo local puede borrarse o manipularse y no es una barrera de seguridad: la separación real se aplica en el servidor por cuenta y empresa. El administrador de Emprende + es una cuenta separada, creada manualmente; nunca se ofrece como opción en el registro público.

Al abrir o recargar la aplicación siempre se muestra el formulario de inicio de sesión, tanto para propietarios como para el administrador de plataforma. La sesión no se conserva entre recargas; después de registrar una empresa, el propietario debe iniciar sesión explícitamente.

Las cuentas de administrador y empleado de una empresa deben crearse mediante un flujo de invitación autenticado antes de su uso. El panel de plataforma permite revisar y ajustar los perfiles existentes; no finge que una cuenta manual sea una credencial.

## Privacidad y estado del producto

El inicio de sesión consulta el rol empresarial o el rol interno desde Supabase. Las políticas RLS separan empresas y bloquean al administrador de plataforma el acceso a registros operativos. Las operaciones de negocio requieren conexión; la PWA almacena sus archivos estáticos para volver a abrir la interfaz sin conexión, pero todavía no tiene una cola de escritura/sincronización offline.

Las copias automáticas internas de operaciones quedan en IndexedDB, en el navegador actual, y se filtran por empresa. No protegen ante la pérdida completa del dispositivo. Descarga copias externas y consérvalas en un lugar seguro. La clave pública de Supabase no sustituye las políticas RLS; ejecuta la migración antes de usar datos reales.
