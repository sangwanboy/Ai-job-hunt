import { prisma } from "../src/lib/db";

async function checkSessions() {
  const sessions = await prisma.chatSession.findMany({
    include: {
      messages: true
    }
  });
  console.log("Total sessions:", sessions.length);
  sessions.forEach(s => {
    console.log(`- Session ${s.id}: "${s.title}" (Agent: ${s.agentId}, User: ${s.userId}, Messages: ${s.messages.length})`);
  });
}

checkSessions()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
