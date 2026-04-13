# PymeFlow — Manual de Usuario

**Versión:** 1.0 · **Fecha:** Abril 2026

---

## Tabla de Contenidos

1. [Introducción y Primeros Pasos](#1-introducción-y-primeros-pasos)
2. [Dashboard Principal](#2-dashboard-principal)
3. [Gestión de Clientes](#3-gestión-de-clientes)
4. [Facturas Electrónicas](#4-facturas-electrónicas)
5. [Cobranza Automática](#5-cobranza-automática)
6. [Gastos y Crédito Fiscal IVA](#6-gastos-y-crédito-fiscal-iva)
7. [Flujo de Caja](#7-flujo-de-caja)
8. [Integración con el SII](#8-integración-con-el-sii)
9. [Notificaciones](#9-notificaciones)
10. [Suscripción y Planes](#10-suscripción-y-planes)
11. [Administración de Usuarios y Roles](#11-administración-de-usuarios-y-roles)
12. [Preguntas Frecuentes](#12-preguntas-frecuentes)

---

## 1. Introducción y Primeros Pasos

### ¿Qué necesitas para comenzar?

- RUT de tu empresa
- Correo electrónico de acceso
- Para emitir facturas electrónicas al SII: certificado digital (.p12) y CAF vigente

### 1.1 Registro de tu Empresa

1. Ingresa a **app.pymeflow.cl** y haz click en **"Crear cuenta"**
2. Completa el formulario:
   - **Razón Social**: nombre legal de tu empresa
   - **RUT Empresa**: con formato `12.345.678-9`
   - **Email**: será tu usuario administrador
   - **Contraseña**: mínimo 8 caracteres, incluye mayúsculas y números
3. Acepta los Términos de Servicio y haz click en **"Registrar Empresa"**
4. Serás redirigido automáticamente al Dashboard

> **Cuenta de prueba (demo):** email `admin@demo-pymeflow.cl` / contraseña `Admin123!`

### 1.2 Inicio de Sesión

1. Ingresa tu email y contraseña
2. Si cerraste sesión, el sistema solicitará login nuevamente
3. La sesión se mantiene activa hasta que hagas logout explícito

**Seguridad**: Las contraseñas se almacenan con hash bcrypt. Los tokens de sesión rotan automáticamente. Después de 5 intentos fallidos en 15 minutos, la cuenta se bloquea temporalmente.

### 1.3 Instalación como App (PWA)

PymeFlow funciona como aplicación móvil sin necesidad de App Store:

1. Abre PymeFlow en Chrome/Safari desde tu celular
2. Aparecerá un banner **"Instalar PymeFlow"**
3. Acepta la instalación → PymeFlow aparecerá en tu pantalla de inicio
4. Activa las **notificaciones push** cuando se solicite para recibir alertas de cobranza

---

## 2. Dashboard Principal

El Dashboard es tu pantalla de resumen financiero. Se actualiza en tiempo real.

### Métricas del Dashboard

| Tarjeta | Qué muestra |
|---------|-------------|
| **Facturado este mes** | Total en pesos de facturas emitidas en el mes actual |
| **Por cobrar** | Monto total de facturas impagas (vigentes + vencidas) |
| **Vencidas** | Cantidad y monto de facturas que superaron su fecha de vencimiento |
| **Cobrado este mes** | Pagos registrados en el período actual |

### Secciones del Dashboard

- **Últimas facturas**: las 5 facturas más recientes con su estado visual
- **Top 5 clientes**: los clientes que generan más facturación
- **Distribución por estado**: gráfico con breakdown de facturas (Borrador / Emitida / Enviada SII / Pagada / Vencida)

> **Tip**: Haz click en cualquier tarjeta para ir directamente al módulo relacionado.

---

## 3. Gestión de Clientes

### 3.1 Agregar un Cliente

1. Ve al menú **Clientes** → click en **"+ Nuevo Cliente"**
2. En el modal que aparece, completa los datos:
   - **Razón Social*** : nombre legal del cliente (requerido)
   - **RUT*** : se valida automáticamente (formato y dígito verificador chileno) (requerido)
   - **Email*** : para enviar facturas y recordatorios de cobranza (requerido)
   - **Teléfono**: para recordatorios vía WhatsApp/SMS (opcional)
   - **Días de pago**: cuántos días tiene para pagar (ej: 30, 60, 90) - por defecto 30 días
   - **Límite de crédito (CLP)**: monto máximo de deuda permitido (opcional, deja en blanco para sin límite)
   - **Dirección**: calle, número, ciudad, región (opcional)
   - **Giro / Actividad**: rubro o actividad del cliente (opcional)
3. Click en **"Crear cliente"** (o **"Guardar cambios"** si estás editando)

### 3.2 Buscar y Filtrar Clientes

- Usa la barra de búsqueda para buscar por **razón social**, **RUT** o **email**
- Usa el filtro desplegable **"Todos / Activos / Inactivos"** para filtrar por estado
- Haz click en el nombre del cliente para ir a su **perfil completo**

### 3.3 Editar un Cliente

1. Ve al menú **Clientes**
2. Busca el cliente en la tabla
3. Click en el **ícono de tres puntos (⋮)** al final de la fila
4. Selecciona **"Editar"** en el menú desplegable
5. Modifica los campos que necesites
6. Click en **"Guardar cambios"**

Alternativamente, puedes entrar al **perfil del cliente** (click en su nombre) y luego hacer click en **"Editar cliente"**.**

### 3.4 Desactivar y Reactivar un Cliente

Para gestionar el estado de un cliente:
1. Haz click en el **ícono de tres puntos (⋮)** al final de la fila del cliente
2. Selecciona:
   - **"Desactivar"** → el cliente queda inactivo y no aparece al crear facturas
   - **"Reactivar"** → lo vuelves a habilitar

El estado se muestra como badge en la columna: 🟢 **Activo** / ⚫ **Inactivo**

### 3.5 Perfil del Cliente

Haz click en el **nombre del cliente** en la tabla para ir a su perfil completo:
- KPIs: Total facturado / Total pagado / Deuda vencida
- Información completa: email, teléfono, dirección, giro, días de pago, límite de crédito
- **Historial completo de facturas** emitidas a ese cliente
- Botón **"+ Nueva factura"** que pre-selecciona el cliente automáticamente

---

## 4. Facturas Electrónicas

### Estados de una Factura

```
BORRADOR → EMITIDA → ENVIADA AL SII → PARCIAL/PAGADA
                                    ↘ VENCIDA
                                    ↘ CANCELADA
```

### 4.1 Crear una Factura

1. Ve a **Facturas** → click en **"+ Nueva Factura"**
2. Selecciona el **Tipo de Documento**:
   - Factura Electrónica (Afecta IVA)
   - Factura Exenta Electrónica
   - Boleta Electrónica
   - Nota de Crédito / Nota de Débito
3. Selecciona el **Cliente** (buscando por nombre o RUT)
   - Los días de crédito se cargan automático desde el cliente
4. Configura **Días de Crédito** si necesitas cambiarlos
5. Agrega los **ítems**:
   - Descripción del producto o servicio
   - Cantidad y precio unitario
   - Descuento en dinero (si aplica)
6. Los montos se calculan automáticamente:
   - Subtotal Neto
   - IVA 19% (si aplica)
   - **Total**
7. Agrega notas o referencia interna (opcional)
8. Elige cómo continuar:
   - Click en **"Guardar borrador"** → guarda en estado BORRADOR, podrás emitirla después
   - Click en **"Emitir ahora"** → crea y emite la factura directamente, redirige al detalle

### 4.2 Emitir una Factura desde el Listado

Si guardaste un borrador y quieres emitirlo:

1. Ve a **Facturas** → verás el borrador con la etiqueta **"Borrador"** en la columna N°
2. En la columna **Acción** al final de la fila, haz click en **"▶ Emitir"**
3. También puedes hacer click en **cualquier parte de la fila** para ir al detalle
4. En la página de detalle, haz click en el botón verde **"Emitir"**
5. PymeFlow realiza automáticamente:
   - Asignación de un **folio** del rango CAF autorizado por el SII
   - Construcción del **XML DTE** según especificaciones SII
   - **Firma digital** usando tu certificado .p12
   - Cambio de estado a **EMITIDA**

### 4.3 Enviar al SII

Una vez que la factura está **EMITIDA**, puedes enviarla al SII:

1. En la página de detalle de la factura, haz click en **"Enviar al SII"** (botón azul/índigo)
2. PymeFlow envía el DTE al Servicio de Impuestos Internos
3. El estado cambia a **ENVIADA**
4. Puedes monitorear el progreso con el botón **"Consultar SII"** para ver la respuesta del SII
5. Una vez aceptada, la factura tendrá estado final y verás el **Track ID** de envío

### 4.4 Registrar un Pago

1. Abre la factura → click en **"Registrar Pago"**
2. Ingresa:
   - **Monto pagado** (puede ser parcial)
   - **Fecha de pago**
   - **Método de pago**: transferencia, efectivo, cheque, tarjeta
   - **Referencia**: número de transferencia o cheque (opcional)
3. Si el pago es total, la factura pasa a **PAGADA**
4. Si es parcial, queda en **PAGO PARCIAL** y puedes agregar más pagos

### 4.5 Descargar PDF

- Desde cualquier factura emitida: click en **"Descargar PDF"**
- El PDF incluye todos los datos legales, folio, sello del SII y detalle de ítems

### 4.6 Cancelar una Factura

- Solo facturas en estado **EMITIDA** o **ENVIADA** pueden cancelarse
- Para documentos ya enviados al SII, se debe emitir una **Nota de Crédito** asociada
- Click en **"Cancelar Factura"** → confirma la acción

---

## 5. Cobranza Automática

PymeFlow cobra por ti sin que tengas que intervenir.

### 5.1 Cómo Funciona

Cuando una factura vence (o según los días configurados), PymeFlow envía automáticamente recordatorios al cliente por:
- **Email**: con detalle de la deuda y botón de contacto
- **WhatsApp**: mensaje de texto con el monto adeudado
- **SMS**: mensaje corto con la información esencial

### 5.2 Configurar Cobranza

1. Ve a **Cobranza** → **"Configuración"**
2. Activa/desactiva los canales: Email / WhatsApp / SMS
3. Define los **días de recordatorio** (ej: `[1, 3, 7, 15]` = recordar al día 1, 3, 7 y 15 después del vencimiento)
4. Click en **"Guardar Configuración"**

### 5.3 Ver Logs de Cobranza

1. Ve a **Cobranza** → **"Historial"**
2. Filtra por:
   - **Cliente**
   - **Canal** (Email / WhatsApp / SMS)
   - **Estado** (Enviado / Entregado / Fallido / Rebotado)
   - **Rango de fechas**
3. Cada registro muestra el mensaje enviado, estado de entrega y timestamp

### 5.4 Ejecutar Cobranza Manual

Si necesitas enviar un recordatorio ahora mismo:
1. Ve a **Cobranza** → click en **"Ejecutar Cobranza Ahora"**
2. PymeFlow procesa todas las facturas vencidas pendientes de recordatorio

---

## 6. Gastos y Crédito Fiscal IVA

### 6.1 Registrar un Gasto

1. Ve a **Gastos** → click en **"+ Nuevo Gasto"**
2. Completa los datos:
   - **Categoría**: Remuneraciones, Arriendo, Servicios Básicos, Materiales, Transporte, Marketing, Software, Contabilidad, Otros
   - **Proveedor**: nombre y RUT (opcional)
   - **Folio documento**: si tienes la factura del proveedor
   - **Monto total** (con IVA)
   - **Fecha de emisión** y **fecha de vencimiento**
3. PymeFlow calcula automáticamente:
   - Monto Neto = Total / 1.19
   - IVA Crédito = Total - Neto
4. Click en **"Guardar Gasto"**

### 6.2 Marcar Gasto como Pagado

1. Desde la lista de gastos, click en el gasto → **"Marcar como Pagado"**
2. Ingresa la fecha de pago
3. El gasto queda registrado como pagado

### 6.3 Crédito Fiscal IVA

Ve a **Gastos** → **"Resumen IVA"** para ver:
- **IVA Crédito Fiscal total**: suma del IVA de todos los gastos del mes
- **IVA Débito Fiscal total**: IVA cobrado en tus facturas del mes
- **IVA a pagar al SII** = Débito − Crédito
- Filtrable por mes específico

> Este resumen es el insumo principal para tu declaración mensual de IVA (F29).

### 6.4 Filtros de Gastos

- Por **categoría**: filtra todos los gastos de arriendos, software, etc.
- Por **estado**: pendientes de pago vs. pagados
- Por **rango de fechas**
- Búsqueda por proveedor

---

## 7. Flujo de Caja

Responde la pregunta más importante de todo empresario: **¿cuánto dinero tendrás en el futuro?**

### 7.1 Resumen de Flujo de Caja

Ve a **Flujo de Caja** → verás 3 proyecciones:

| Período | Qué incluye |
|---------|-------------|
| **30 días** | Saldo actual + pagos esperados − gastos pendientes |
| **60 días** | Proyección a dos meses |
| **90 días** | Proyección trimestral |

Cada proyección tiene un indicador de salud:
- 🟢 **OK**: liquidez positiva
- 🟡 **ALERTA**: saldo bajo o tendencia negativa
- 🔴 **CRÍTICO**: riesgo de iliquidez

### 7.2 Entradas de Flujo de Caja

Para mayor precisión, puedes agregar entradas manuales:
1. Click en **"+ Agregar Entrada"**
2. Selecciona tipo:
   - **INGRESO**: pagos esperados que no son facturas (ej: venta en efectivo)
   - **EGRESO**: gastos conocidos que aún no registraste (ej: cuota de arriendo)
   - **PROYECCIÓN**: estimación futura
3. Ingresa monto, fecha y descripción

### 7.3 Sincronizar con Transacciones Reales

Click en **"Sincronizar"** para que PymeFlow actualice el flujo de caja con:
- Pagos reales de facturas registrados
- Gastos marcados como pagados
- Remoción de proyecciones ya confirmadas

---

## 8. Integración con el SII

### 8.1 Cargar tu Certificado Digital

1. Ve a **SII** → **"Certificado Digital"**
2. Click en **"Subir Certificado"**
3. Selecciona tu archivo **.p12**
4. Ingresa la **contraseña del certificado**
5. Click en **"Guardar"**

> El certificado se almacena cyfrado. PymeFlow nunca expone tu clave privada.

### 8.2 Ambiente (Certificación vs. Producción)

1. Ve a **SII** → **"Configuración"**
2. Selecciona:
   - **CERTIFICACIÓN**: para pruebas con datos de test del SII
   - **PRODUCCIÓN**: para emisión real de documentos tributarios
3. Guarda el cambio

> **Importante**: Comienza siempre en CERTIFICACIÓN antes de pasar a PRODUCCIÓN.

### 8.3 Cargar CAF (Folios Autorizados)

El CAF (Código de Autorización de Folios) es el archivo que el SII te entrega para usar folios en tus facturas:

1. Ve a **SII** → **"CAF - Folios"**
2. Click en **"Subir CAF"**
3. Selecciona el archivo XML del CAF descargado desde sii.cl
4. PymeFlow lo procesará y mostrará:
   - Tipo de documento
   - Rango de folios (desde − hasta)
   - Fecha de vencimiento
   - Folios disponibles restantes

### 8.4 Ver Estado de Facturas en el SII

Desde cualquier factura enviada:
1. Click en **"Ver Estado SII"**
2. PymeFlow consulta el Web Service del SII y muestra:
   - **Track ID** de envío
   - Estado de procesamiento (Aceptada / Rechazada / En proceso)
   - Acuse de recibo del receptor

### 8.5 Descargar XML

- Desde la factura → **"Descargar XML"** para obtener el DTE firmado

---

## 9. Notificaciones

### 9.1 Tipos de Notificaciones

PymeFlow te avisa automáticamente sobre:
- Facturas que se vencen pronto
- Pagos recibidos
- Errores de envío al SII
- Recordatorios de cobranza enviados/fallidos
- Renovación de suscripción

### 9.2 Centro de Notificaciones

- Haz click en el **ícono de campana** (esquina superior derecha)
- Las notificaciones no leídas muestran un badge con cantidad
- Click en **"Marcar todo como leído"** para limpiar el badge

### 9.3 Notificaciones Push (App Móvil)

Si instalaste PymeFlow como PWA:
1. Asegúrate de haber aceptado los permisos de notificación
2. Recibirás alertas push aunque no tengas PymeFlow abierto
3. Puedes desactivarlas en **Configuración del Dispositivo** o en **SII → Notificaciones**

---

## 10. Suscripción y Planes

### 10.1 Ver tu Plan Actual

1. En el menú lateral izquierdo, haz click en **"Suscripción"** (ícono de tarjeta de crédito)
2. Verás:
   - Plan activo y su estado (Activo / Período de prueba / Cancelado)
   - Fecha de renovación
   - Botón **"Gestionar facturación"** (si tienes suscripción activa via Stripe)

### 10.2 Cambiar de Plan

1. En **"Mi Suscripción"** → click en **"Cambiar Plan"**
2. Selecciona el plan deseado
3. Serás redirigido a la plataforma de pago **Stripe** para completar con tarjeta
4. Al confirmar, el plan se actualiza inmediatamente

### 10.3 Portal de Facturación

1. En **"Mi Suscripción"** → click en **"Gestionar Facturación"**
2. Accederás al portal de Stripe donde puedes:
   - Cambiar la tarjeta de crédito
   - Descargar boletas de pago
   - Cancelar la suscripción
   - Ver historial de pagos

---

## 11. Administración de Usuarios y Roles

### Roles Disponibles

| Rol | Acceso |
|-----|--------|
| **OWNER** | Acceso total. Puede invitar, eliminar usuarios y cambiar plan |
| **ADMIN** | Acceso total excepto cambio de plan y eliminación del owner |
| **ACCOUNTANT** | Lectura y escritura en facturas, gastos y SII. No gestiona usuarios |
| **OPERATOR** | Solo puede crear facturas y clientes. Sin acceso a configuración |

> La gestión de usuarios se realiza desde **Configuración → Equipo**.

---

## 12. Preguntas Frecuentes

**¿Necesito el certificado digital para empezar?**
No. Puedes registrar clientes, crear borradores de facturas y gestionar gastos sin certificado. Solo necesitas el certificado para emitir y enviar facturas al SII.

**¿Qué pasa si se agotan mis folios CAF?**
PymeFlow te notificará cuando queden pocos folios disponibles. Debes descargar un nuevo CAF desde sii.cl y subirlo. Puedes tener múltiples CAFs activos simultáneamente.

**¿Las facturas en ambiente CERTIFICACIÓN son válidas tributariamente?**
No. Las facturas de certificación son solo para pruebas. Solo las emitidas en PRODUCCIÓN tienen validez tributaria.

**¿Puedo exportar mis datos?**
Sí. Los XMLs y PDFs de todas las facturas son descargables individualmente. Para exportaciones masivas contacta a soporte.

**¿Cómo cancelo mi suscripción?**
Ve a **Mi Suscripción → Gestionar Facturación**. Desde el portal de Stripe puedes cancelar. El plan se mantiene activo hasta el fin del período ya pagado.

**¿Es seguro subir mi certificado digital?**
Sí. El certificado se cifra con AES-256 antes de almacenarse. La clave de cifrado nunca viaja con los datos. Ningún empleado de PymeFlow puede acceder a tu certificado en texto plano.

**¿PymeFlow funciona offline?**
La PWA carga la interfaz sin conexión, pero las operaciones que requieren datos del servidor (emitir facturas, sincronizar con SII) necesitan conexión a Internet.

---

*¿Necesitas ayuda adicional? Escríbenos a soporte@pymeflow.cl*

*PymeFlow — Versión 1.0 · Abril 2026*
