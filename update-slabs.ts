import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();

async function main() {
  console.log('Clearing existing slabs...');
  await prisma.platformFeeSlab.deleteMany({});
  
  const slabs = [
    { minAmount: 0, maxAmount: 1000, platformFee: 49 },
    { minAmount: 1001, maxAmount: 2000, platformFee: 99 },
    { minAmount: 2001, maxAmount: 3000, platformFee: 149 },
    { minAmount: 3001, maxAmount: 4000, platformFee: 199 },
    { minAmount: 4001, maxAmount: 5000, platformFee: 249 },
    { minAmount: 5001, maxAmount: 6000, platformFee: 299 },
    { minAmount: 6001, maxAmount: 7000, platformFee: 349 },
    { minAmount: 7001, maxAmount: 8000, platformFee: 399 },
    { minAmount: 8001, maxAmount: 9000, platformFee: 449 },
    { minAmount: 9001, maxAmount: 10000, platformFee: 499 },
    { minAmount: 10001, maxAmount: 11000, platformFee: 549 },
    { minAmount: 11001, maxAmount: 999999, platformFee: 599 }, // Catch-all for anything above 11k
  ];

  console.log('Inserting new slabs...');
  for (const slab of slabs) {
    await prisma.platformFeeSlab.create({
      data: {
        ...slab,
        isActive: true,
      },
    });
  }
  
  console.log('Slabs updated successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
