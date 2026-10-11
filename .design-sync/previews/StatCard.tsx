import { StatCard, Colors } from 'nomadu';

export const Grid = () => (
  <div style={{ width: 360, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
    <StatCard value={23} label="Countries" icon="earth" accent={Colors.accent} />
    <StatCard value={187} label="Days abroad" icon="calendar-outline" accent={Colors.cloudyBlue} />
    <StatCard value={64} label="Cities" icon="business-outline" />
    <StatCard value="41%" label="Of the world" icon="globe-outline" accent={Colors.success} />
  </div>
);

export const Large = () => (
  <div style={{ width: 360 }}>
    <StatCard large value={23} label="Countries visited" icon="earth" accent={Colors.accent} />
  </div>
);
