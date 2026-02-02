import { AttachmentTask, ExportFile, Plan, Recipient } from '../types.js';

export const buildPlan = (runDate: string, exports: ExportFile[], recipients: Recipient[]): Plan => {
  const warnings: string[] = [];
  const tasks: AttachmentTask[] = exports.map((file) => {
    const matched = recipients.filter((r) => r.groupKey === file.groupKey);
    if (!matched.length) {
      warnings.push(`No recipients found for group "${file.groupKey}" (${file.filePath})`);
    }
    return {
      groupKey: file.groupKey,
      filePath: file.filePath,
      recipients: matched,
      rowCount: file.rowCount,
    };
  });

  return {
    runDate,
    tasks,
    warnings,
  };
};
