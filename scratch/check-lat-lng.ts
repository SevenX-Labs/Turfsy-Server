import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const turfId = 'd385c135-7a33-4c67-9cc8-6a6e1f5b7da3';
  const turf = await prisma.turf.findUnique({
    where: { id: turfId },
    select: {
      id: true,
      name: true,
      lat: true,
      lng: true,
    },
  });
  console.log('Turf data from DB:', JSON.stringify(turf, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
