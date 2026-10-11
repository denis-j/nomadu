import { StatTile, StatRow } from 'nomadu';

export const ThreeTiles = () => (
  <div style={{ width: 380 }}>
    <StatRow>
      <StatTile label="Countries" value="12" />
      <StatTile label="Days abroad" value="187" />
      <StatTile label="This year" value="2026" />
    </StatRow>
  </div>
);
