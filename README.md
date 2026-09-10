# Sleep8

Aplicación web para organizar un horario de sueño de ~8 horas por noche.

## 1. Probarla en tu computadora

Necesitas tener [Node.js](https://nodejs.org) instalado (versión 18 o más reciente).

```bash
npm install
npm run dev
```

Abre la URL que aparezca en la terminal (normalmente `http://localhost:5173`).

## 2. Publicarla con una URL real (gratis)

La forma más simple es con **Vercel** o **Netlify**:

### Opción A — Vercel
1. Sube esta carpeta a un repositorio de GitHub.
2. Entra a [vercel.com](https://vercel.com), conecta tu cuenta de GitHub e importa el repositorio.
3. Vercel detecta Vite automáticamente. Solo da clic en "Deploy".
4. En unos segundos obtienes una URL pública (ej. `sleep8.vercel.app`).

### Opción B — Netlify (arrastrar y soltar, sin GitHub)
1. Ejecuta `npm run build` en tu computadora. Esto genera una carpeta `dist/`.
2. Entra a [app.netlify.com/drop](https://app.netlify.com/drop) y arrastra la carpeta `dist/`.
3. Netlify te da una URL pública al instante.

## 3. Instalarla como app en el celular

Una vez publicada (paso 2), abre la URL en Chrome (Android) o Safari (iPhone):

- **Android (Chrome):** menú (⋮) → "Agregar a pantalla de inicio".
- **iPhone (Safari):** botón compartir → "Agregar a pantalla de inicio".

Sleep8 ya está configurada como PWA (`vite-plugin-pwa`), así que se instalará con su propio ícono y abrirá en pantalla completa, como una app nativa.

## Datos del usuario

Los horarios, registros y preferencias se guardan con `localStorage` directamente en el navegador del dispositivo. No se envían a ningún servidor. Si quieres que los datos se sincronicen entre dispositivos o con una cuenta de usuario, se necesitaría agregar un backend (por ejemplo Supabase o Firebase) — puedo ayudarte a añadirlo si lo necesitas.
