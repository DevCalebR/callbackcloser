import process from 'node:process';

import { PrismaClient } from '@prisma/client';

import { loadLocalEnvFiles } from './load-env.ts';

async function main() {
  const loadedFiles = loadLocalEnvFiles();
  const prisma = new PrismaClient();

  try {
    const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    const ok = result[0]?.ok === 1;

    console.log('CallbackCloser DB smoke');
    console.log(`- Loaded env files: ${loadedFiles.join(', ') || '(none)'}`);
    console.log(`- DATABASE_URL present: ${Boolean(process.env.DATABASE_URL?.trim())}`);
    console.log(`- Result: ${ok ? 'PASS' : 'FAIL'} (SELECT 1)`);

    if (!ok) {
      process.exit(1);
    }
  } catch (error) {
    console.error('CallbackCloser DB smoke failed');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

await main();
