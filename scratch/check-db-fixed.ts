import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as any);
  const prisma = new PrismaClient({ adapter });
  
  try {
    const turfs = await prisma.turf.findMany({
      take: 5
    });
    console.log('Turfs found:', turfs.length);
    if (turfs.length > 0) {
      console.log('First turf:', JSON.stringify(turfs[0], null, 2));
    }
    
    const count = await prisma.turf.count();
    console.log('Total turfs in DB:', count);
    
    const activeCount = await prisma.turf.count({
      where: { status: 'ACTIVE' }
    });
    console.log('Active turfs in DB:', activeCount);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
