import { PillRow } from './PillRow';
import type { YearFilter } from '../lib/yearFilter';

interface YearPickerProps {
  /** Available years to choose from (newest first). */
  years: number[];
  value: YearFilter;
  onChange: (next: YearFilter) => void;
  /** Hide the "All Time" pill when you only want concrete years (e.g. tax). */
  includeAllTime?: boolean;
}

/**
 * Pill row at the top of stats-style screens to scope data to a single
 * calendar year (or "All Time"). The pills themselves are the shared PillRow.
 */
export function YearPicker({ years, value, onChange, includeAllTime = true }: YearPickerProps) {
  const options = [
    ...(includeAllTime ? [{ label: 'All Time', year: null as YearFilter }] : []),
    ...years.map((y) => ({ label: String(y), year: y as YearFilter })),
  ];

  return (
    <PillRow
      tabular
      options={options.map((opt) => ({
        key: opt.label,
        label: opt.label,
        active: opt.year === value,
        onPress: () => onChange(opt.year),
      }))}
    />
  );
}
