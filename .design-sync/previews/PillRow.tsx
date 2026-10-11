import { PillRow } from 'nomadu';

const noop = () => {};

export const Filters = () => (
  <div style={{ width: 420 }}>
    <PillRow
      options={[
        { key: 'all', label: 'All', active: true, onPress: noop },
        { key: 'trips', label: 'Trips', icon: 'airplane', onPress: noop },
        { key: 'stays', label: 'Stays', icon: 'bed-outline', onPress: noop },
        { key: 'docs', label: 'Documents', icon: 'document-text-outline', onPress: noop },
      ]}
    />
  </div>
);

export const Tabular = () => (
  <div style={{ width: 420 }}>
    <PillRow
      tabular
      options={[
        { key: '2026', label: '2026', active: true, onPress: noop },
        { key: '2025', label: '2025', onPress: noop },
        { key: '2024', label: '2024', onPress: noop },
      ]}
    />
  </div>
);
