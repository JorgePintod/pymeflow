# PymeFlow — Guía de Pruebas Disponibles (Estado Actual)

**Fecha**: 13 de Abril 2026 · **Versión**: 1.0

---

## Introducción

This guide shows you exactly what you can test RIGHT NOW in PymeFlow. We've marked what works and what's still in development.

**Cuenta demo:**
- Email: `admin@demo-pymeflow.cl`
- Contraseña: `Admin123!`

---

## ✅ Lo que SÍ funciona

### 1. Autenticación

```
1. Abre http://localhost:3000
2. Click en \"Iniciar sesión\" (si no está logeado)
3. Usa: admin@demo-pymeflow.cl / Admin123!
4. ✅ Deberías entrar al dashboard
```

---

### 2. Gestión de Clientes (Casi completo)

**Lo que funciona:**

```
1. Ve a Clientes (menú lateral)
2. Click en "+ Nuevo cliente"
3. Llena el formulario PERO NOTA:
   - ✅ Razón Social
   - ✅ RUT (validado)
   - ✅ Email
   - ✅ Teléfono (tienes que scroll dentro del modal para verlo)
   - ✅ Días de pago
   - ✅ Dirección
   - ✅ Giro/Actividad
   - ❌ Límite de crédito (NO APARECE - falta implementar)
4. Click en "Crear cliente"
5. ✅ El cliente se crea y aparece en la tabla
6. Busca con el campo de búsqueda → ✅ funciona
7. Click en "Editar" → ✅ abre el modal para editar
```

**Lo que NO funciona aún:**
- ❌ Botones \"3 puntos\" para desactivar/reactivar
- ❌ Campo \"Límite de crédito\"

---

### 3. Crear Facturas (Flujo parcial)

**Flujo correcto:**

```
1. Ve a Facturas → Click en "+ Nueva Factura"
2. Selecciona cliente, tipo de documento, ítems
3. ✅ Los montos se calculan automáticamente (Neto, IVA, Total)
4. Click en "Crear factura (borrador)"
5. ✅ Se crea y vuelve al listado de facturas
6. Click en el folio de la factura para entrar a detalles
7. En detalles, haz click en el botón verde "EMITIR"
8. ✅ La factura cambia a estado EMITIDA
9. Luego click en "Enviar al SII" (botón azul)
10. ✅ Se envía (requiere certificado .p12 - verás error si no lo tienen)
```

**Lo que NO funciona:**
- ❌ Botón \"Emitir Ahora\" durante la creación (solo después de crear el draft)

---

### 4. Facturas - Acciones en la Página de Detalle

Una vez dentro de una factura emitida, VERÁS estos botones:

```
En la barra superior:
- ✅ PDF: Descargar factura en PDF
- ✅ Emitir: Si está en DRAFT (botón verde)
- ✅ Registrar pago: Si está ISSUED/OVERDUE/PARTIAL (botón azul)
- ✅ Enviar al SII: Si está ISSUED (botón índigo)
- ✅ Consultar SII: Si está SENT (botón gris)
- ✅ XML: Descargar XML si ya fue a SII
- ✅ Anular: Si está ISSUED/OVERDUE (botón rojo)
```

**Prueba: Registrar un pago**

```
1. Abre una factura EMITIDA o ENVIADA
2. Click en "Registrar pago"
3. ✅ Modal se abre
4. Ingresa: monto, fecha de pago, método (TRANSFERENCIA/EFECTIVO/etc), referencia
5. Click en \"Registrar\"
6. ✅ El pago se registra
7. Si fue pago total → factura pasa a PAGADA
8. Si fue parcial → factura queda en PAGO PARCIAL
9. Puedes volver a registrar más pagos
```

---

### 5. Búsqueda y Filtros

**Clientes:**
- ✅ Barra búsqueda por nombre/RUT/contacto
- ✅ Paginación

**Facturas:**
- ✅ Búsqueda por cliente/RUT
- ✅ Filtro por estado (DRAFT/ISSUED/SENT/PARTIAL/PAID/OVERDUE/CANCELLED)
- ✅ Paginación

---

### 6. Validaciones

- ✅ RUT chileno (validación del dígito verificador)
- ✅ Email válido
- ✅ Campos requeridos con mensajes de error
- ✅ No puedes crear factura sin cliente
- ✅ No puedes agregar ítem sin descripción/precio

---

## ⚠️ Lo que está a MEDIO camino

### Backend OK, Frontend NO

Estos módulos tienen backend completamente funcional pero el frontend aún no está implementado:

```
- ❌ Cobranza (Email/WhatsApp/SMS automático)
  → Backend: completamente hecho
  → Frontend: UI no existe (/dashboard/cobranza VACÍO)

- ❌ Gastos + IVA
  → Backend: completamente hecho
  → Frontend: UI no existe (/dashboard/gastos VACÍO)

- ❌ Flujo de Caja (Proyecciones 30/60/90)
  → Backend: completamente hecho  
  → Frontend: UI no existe (/dashboard/flujo-caja VACÍO)

- ❌ SII (Certs, CAF, configuración)
  → Backend: completamente hecho
  → Frontend: UI no existe (/dashboard/sii VACÍO)
  → Pero: Emisión/firma/envío de facturas SÍ funciona (se hace automático)

- ❌ Notificaciones Push
  → Backend: completamente hecho
  → Frontend: UI no existe

- ❌ Dashboard (KPIs)
  → Backend: completamente hecho
  → Frontend: página vacía
```

