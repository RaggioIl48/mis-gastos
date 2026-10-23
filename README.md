# Mis Gastos

App para registrar gastos personales en pesos colombianos. Todo se guarda en el teléfono: sin cuentas ni servidores.

Hay dos versiones con las mismas funciones:

- **Versión web** (carpeta [`web/`](web/)): se abre en Safari y se instala con *Añadir a pantalla de inicio*. Es la forma recomendada si no tienes Mac.
- **App nativa para iPhone** (Swift + SwiftUI + SwiftData): necesita Xcode o Sideloadly para instalarse.

## Versión web

HTML, CSS y JavaScript sin dependencias ni paso de compilación.

- Instalar en el iPhone: abre la dirección publicada en **Safari** → **Compartir** → **Añadir a pantalla de inicio**. Ábrela siempre desde ese icono: funciona sin Internet y el iPhone conserva sus datos.
- Los datos viven en el almacenamiento de Safari para ese sitio. En **Ajustes → Exportar copia** guardas un archivo de respaldo que luego puedes **Importar**.
- Probar en el PC (requiere Node.js):

```bash
cd web
npm start
```

y abre http://localhost:5173. Pruebas de la lógica: `npm test`. Para regenerar los iconos: `npm run icons`.

| Archivo | Contenido |
| --- | --- |
| `web/logic.js` | Lógica pura: miles → pesos, formato `$25.000`, totales, filtros, duplicados, categorías, CSV y copias |
| `web/store.js` | Guardado local (localStorage) |
| `web/app.js` | Interfaz: Inicio, Historial, Categorías, Ajustes y formularios |
| `web/sw.js` | Funcionamiento sin conexión |
| `web/tests/` | Pruebas con `node --test` |

## App nativa: requisitos

- Un Mac con **Xcode 16 o posterior** (el proyecto usa carpetas sincronizadas de Xcode 16).
- iPhone con **iOS 17 o posterior**.
- Un Apple ID (una cuenta gratuita sirve para instalarla en tu propio iPhone).

> No se puede compilar una app de iOS en Windows. Este proyecto se escribió en Windows y **todavía no se ha compilado ni probado**: la primera compilación en Xcode puede mostrar errores que haya que corregir.

## Ejecutar en el simulador

1. Copia esta carpeta al Mac y abre `MisGastos.xcodeproj`.
2. Arriba, elige el esquema **MisGastos** y un simulador (por ejemplo, iPhone 16).
3. Pulsa **⌘R**.

## Instalar en tu iPhone

1. En Xcode: **Settings → Accounts → +** y añade tu Apple ID.
2. Selecciona el proyecto **MisGastos** → objetivo **MisGastos** → pestaña **Signing & Capabilities**:
   - **Team**: tu Apple ID (Personal Team).
   - **Bundle Identifier**: cambia `com.tunombre.MisGastos` por uno único, por ejemplo `com.andres.MisGastos`.
3. Conecta el iPhone por cable y confía en el Mac cuando lo pida.
4. En el iPhone activa **Ajustes → Privacidad y seguridad → Modo de desarrollador** (se reinicia).
5. En Xcode elige tu iPhone como destino y pulsa **⌘R**.
6. La primera vez, en el iPhone: **Ajustes → General → VPN y gestión de dispositivos →** tu Apple ID **→ Confiar**.

Con una cuenta gratuita la app caduca a los 7 días; vuelve a pulsar ⌘R desde Xcode para renovarla (los datos se conservan). Con la cuenta de pago de Apple Developer dura un año.

## Pruebas

En Xcode: **⌘U**. Desde la terminal del Mac:

```bash
xcodebuild test -project MisGastos.xcodeproj -scheme MisGastos -destination 'platform=iOS Simulator,name=iPhone 16'
```

Las pruebas cubren la conversión de miles a pesos, el formato `$25.000`, totales por mes y día, filtros, detección de duplicados, reglas de categorías y la exportación CSV.

## Sin Mac: GitHub Actions + Sideloadly

El flujo [`.github/workflows/ios.yml`](.github/workflows/ios.yml) se ejecuta en un Mac de GitHub con cada `push` (o a mano desde la pestaña **Actions → iOS → Run workflow**) y:

1. Compila la app y ejecuta las pruebas en un simulador de iPhone.
2. Compila la versión para iPhone sin firmar y la empaqueta como `MisGastos-sin-firmar.ipa`.
3. Publica dos artefactos en la ejecución: **MisGastos-sin-firmar** (el `.ipa`) y **registros** (logs de `xcodebuild` y resultados de pruebas, también si algo falla).

Si una ejecución falla, descarga el artefacto **registros** y revisa `xcodebuild-test.log` o `xcodebuild-device.log`.

### Instalar el .ipa en el iPhone desde Windows

1. En GitHub abre la última ejecución correcta y descarga **MisGastos-sin-firmar** (viene en un `.zip`; descomprímelo).
2. Instala **iTunes** (versión de la web de Apple) y **Sideloadly** desde su web oficial.
3. Conecta el iPhone por cable y confía en el PC.
4. En Sideloadly arrastra el `.ipa`, escribe tu Apple ID y pulsa **Start**. Sideloadly firma la app con tu cuenta.
5. En el iPhone activa **Ajustes → Privacidad y seguridad → Modo de desarrollador** y confía en tu Apple ID en **Ajustes → General → VPN y gestión de dispositivos**.

Con un Apple ID gratuito la app caduca a los 7 días; repite el paso 4 para renovarla (los datos se conservan si reinstalas la misma app).

## Cómo funciona el valor

- Escribes el valor **en miles**: `25` → **$25.000**, `1250` → **$1.250.000**, `2,5` → **$2.500**.
- Antes de guardar se muestra la vista previa con el valor real.
- Se guarda como número entero en pesos completos (25000), sin decimales.

## Estructura

```
MisGastos/
  MisGastosApp.swift       Punto de entrada y base de datos local (SwiftData)
  Models/                  Expense y ExpenseCategory (+ categorías iniciales)
  Logic/                   Lógica sin interfaz: moneda, totales, filtros,
                           duplicados, reglas de categorías y CSV
  Views/                   Inicio, Historial, Categorías y formularios
MisGastosTests/            Pruebas unitarias de Logic/
```

## Funciones

- **Inicio**: total del mes, gasto de hoy, movimientos del mes y navegación a meses anteriores.
- **Añadir/editar gasto**: valor (teclado numérico), categoría (recuerda la última usada), fecha (hoy por defecto) y descripción opcional. Avisa si intentas guardar el mismo gasto dos veces en menos de 2 minutos.
- **Historial**: todos los gastos agrupados por día, del más reciente al más antiguo; filtros por categoría y fechas; editar y eliminar (con confirmación); exportar a CSV lo que se está viendo.
- **Categorías**: crear, renombrar, cambiar icono y eliminar las que no tienen gastos. Las que tienen gastos se conservan.
- Modo claro y oscuro según el sistema.
