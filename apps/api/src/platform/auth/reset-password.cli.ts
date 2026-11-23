/**
 * Prints a one-time link to set a new password for the account with this email: how a forgotten
 * password is reset on a server that sends no email. On the server, in /opt/workbench:
 *
 *   docker compose exec api node dist/platform/auth/reset-password.cli.js you@example.com
 *
 * The link works once, for 30 minutes; opening a newer one replaces it. Every session ends when it
 * is used. Plain imports only: this runs outside the Nest app (no path aliases).
 */
import { PrismaClient } from '@prisma/client';
import { createResetLink, RESET_MINUTES } from './reset-links';

async function main(): Promise<number> {
  const email = process.argv[2]?.trim();
  if (!email) {
    console.error('usage: node dist/platform/auth/reset-password.cli.js <email>');
    return 2;
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      console.error(`No account has the email ${email}.`);
      return 1;
    }
    const { link, expiresAt } = await createResetLink(prisma, user.id);
    console.log(`Open this link to set a new password for ${email}. It works once, for ${RESET_MINUTES} minutes (until ${expiresAt.toISOString()}):`);
    console.log(link);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
