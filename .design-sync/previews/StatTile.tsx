import { StatTile, StatRow } from 'nomadu';

export const TripFacts = () => (
  <div style={{ width: 380 }}>
    <StatRow>
      <StatTile label="Duration" value="14" unit="days" />
      <StatTile label="Stops" value="5" />
      <StatTile label="Starts" value="Mar 3" />
    </StatRow>
  </div>
);

export const WithIcon = () => (
  <div style={{ width: 380 }}>
    <StatRow>
      <StatTile label="Route" value="21" unit="days" icon="map-outline" />
      <StatTile label="Budget" value="€2,400" icon="wallet-outline" />
    </StatRow>
  </div>
);

export const Pressable = () => (
  <div style={{ width: 380 }}>
    <StatRow>
      <StatTile label="Check-in" value="Jun 12" />
      <StatTile label="Nights" value="4" />
      <StatTile label="Status" value="Paid" onPress={() => {}} />
    </StatRow>
  </div>
);
