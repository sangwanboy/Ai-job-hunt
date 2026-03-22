import { prisma } from '../src/lib/db';

async function run() {
  try {
    const agents = await prisma.agent.findMany({
      select: { id: true, key: true, name: true, userId: true }
    });
    console.log('Agents in DB:', JSON.stringify(agents, null, 2));

    const users = await prisma.user.findMany({
      select: { id: true, email: true }
    });
    console.log('Users in DB:', JSON.stringify(users, null, 2));

    const sessions = await prisma.chatSession.findMany({
      take: 20,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, agentId: true, userId: true, title: true, updatedAt: true }
    });
    console.log('Recent 20 Sessions in DB:', JSON.stringify(sessions, null, 2));
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
