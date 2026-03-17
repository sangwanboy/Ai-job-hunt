
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  console.log('Users:', JSON.stringify(users, null, 2));
  
  const agents = await prisma.agent.findMany({ select: { id: true, key: true, userId: true } });
  console.log('Agents:', JSON.stringify(agents, null, 2));
  
  await prisma.$disconnect();
}

check();
