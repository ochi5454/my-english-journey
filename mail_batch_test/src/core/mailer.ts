import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import Bottleneck from 'bottleneck';
import { AppConfig } from '../config/index.js';
import { Plan, SendResult } from '../types.js';
import { formatJapaneseDate } from '../utils/date.js';
import { logger } from '../logger.js';

const buildSubject = (runDate: string) => `${formatJapaneseDate(runDate)}現在_実所定外時間`;

const buildBody = (runDate: string, groupKey: string) =>
  [
    'お疲れ様です。',
    `${groupKey}の皆様、`,
    '',
    `${formatJapaneseDate(runDate)}現在の実所定外時間を送付いたします。（対象：${groupKey}）`,
    '添付ファイルをご確認ください。',
  ].join('\n');

const createTransport = (config: AppConfig) => {
  if (config.MAIL_TRANSPORT === 'GRAPH') {
    throw new Error('Graph transport is not implemented yet.');
  }
  if (!config.SMTP_HOST) throw new Error('SMTP_HOST is required for SMTP transport');
  if (!config.FROM_ADDRESS) throw new Error('FROM_ADDRESS is required');

  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER
      ? {
          user: config.SMTP_USER,
          pass: config.SMTP_PASS,
        }
      : undefined,
  });
};

export const sendPlan = async (plan: Plan, config: AppConfig): Promise<SendResult[]> => {
  const results: SendResult[] = [];

  const rate = config.RATE_LIMIT_PER_MIN;
  const minTime = Math.ceil(60000 / Math.max(rate, 1));
  const limiter = new Bottleneck({ minTime });

  const transport = config.DRY_RUN ? null : createTransport(config);

  for (const task of plan.tasks) {
    if (!task.recipients.length) {
      results.push({
        email: '',
        status: 'skipped',
        reason: 'no recipients',
        task: { groupKey: task.groupKey, filePath: task.filePath },
      });
      continue;
    }

    if (!fs.existsSync(task.filePath)) {
      results.push({
        email: '',
        status: 'failed',
        reason: `attachment missing: ${task.filePath}`,
        task: { groupKey: task.groupKey, filePath: task.filePath },
      });
      continue;
    }

    for (const recipient of task.recipients) {
      const job = async () => {
        if (config.DRY_RUN) {
          logger.info({ to: recipient.email, group: task.groupKey }, 'DRY_RUN mail skipped');
          return <SendResult>{
            email: recipient.email,
            status: 'skipped',
            reason: 'DRY_RUN',
            task: { groupKey: task.groupKey, filePath: task.filePath },
          };
        }

        try {
          await transport!.sendMail({
            from: config.FROM_ADDRESS,
            to: recipient.email,
            subject: buildSubject(plan.runDate),
            text: buildBody(plan.runDate, task.groupKey),
            attachments: [
              {
                filename: path.basename(task.filePath),
                path: task.filePath,
              },
            ],
          });
          logger.info({ to: recipient.email, group: task.groupKey }, 'Mail sent');
          return <SendResult>{
            email: recipient.email,
            status: 'sent',
            task: { groupKey: task.groupKey, filePath: task.filePath },
          };
        } catch (err: any) {
          logger.error({ err, to: recipient.email, group: task.groupKey }, 'Mail send failed');
          return <SendResult>{
            email: recipient.email,
            status: 'failed',
            reason: err?.message ?? 'unknown error',
            task: { groupKey: task.groupKey, filePath: task.filePath },
          };
        }
      };

      const result = await limiter.schedule(job);
      results.push(result);
    }
  }

  return results;
};
