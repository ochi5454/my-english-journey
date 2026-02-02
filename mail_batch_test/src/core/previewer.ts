import { Plan, Preview } from '../types.js';

export const buildPreview = (plan: Plan): Preview => {
  const totalRecipients = plan.tasks.reduce((sum, t) => sum + t.recipients.length, 0);
  return {
    runDate: plan.runDate,
    summary: {
      totalTasks: plan.tasks.length,
      totalRecipients,
    },
    warnings: [...plan.warnings],
    tasks: plan.tasks.map((t) => ({
      groupKey: t.groupKey,
      filePath: t.filePath,
      recipients: t.recipients.length,
      rowCount: t.rowCount,
    })),
  };
};