---

## ❌ Lo que NO funciona

### Falta completamente

```
- ❌ Campo \"Límite de crédito\" en clientes
- ❌ Desactivar/Reactivar clientes (botones 3 puntos)
- ❌ Página de perfil del cliente
- ❌ \"Emitir Ahora\" durante creación de factura
- ❌ Todo el módulo Gastos (UI)
- ❌ Todo el módulo Cobranza (UI)
- ❌ Dashboard de métricas  
- ❌ Flujo de caja
- ❌ SII (configuración UI)
- ❌ Notificaciones
- ❌ Suscripciones
- ❌ Multi-usuario
```

---

## 🔍 Casos de Prueba que SÍ puedes hacer AHORA

### Caso 1: Crear cliente → Crear factura → Emitir → Enviar SII

**Requisitos:** Ninguno (excepto cert .p12 para el paso SII)

```
Tiempo: 5 minutos
Resultado: Factura emitida, creada en BD, posiblemente enviada al SII (si tienes cert)
```

**Pasos:**

```
1. Clientes: Crear nuevo cliente "Demo SpA" RUT 80.000.000-0
2. Facturas: Nueva factura para ese cliente
   - Tipo: Factura Electrónica
   - Agregar 1 ítem: "Servicio demo" · 1 · $100.000
   - Total: $119.000
3. Clic en \"Crear factura (borrador)\"
4. Click en el folio para abrir detalle
5. Click \"Emitir\" → factura pasa a EMITIDA (con folio asignado)
6. Click \"Enviar al SII\" 
   - Si NO tienes certificado: veras error \"Certificate not found\"
   - Si tienes: se envía (puede tardar 5-30 segundos)
```

---

### Caso 2: Registrar un pago completo

**Requisitos:** Una factura EMITIDA

```
Tiempo: 2 minutos
Resultado: Factura pasa a estado PAGADA

Pasos:
1. Abre una factura EMITIDA
2. Click \"Registrar pago\"
3. Monto: el total completo de la factura
4. Fecha: hoy
5. Método: TRANSFERENCIA
6. Referencia: \"001\"
7. Click \"Registrar\"
8. ✅ Factura pasa a PAGADA
```

---

### Caso 3: Pago en 2 cuotas

**Requisitos:** Una factura EMITIDA con monto > 0

```
Tiempo: 3 minutos
Resultado: Factura en estado PAGO PARCIAL con historial de 2 pagos

Pasos:
1. Abre factura EMITIDA (ej: total $119.000)
2. Click \"Registrar pago\"
3. Monto: $60.000 (primer cuota)
4. Registra
5. Click \"Registrar pago\" de nuevo
6. Monto: $59.000 (segunda cuota)
7. Registra
8. ✅ Factura pasa a PAGADA, puedes ver ambos pagos en el historial
```

---

### Caso 4: Descargar PDF

**Requisitos:** Una factura EMITIDA

```
Tiempo: 1 minuto
Resultado: Descarga PDF de la factura

Pasos:
1. Abre una factura EMITIDA
2. Click \"PDF\" (botón azul en la esquina superior derecha)
3. ✅ Se descarga factura.pdf con todos los detalles
```

---

## 📋 Resultados esperados para screenshots/demos

**BUENO para capturar:**
- ✅ Dashboard (el que sea - está vacío pero visualmente funciona)
- ✅ Tabla de clientes con búsqueda
- ✅ Formulario de crear cliente
- ✅ Tabla de facturas
- ✅ Creación de nueva factura
- ✅ Página de detalle de factura (con todos los botones)
- ✅ Estado de factura en cada paso
- ✅ Modal de registrar pago

**MALO para capturar (aún no implementado):**
- ❌ Cobranza
- ❌ Gastos
- ❌ Flujo de caja
- ❌ SII (configuración)
- ❌ Dashboard con métricas
- ❌ Notificaciones push

---

## Consejos para Probar

1. **Usa datos realistas:**
   - RUTs: 80.000.000-0, 76.123.456-7, 77.999.999-k
   - Nombres: \"Comercial XYZ SpA\", \"Servicios LLC\", \"Retail S.A.\"
   - Emails: use subdominios (.local o .test)

2. **Crea múltiples clientes** para probar búsqueda y filtros

3. **Crea varias facturas** en diferentes estados:
   - DRAFT (sin emitir)
   - ISSUED (emitida, sin enviar SII)
   - SENT (enviada SII, esperando respuesta)
   - PAID (pagada)
   - PARTIAL (pago parcial)
   - OVERDUE (vencida)

4. **Registra múltiples pagos** para probar el flujo de cuotas

5. **Intenta descargar PDF** de diferentes facturas

---

## Reporte de Bugs During Testing

Si encuentras algo roto:

```
Verifica:
1. Consola del navegador (F12) - ¿hay errores JavaScript?
2. Terminal del Backend - ¿hay errores en logs?
3. Base de datos - ¿los datos se guardaron?
   → Via: npm run db:studio
4. Token expirado - ¿necesitas login?

Reporta con:
- Pasos exactos para reproducir
- Screenshot o video
- Mensaje de error (si hay)
- Navegador y OS
```

---

*Guía actualizada: 13/04/2026*
