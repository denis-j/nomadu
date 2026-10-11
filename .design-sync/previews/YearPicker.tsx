import { YearPicker } from 'nomadu';

export const AllTime = () => (
  <div style={{ width: 420 }}>
    <YearPicker years={[2026, 2025, 2024, 2023]} value={null} onChange={() => {}} />
  </div>
);

export const YearSelected = () => (
  <div style={{ width: 420 }}>
    <YearPicker years={[2026, 2025, 2024]} value={2025} onChange={() => {}} includeAllTime={false} />
  </div>
);
