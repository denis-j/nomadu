import { CountryPicker } from 'nomadu';

export const Popular = () => (
  <div style={{ width: 360, height: 420, overflow: 'auto' }}>
    <CountryPicker query="" onSelect={() => {}} />
  </div>
);

export const Search = () => (
  <div style={{ width: 360, height: 260, overflow: 'auto' }}>
    <CountryPicker query="por" onSelect={() => {}} />
  </div>
);
