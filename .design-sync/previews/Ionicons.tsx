import { Ionicons, Colors } from 'nomadu';

const names = ['airplane', 'train-outline', 'car-outline', 'bed-outline', 'map-outline', 'earth', 'calendar-outline', 'sparkles', 'document-text-outline', 'wallet-outline'] as const;

export const Common = () => (
  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', width: 320 }}>
    {names.map((n) => <Ionicons key={n} name={n} size={24} color={Colors.text} />)}
  </div>
);

export const Colored = () => (
  <div style={{ display: 'flex', gap: 14 }}>
    <Ionicons name="checkmark-circle" size={28} color={Colors.success} />
    <Ionicons name="warning" size={28} color={Colors.warning} />
    <Ionicons name="close-circle" size={28} color={Colors.error} />
    <Ionicons name="heart" size={28} color={Colors.accent} />
  </div>
);
