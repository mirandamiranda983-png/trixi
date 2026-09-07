# Trixi — Administración de vendedores, clientes, productos y reportes diarios

Aplicación web funcional (no maqueta) para administrar vendedores, clientes,
productos y generar reportes diarios de venta con distribución aleatoria
controlada. Frontend estático (HTML/CSS/JS con módulos ES, sin build step) +
Firebase (Authentication + Firestore).

## Estructura

```
trixi-app/
├── index.html            Login
├── dashboard.html
├── vendedores.html
├── clientes.html
├── productos.html
├── asignacion.html
├── generador.html
├── historial.html
├── importar.html
├── configuracion.html
├── css/styles.css
├── js/
│   ├── firebase-config.js   Config Firebase (ya con tus credenciales)
│   ├── auth.js               Login / logout / guard de páginas
│   ├── nav.js                 Barra lateral compartida
│   ├── utils.js                Toasts, modales, CSV, aleatoriedad con semilla
│   ├── config-service.js        Configuración global (caché en memoria)
│   ├── dashboard.js
│   ├── vendedores.js
│   ├── clientes.js
│   ├── productos.js
│   ├── asignacion.js
│   ├── generador.js              Algoritmo de generación + vista previa
│   ├── historial.js               Listado, detalle, export CSV/XLSX/PDF
│   └── importar.js                 Importación CSV/XLSX con vista previa
├── firestore.rules
└── README.md (este archivo)
```

Todas las páginas están conectadas entre sí mediante la misma barra de
navegación (`js/nav.js`) y comparten la misma sesión de Firebase
Authentication — es un sitio multi-página clásico, no un SPA con router,
por eso son varios `.html`, pero todos hablan con el mismo proyecto Firebase
y quedan enlazados por el menú lateral.

## 1. Configurar Firebase

`js/firebase-config.js` ya contiene la configuración del proyecto
`trixi-2026` que compartiste. Si más adelante cambias de proyecto,
reemplaza ese bloque `firebaseConfig`.

En Firebase Console:

1. **Authentication → Sign-in method**: habilita "Correo/contraseña".
2. **Authentication → Users**: crea al menos un usuario administrador
   (correo + contraseña).
3. **Firestore Database**: crea la base de datos (modo producción).
4. **Firestore → Reglas**: pega el contenido de `firestore.rules` y publica.
5. Crea manualmente el documento `usuarios/{UID}` (con el UID del usuario
   que creaste en el paso 2) con al menos:
   ```json
   { "rol": "admin", "nombre": "Tu Nombre" }
   ```
   Sin este documento, las reglas de seguridad no dejarán leer ni escribir
   nada (por diseño).
6. **Authentication → Settings → Authorized domains**: agrega el dominio
   de GitHub Pages donde publicarás la app (ej. `tuusuario.github.io`).

## 2. Publicar en GitHub Pages

1. Sube esta carpeta (`trixi-app/`) a un repositorio de GitHub.
2. En **Settings → Pages**, selecciona la rama y la carpeta raíz.
3. Abre la URL publicada — comenzará en `index.html` (login).

No hay build step: todo se sirve tal cual, los imports de Firebase se
cargan como módulos ES directamente desde el CDN oficial de Google
(`gstatic.com`), por eso funciona en un hosting 100% estático.

## 3. Flujo de uso recomendado

1. Vendedores → crear o importar.
2. Clientes → crear o importar (o vía Asignación de clientes).
3. Asignación de clientes → verificar que cada vendedor tenga entre el
   mínimo/máximo configurado de clientes.
4. Productos → crear o importar, con rango de cantidades por producto.
5. Configuración → ajustar rangos globales, moneda y nombre de empresa.
6. Generador diario → seleccionar fecha y vendedores, generar vista previa,
   revisar totales, registrar el reporte (o regenerar antes de guardar).
7. Historial → consultar, filtrar, exportar (CSV/Excel/PDF) o anular
   reportes.

## 4. Seguridad — notas importantes

- La `apiKey` de Firebase en el frontend **no es secreta**: identifica el
  proyecto, no autoriza nada por sí sola. La autorización real vive en
  **Firestore Security Rules** (`firestore.rules`), que validan el rol
  del usuario contra su propio documento en `/usuarios/{uid}` — nunca
  contra una variable manipulable del navegador.
- El código de este frontend es visible para cualquiera (GitHub Pages es
  estático). Por eso ningún botón oculto reemplaza una regla de
  seguridad: todo lo sensible está protegido a nivel de Firestore.
- Si más adelante necesitas lógica que deba permanecer completamente
  oculta del navegador (por ejemplo, un cálculo de reporte que no quieras
  que el cliente pueda influenciar), muévela a una **Cloud Function**
  (`onCall` o HTTPS) y llama a esa función desde el frontend en lugar de
  ejecutar la lógica en el navegador. Este proyecto no incluye Cloud
  Functions todavía porque requieren el plan Blaze (pago por uso) de
  Firebase; el generador actual corre en el cliente porque solo distribuye
  datos que el propio usuario autenticado ya puede leer, pero queda
  preparado para migrarse a una función si lo necesitas.

## 5. Rendimiento

- El dashboard usa `getCountFromServer` (conteos agregados) en lugar de
  descargar colecciones completas.
- El generador y el historial cachean la configuración (`config-service.js`)
  para no releerla en cada módulo.
- Los guardados masivos (reportes, importaciones) usan `writeBatch` en
  lotes de 400 operaciones para respetar el límite de Firestore (500).

## 6. Próximos pasos sugeridos (no incluidos aún)

- Paginación real con `startAfter` en listados muy grandes (miles de
  clientes).
- Roles adicionales (ej. "vendedor" con acceso solo a sus propios datos).
- Cloud Function para bloquear por completo la generación de reportes
  desde el cliente si en el futuro necesitas lógica de negocio 100% oculta.
