export interface VisualIndexEntry {
  id: string;
  type?: string;
  tags?: string[];
}
export function isVisualEntry(entry: VisualIndexEntry): boolean;
export function visualEntries<T extends VisualIndexEntry>(entries: Record<string, T>): T[];
export const PAGE_BASELINE_IDS: string[];
