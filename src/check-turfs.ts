import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Querying database for turfs with lat = 0 and lng = 0...');
  
  const brokenTurfs = await prisma.turf.findMany({
    where: {
      lat: 0,
      lng: 0,
    },
    select: {
      id: true,
      name: true,
      lat: true,
      lng: true,
    },
  });

  console.log(`Found ${brokenTurfs.length} turfs with broken coordinates (0,0):`);
  console.log(JSON.stringify(brokenTurfs, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
