import { TripCard } from 'nomadu';

const trip = (id: number, city: string, country: string, cc: string, start: string, end: string | null, days: number) => ({
  id, city, country, country_code: cc, latitude: null, longitude: null,
  start_date: start, end_date: end, days, sync_id: null, updated_at: null, deleted: 0,
});

export const Timeline = () => (
  <div style={{ width: 380, background: '#F8F9FA', padding: '8px 0' }}>
    <TripCard trip={trip(3, 'Chiang Mai', 'Thailand', 'TH', '2026-04-14', null, 12)} />
    <TripCard trip={trip(2, 'Lisbon', 'Portugal', 'PT', '2026-03-03', '2026-03-09', 7)} />
    <TripCard trip={trip(1, 'Mexico City', 'Mexico', 'MX', '2026-01-10', '2026-02-02', 24)} hasOverlap />
  </div>
);

export const Compact = () => (
  <div style={{ width: 380, background: '#F8F9FA', padding: '8px 0' }}>
    <TripCard compact trip={trip(5, 'Kyoto', 'Japan', 'JP', '2025-11-02', '2025-11-06', 5)} />
    <TripCard compact trip={trip(4, 'Osaka', 'Japan', 'JP', '2025-10-28', '2025-11-01', 5)} />
  </div>
);
