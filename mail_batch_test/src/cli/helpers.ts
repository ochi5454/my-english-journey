import path from 'node:path';
import { buildPlan } from '../core/planner.js';
import { loadExportFiles } from '../io/exports.js';
import { loadRecipients } from '../io/recipients.js';
import { normalizeDate } from '../utils/date.js';
import { ensureDir } from '../utils/fs.js';
import { Plan } from '../types.js';

export const createPlan = (dateInput: string, recipientsPath: string, exportsRoot: string): Plan => {
  const runDate = normalizeDate(dateInput);
  const recipients = loadRecipients(recipientsPath);
  const exportsDir = path.join(exportsRoot, runDate);
  const exportFiles = loadExportFiles(exportsDir);
  return buildPlan(runDate, exportFiles, recipients);
};

export const resolveOutputPath = (baseOutput: string, runDate: string): string => {
  const dir = path.join(baseOutput, runDate);
  ensureDir(dir);
  return dir;
};
