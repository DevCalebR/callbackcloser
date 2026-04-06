import process from 'node:process';

import { PrismaClient } from '@prisma/client';

import { runProviderPreflight } from '../lib/provider-preflight.ts';
import { loadLocalEnvFiles } from './load-env.ts';

async function main() {
  const loadedFiles = loadLocalEnvFiles();
  const prisma = new PrismaClient();

  try {
    const report = await runProviderPreflight(async () => {
      await prisma.$queryRaw`SELECT 1`;
    });

    console.log('CallbackCloser provider preflight');
    console.log(`- Loaded env files: ${loadedFiles.join(', ') || '(none)'}`);
    console.log('');

    for (const check of report.checks) {
      console.log(`[${check.status}] ${check.title}`);
      for (const detail of check.details) {
        console.log(`  - ${detail}`);
      }
      if (check.status === 'FAIL') {
        for (const fix of check.fixes) {
          console.log(`  - Fix: ${fix}`);
        }
      }
      console.log('');
    }

    const passedCount = report.checks.length - report.failedCount;
    console.log(`Overall: ${report.passed ? 'PASS' : 'FAIL'} (${passedCount}/${report.checks.length} checks passed)`);

    if (!report.passed) {
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

await main();
