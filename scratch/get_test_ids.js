
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const turf = await prisma.turf.findFirst();
  const user = await prisma.userAuth.findFirst({
    where: { role: 'USER' }
  });

  console.log('Turf ID:', turf?.id);
  console.log('User Auth ID:', user?.authId);
}

main().catch(console.error).finally(() => prisma.$disconnect());
