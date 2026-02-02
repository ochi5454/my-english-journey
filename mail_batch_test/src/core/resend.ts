import { Plan, SendResult } from '../types.js';

export const buildResendPlan = (plan: Plan, failed: SendResult[]): Plan => {
  const wanted = failed.filter((r) => r.status === 'failed');
  const map = new Map<string, Set<string>>();

  for (const item of wanted) {
    const key = `${item.task.groupKey}::${item.task.filePath}`;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(item.email);
  }

  const tasks = plan.tasks
    .map((task) => {
      const key = `${task.groupKey}::${task.filePath}`;
      const emails = map.get(key);
      if (!emails) return null;
      const recipients = task.recipients.filter((r) => emails.has(r.email));
      return { ...task, recipients };
    })
    .filter((t): t is NonNullable<typeof t> => !!t);

  return {
    runDate: plan.runDate,
    tasks,
    warnings: [],
  };
};
