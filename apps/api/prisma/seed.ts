/**
 * apps/api/prisma/seed.ts
 *
 * Seed script for populating test data.
 * 
 * Populates:
 * - 3 demo tenants (PymEs)
 * - 10 clients per tenant
 * - 50 invoices per tenant (various statuses)
 * - 30 expenses per tenant
 * - Cash flow entries
 *
 * Run: npm run seed (after configuring scripts in package.json)
 * Manual run: npx tsx prisma/seed.ts
 */

import { PrismaClient, InvoiceStatus, SiiStatus } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

/** Configuration for seed data */
const SEED_CONFIG = {
  tenantsCount: 3,
  clientsPerTenant: 10,
  invoicesPerTenant: 50,
  expensesPerTenant: 30,
};

/** Mock data generators */
function generateRut(): string {
  // Format: XX.XXX.XXX-K (Chilean RUT)
  const num = Math.floor(100000000 + Math.random() * 900000000);
  const verifier = Math.floor(Math.random() * 10); // Simplified
  return `${Math.floor(num / 1000000)}.${Math.floor((num % 1000000) / 1000)}.${num % 1000}-${verifier}`;
}

function generateEmail(name: string): string {
  return `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`;
}

function randomAmount(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function randomDate(daysBack: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysBack));
  return date;
}

