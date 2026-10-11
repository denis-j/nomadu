import { StopSummary } from 'nomadu';

export const Stops = () => (
  <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
    <StopSummary city="Lisbon" country="Portugal" start={new Date(2026, 2, 3)} end={new Date(2026, 2, 9)} />
    <StopSummary city="Chiang Mai" country="Thailand" start={new Date(2026, 3, 14)} end={new Date(2026, 4, 2)} />
  </div>
);
