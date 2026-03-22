import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const deleted = await prisma.job.deleteMany({
    where: {
      OR: [
        { title: { contains: '?' } },
        { title: { startsWith: 'status' } },
        { title: { contains: 'applications' } },
        { title: { contains: 'Do I have' } },
      ],
    },
  });
  console.log(`Deleted ${deleted.count} junk entries`);
  await prisma.$disconnect();
}

main().catch(console.error);
