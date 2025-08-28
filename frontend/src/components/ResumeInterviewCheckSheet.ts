type FocusTag = { id: string; label: string };

export type TitleOption = {
  value: string;
  label: string;
  order?: number;
};

export type Division = string;

export type HiringDecision = {
  value: string;
  label: string;
  emoji?: string;
};

export interface QualitativeItem {
  key: string;
  label: string;
  placeholder: string;
}

export interface QuantitativeItem {
  key: string;
  label: string;
  hint?: string;
  commentPlaceholder: string;
  rubrics: string[];
  levels: { value: number; label: string }[];
}

export interface ConfigResponse {
  divisions: Division[];
  hiringDecisions: HiringDecision[];
  titleOptions: TitleOption[];
  qualitativeItems: QualitativeItem[];
  quantitativeItems: QuantitativeItem[];
  focusTags: FocusTag[];
}
