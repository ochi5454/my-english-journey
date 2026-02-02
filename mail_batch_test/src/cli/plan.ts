#!/usr/bin/env tsx
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import path from 'node:path';
import { loadConfig } from '../config/index.js';
import { createPlan, resolveOutputPath } from './helpers.js';
import { writeJson } from '../utils/fs.js';
import { logger } from '../logger.js';

const argv = yargs(hideBin(process.argv))
  .option('date', { type: 'string', demandOption: true, describe: 'Run date (YYYY-MM-DD)' })
  .option('recipients', { type: 'string', default: path.join('data', 'recipients.xlsx') })
  .option('exports', { type: 'string', default: 'exports' })
  .option('output', { type: 'string', describe: 'Output base directory' })
  .help()
  .parseSync();

const main = () => {
  const config = loadConfig();
  const plan = createPlan(argv.date, argv.recipients, argv.exports);
  const outputBase = argv.output ?? config.OUTPUT_DIR;
  const outDir = resolveOutputPath(outputBase, plan.runDate);
  const outPath = path.join(outDir, 'plan.json');
  writeJson(outPath, plan);

  logger.info({ outPath, warnings: plan.warnings.length }, 'plan generated');
  if (plan.warnings.length) {
    console.warn('Warnings:');
    for (const w of plan.warnings) console.warn(`- ${w}`);
  }
};

main();
