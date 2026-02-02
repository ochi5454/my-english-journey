#!/usr/bin/env tsx
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import path from 'node:path';
import { loadConfig } from '../config/index.js';
import { resolveOutputPath } from './helpers.js';
import { readJson, writeJson } from '../utils/fs.js';
import { Plan, SendResult } from '../types.js';
import { buildResendPlan } from '../core/resend.js';
import { sendPlan } from '../core/mailer.js';
import { logger } from '../logger.js';
import { normalizeDate } from '../utils/date.js';

const argv = yargs(hideBin(process.argv))
  .option('date', { type: 'string', demandOption: true, describe: 'Run date (YYYY-MM-DD)' })
  .option('output', { type: 'string', describe: 'Output base directory' })
  .option('dry-run', { type: 'boolean', describe: 'Override DRY_RUN setting' })
  .option('rate', { type: 'number', describe: 'Override RATE_LIMIT_PER_MIN' })
  .help()
  .parseSync();

const main = async () => {
  const baseConfig = loadConfig();
  const runDate = normalizeDate(argv.date);
  const outputBase = argv.output ?? baseConfig.OUTPUT_DIR;
  const outDir = resolveOutputPath(outputBase, runDate);

  const planPath = path.join(outDir, 'plan.json');
  const resultPath = path.join(outDir, 'send_result.json');

  const plan = readJson<Plan>(planPath);
  const previous = readJson<SendResult[]>(resultPath);
  const failed = previous.filter((r) => r.status === 'failed');

  if (!failed.length) {
    console.log('No failed entries to resend.');
    return;
  }

  const resendPlan = buildResendPlan(plan, failed);
  const effectiveConfig = {
    ...baseConfig,
    DRY_RUN: argv['dry-run'] ?? baseConfig.DRY_RUN,
    RATE_LIMIT_PER_MIN: argv.rate ?? baseConfig.RATE_LIMIT_PER_MIN,
  };

  const results = await sendPlan(resendPlan, effectiveConfig);
  writeJson(path.join(outDir, 'resend_result.json'), results);

  const summary = results.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  logger.info({ summary, outDir }, 'resend completed');
};

main();
