import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const turfs = await prisma.turf.findMany({
      take: 5
    });
    console.log('Turfs found:', JSON.stringify(turfs, null, 2));
    
    const count = await prisma.turf.count();
    console.log('Total turfs:', count);
    
    const activeCount = await prisma.turf.count({
      where: { status: 'ACTIVE' } as any
    });
    console.log('Active turfs:', activeCount);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
