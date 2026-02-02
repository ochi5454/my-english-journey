export type Recipient = {
  groupKey: string;
  email: string;
};

export type ExportFile = {
  filePath: string;
  groupKey: string;
  rowCount: number;
};

export type AttachmentTask = {
  groupKey: string;
  filePath: string;
  recipients: Recipient[];
  rowCount: number;
};

export type Plan = {
  runDate: string;
  tasks: AttachmentTask[];
  warnings: string[];
};

export type SendStatus = 'sent' | 'failed' | 'skipped';

export type SendResult = {
  email: string;
  status: SendStatus;
  reason?: string;
  task: {
    groupKey: string;
    filePath: string;
  };
};

export type Preview = {
  runDate: string;
  summary: {
    totalTasks: number;
    totalRecipients: number;
  };
  warnings: string[];
  tasks: Array<{
    groupKey: string;
    filePath: string;
    recipients: number;
    rowCount: number;
  }>;
};
