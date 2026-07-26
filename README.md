# Maby Kiosco - Sistema de Control de Stock y Ventas

Aplicación de escritorio desarrollada con **Electron** y **Angular** para la gestión integral de un kiosco.

## Características

- **Dashboard**: Vista general de productos, stock y ventas
- **Gestión de Productos**: Alta uno por uno con categoría, código de barras, costo, margen y tipo de venta (unidad / kilo / litro)
- **Sistema de Ventas**: Registro de ventas con múltiples productos
- **Control de Stock**: Alertas automáticas de stock bajo
- **Gastos**: Registro de gastos por categoría, con filtro por día y navegación por mes/año
- **Base de Datos Local**: SQLite para almacenamiento persistente
- **Funciona sin internet**

## Instalación

### Prerrequisitos

- Node.js 18+
- npm

### Pasos

```bash
git clone https://github.com/MatyBartel/MabyKiosco.git
cd MabyKiosco
npm install
npm run postinstall
```

La aplicación usa una **base de datos propia e independiente** de otras apps del mismo sistema:

```
Documentos/Maby Kiosco/datos/mabykiosco.db
```

No comparte datos con La Esquina ni otras instalaciones. Al abrir la app por primera vez, la base arranca vacía.

Desde el dashboard podés abrir esa carpeta con el botón de guardar (esquina inferior derecha).

## Ejecutar

### Desarrollo (recomendado para modificar)

```bash
npm run electron:dev
```

### Producción local (probar el build sin instalador)

```bash
npm run build:clean
npm run electron
```

Si ves pantalla en blanco o el cartel "No se encontró la aplicación", el build de Angular no terminó bien. Volvé a correr `npm run build:clean`.

### Instalador Windows

```bash
npm run electron:build
```

El `.exe` queda en `dist-electron/`.

## Build confiable (si falla o queda desactualizado)

Corré estos pasos en orden, en PowerShell o CMD dentro de la carpeta del proyecto:

```bash
npm run clean
npm install
npm run rebuild:native
npm run build:clean
npm run electron
```

Para generar el instalador:

```bash
npm run electron:build
```

### Errores frecuentes

| Problema | Solución |
|----------|----------|
| Pantalla blanca al abrir Electron | `npm run build:clean` y después `npm run electron` |
| Cambios de Angular no se ven | No uses solo `electron`; hace falta `build` antes |
| Error con `better-sqlite3` | `npm run rebuild:native` |
| Build raro / archivos viejos | `npm run clean` y volver a buildear |
| Solo querés probar en el navegador | `npm run start` → http://localhost:4200 |

**Importante:** `electron:dev` usa el servidor en vivo (`localhost:4200`). `npm run electron` usa los archivos compilados en `dist/maby-kiosco/browser/`. Son dos modos distintos.

## Scripts

- `npm run electron:dev` - Desarrollo con recarga
- `npm run build:clean` - Limpia y compila Angular (producción)
- `npm run electron` - Abre la app con el build compilado
- `npm run electron:build` - Limpia, compila y genera instalador Windows
- `npm run electron:pack` - Igual que build pero sin instalador (carpeta descomprimida)
- `npm run clean` - Borra `dist`, `dist-electron` y caché de Angular
- `npm run rebuild:native` - Recompila módulos nativos (SQLite) para Electron

## Estructura

```
MabyKiosco/
├── src/app/              # Angular (componentes, servicios)
├── src/assets/
│   ├── brand/            # Logo circular y banner de Maby
│   └── logos/            # Iconos de menú, dashboard y acciones
├── electron/             # Proceso principal Electron
└── assets/               # Icono .ico para instalador Windows (Electron)
```

## Licencia

MIT