async function main() {
  console.log("🌱 Starting seed...");

  // Clear existing data (in reverse dependency order)
  await prisma.auditLog.deleteMany({});
  await prisma.notificationLog.deleteMany({});
  await prisma.cashflowEntry.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.invoiceItem.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.collectionLog.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.cafRange.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.tenant.deleteMany({});

  console.log("✓ Cleared existing data");

  // ═════════════════════════════════════════════════════════════════════════
  // STEP 1: Create tenants
  // ═════════════════════════════════════════════════════════════════════════

  const tenants = [];
  const tenantNames = [
    "Constructora Norte SpA",
    "TechSOlutions LTDA",
    "Comercial Sur & Cía",
  ];

  for (let i = 0; i < SEED_CONFIG.tenantsCount; i++) {
    const tenant = await prisma.tenant.create({
      data: {
        name: tenantNames[i],
        rut: generateRut(),
        status: "ACTIVE",
      },
    });

    tenants.push(tenant);
    console.log(`✓ Created tenant: ${tenant.name} (${tenant.id})`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // STEP 2: Create users per tenant
  // ═════════════════════════════════════════════════════════════════════════

  const users = [];

  for (const tenant of tenants) {
    const user = await prisma.user.create({
      data: {
        email: `admin@${tenant.name.toLowerCase().replace(/\s+/g, "-")}.cl`,
        password: "hashed_password_here", // In real app, use bcrypt
        name: "Admin User",
        tenantId: tenant.id,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });

    users.push(user);
    console.log(`✓ Created user for ${tenant.name}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // STEP 3: Create subscriptions
  // ═════════════════════════════════════════════════════════════════════════

  for (const tenant of tenants) {
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        plan: "PROFESSIONAL",
        status: "ACTIVE",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        stripeSubscriptionId: `sub_test_${crypto.randomBytes(8).toString("hex")}`,
      },
    });

    console.log(`✓ Created subscription for ${tenant.name}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // STEP 4: Create CAF ranges (required for invoice emission)
  // ═════════════════════════════════════════════════════════════════════════

  const cafRanges = [];

  for (const tenant of tenants) {
    const cafRange = await prisma.cafRange.create({
      data: {
        tenantId: tenant.id,
        documentType: "FACTURA",
        rangeStart: 1,
        rangeEnd: 1000,
        rangeAvailable: 1000,
        rangeUsed: 0,
        status: "ACTIVE",
        authorityRut: "60803000-K", // SII's RUT
        authorizedUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });

    cafRanges.push(cafRange);
    console.log(`✓ Created CAF range for ${tenant.name}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // STEP 5: Create clients per tenant
  // ═════════════════════════════════════════════════════════════════════════

  const clients: Record<string, typeof prisma.client[]> = {};

  const clientNames = [
    "Empresa ABC",
    "Servicios XYZ",
    "Consultora DEF",
    "Retail GHI",
    "Industria JKL",
    "Hospital MNO",
    "Municipalidad PQR",
    "Universidad STU",
    "Farmacia VWX",
    "Constructora YZA",
  ];

  for (const tenant of tenants) {
    clients[tenant.id] = [];

    for (let i = 0; i < SEED_CONFIG.clientsPerTenant; i++) {
      const clientName = clientNames[i % clientNames.length];

      const client = await prisma.client.create({
        data: {
          tenantId: tenant.id,
          name: `${clientName} ${i + 1}`,
          rut: generateRut(),
          email: generateEmail(`${clientName} ${i + 1}`),
          phone: `+56912345${String(i).padStart(3, "0")}`,
          address: `Calle ${i + 1}, Departamento 100, Santiago`,
          city: "Santiago",
          region: "Metropolitana",
          country: "Chile",
          creditLimit: randomAmount(500000, 5000000),
          paymentTerms: randomAmount(7, 60), // Days
          status: Math.random() > 0.1 ? "ACTIVE" : "INACTIVE",
        },
      });

      clients[tenant.id].push(client);
    }

    console.log(`✓ Created ${SEED_CONFIG.clientsPerTenant} clients for ${tenant.name}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // STEP 6: Create invoices per tenant
  // ═════════════════════════════════════════════════════════════════════════

  const invoiceStatuses: InvoiceStatus[] = [
    "DRAFT",
    "ISSUED",
    "RECEIVED",
    "PAID",
    "CANCELLED",
  ];
  const siiStatuses: SiiStatus[] = ["PENDING", "ACCEPTED", "REJECTED", "CLAIMED"];

  for (const tenant of tenants) {
    for (let i = 0; i < SEED_CONFIG.invoicesPerTenant; i++) {
      const client = clients[tenant.id][i % clients[tenant.id].length];
      const status = invoiceStatuses[i % invoiceStatuses.length];
      const siiStatus = siiStatuses[Math.floor(Math.random() * siiStatuses.length)];
      const emissionDate = randomDate(90);
      const dueDate = new Date(emissionDate);
      dueDate.setDate(dueDate.getDate() + randomAmount(15, 60));

      // Create invoice
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: tenant.id,
          clientId: client.id,
          folio: i + 1,
          emissionDate,
          dueDate,
          status,
          siiStatus: status === "DRAFT" ? "PENDING" : siiStatus,
          externalReference: `REF-${i + 1}`,
          notes: `Invoice #${i + 1} - Testing`,
          items: {
            create: [
              {
                description: "Service A",
                quantity: randomAmount(1, 10),
                unitPrice: randomAmount(10000, 100000),
                taxPercentage: 19,
              },
              {
                description: "Product B",
                quantity: randomAmount(1, 5),
                unitPrice: randomAmount(50000, 200000),
                taxPercentage: 19,
              },
            ],
          },
        },
        include: { items: true },
      });

      // Calculate totals
      const totalNet = invoice.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0
      );
      const totalTax = Math.round(totalNet * 0.19);
      const totalAmount = totalNet + totalTax;

      // Update invoice with calculated amounts
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          subtotal: totalNet,
          tax: totalTax,
          total: totalAmount,
        },
      });

      // Create payment if invoice is PAID or RECEIVED
      if (status === "PAID" || status === "RECEIVED") {
        const paymentDate = new Date(emissionDate);
        paymentDate.setDate(
          paymentDate.getDate() + randomAmount(1, Math.max(1, dueDate.getDate() - emissionDate.getDate()))
        );

        await prisma.payment.create({
          data: {
            tenantId: tenant.id,
            invoiceId: invoice.id,
            amount: status === "PAID" ? totalAmount : randomAmount(totalAmount * 0.5, totalAmount * 0.9),
            method: ["TRANSFER", "CASH", "CREDIT_CARD"][Math.floor(Math.random() * 3)] as any,
            date: paymentDate,
            referenceNumber: `PAY-${i + 1}`,
          },
        });
      }
    }

    console.log(`✓ Created ${SEED_CONFIG.invoicesPerTenant} invoices for ${tenant.name}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // STEP 7: Create expenses per tenant
  // ═════════════════════════════════════════════════════════════════════════

  const expenseCategories = [
    "ARRIENDO",
    "SERVICIOS",
    "PROVEEDORES",
    "NOMINA",
    "TRANSPORTE",
  ];

  for (const tenant of tenants) {
    for (let i = 0; i < SEED_CONFIG.expensesPerTenant; i++) {
      await prisma.expense.create({
        data: {
          tenantId: tenant.id,
          description: `Expense ${i + 1}`,
          amount: randomAmount(50000, 500000),
          category: expenseCategories[i % expenseCategories.length],
          date: randomDate(90),
          paymentMethod: "TRANSFER",
          referenceNumber: `EXP-${i + 1}`,
          status: Math.random() > 0.2 ? "PAID" : "PENDING",
        },
      });
    }

    console.log(`✓ Created ${SEED_CONFIG.expensesPerTenant} expenses for ${tenant.name}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // STEP 8: Create cash flow entries (aggregated)
  // ═════════════════════════════════════════════════════════════════════════

  for (const tenant of tenants) {
    // Income from invoices
    const invoices = await prisma.invoice.findMany({
      where: { tenantId: tenant.id, status: "PAID" },
    });

    for (const invoice of invoices.slice(0, 10)) {
      await prisma.cashflowEntry.create({
        data: {
          tenantId: tenant.id,
          date: invoice.emissionDate,
          type: "INCOME",
          description: `Invoice #${invoice.folio}`,
          amount: invoice.total,
          category: "VENTAS",
          relatedEntity: "Invoice",
          relatedEntityId: invoice.id,
        },
      });
    }

    // Expenses
    const expenses = await prisma.expense.findMany({
      where: { tenantId: tenant.id, status: "PAID" },
    });

    for (const expense of expenses.slice(0, 10)) {
      await prisma.cashflowEntry.create({
        data: {
          tenantId: tenant.id,
          date: expense.date,
          type: "EXPENSE",
          description: expense.description,
          amount: expense.amount,
          category: expense.category,
          relatedEntity: "Expense",
          relatedEntityId: expense.id,
        },
      });
    }
  }

  console.log(`✓ Created cash flow entries for all tenants`);

  // ═════════════════════════════════════════════════════════════════════════
  // STEP 9: Create notifications
  // ═════════════════════════════════════════════════════════════════════════

  for (const tenant of tenants) {
    await prisma.notificationLog.create({
      data: {
        tenantId: tenant.id,
        type: "INVOICE_CREATED",
        title: "Invoice created",
        message: "You have created a new invoice",
        read: Math.random() > 0.5,
      },
    });
  }

  console.log("✓ Created notifications");

  // ═════════════════════════════════════════════════════════════════════════
  // Summary
  // ═════════════════════════════════════════════════════════════════════════

  console.log("\n✨ Seed completed successfully!\n");
  console.log(`📊 Summary:`);
  console.log(`   Tenants: ${SEED_CONFIG.tenantsCount}`);
  console.log(`   Clients per tenant: ${SEED_CONFIG.clientsPerTenant}`);
  console.log(`   Invoices per tenant: ${SEED_CONFIG.invoicesPerTenant}`);
  console.log(`   Expenses per tenant: ${SEED_CONFIG.expensesPerTenant}`);
  console.log(`\n🔐 Demo credentials:`);

  for (const user of users) {
    const tenant = tenants.find((t) => t.id === user.tenantId);
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: hashed_password_here`);
    console.log(`   Tenant: ${tenant?.name}\n`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
