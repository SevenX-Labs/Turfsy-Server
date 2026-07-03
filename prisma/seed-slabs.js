const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
require('dotenv/config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding Platform Fee Slabs...');

  const slabs = [
    { minAmount: 0, maxAmount: 1000, platformFee: 50, isActive: true },
    { minAmount: 1001, maxAmount: 2000, platformFee: 100, isActive: true },
    { minAmount: 2001, maxAmount: 3000, platformFee: 150, isActive: true },
    { minAmount: 3001, maxAmount: 4000, platformFee: 200, isActive: true },
    { minAmount: 4001, maxAmount: 5000, platformFee: 250, isActive: true },
  ];

  // Clean existing slabs first to avoid duplicates
  await prisma.platformFeeSlab.deleteMany({});

  for (const slab of slabs) {
    await prisma.platformFeeSlab.create({
      data: slab,
    });
  }

  console.log('✅ Successfully seeded Platform Fee Slabs!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
