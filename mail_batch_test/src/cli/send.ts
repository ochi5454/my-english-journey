#!/usr/bin/env tsx
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import path from 'node:path';
import { loadConfig } from '../config/index.js';
import { createPlan, resolveOutputPath } from './helpers.js';
import { writeJson } from '../utils/fs.js';
import { sendPlan } from '../core/mailer.js';
import { logger } from '../logger.js';

const argv = yargs(hideBin(process.argv))
  .option('date', { type: 'string', demandOption: true, describe: 'Run date (YYYY-MM-DD)' })
  .option('recipients', { type: 'string', default: path.join('data', 'recipients.xlsx') })
  .option('exports', { type: 'string', default: 'exports' })
  .option('output', { type: 'string', describe: 'Output base directory' })
  .option('dry-run', { type: 'boolean', describe: 'Override DRY_RUN setting' })
  .option('rate', { type: 'number', describe: 'Override RATE_LIMIT_PER_MIN' })
  .help()
  .parseSync();

const main = async () => {
  const baseConfig = loadConfig();
  const plan = createPlan(argv.date, argv.recipients, argv.exports);

  const effectiveConfig = {
    ...baseConfig,
    DRY_RUN: argv['dry-run'] ?? baseConfig.DRY_RUN,
    RATE_LIMIT_PER_MIN: argv.rate ?? baseConfig.RATE_LIMIT_PER_MIN,
  };

  const outputBase = argv.output ?? baseConfig.OUTPUT_DIR;
  const outDir = resolveOutputPath(outputBase, plan.runDate);

  writeJson(path.join(outDir, 'plan.json'), plan);

  const results = await sendPlan(plan, effectiveConfig);
  writeJson(path.join(outDir, 'send_result.json'), results);

  const summary = results.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  logger.info({ summary, outDir }, 'send completed');
  if (plan.warnings.length) {
    console.warn('Warnings during plan:');
    for (const w of plan.warnings) console.warn(`- ${w}`);
  }
};

main();
