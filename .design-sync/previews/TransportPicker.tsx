import { TransportPicker } from 'nomadu';

export const Flight = () => (
  <div style={{ width: 380 }}>
    <TransportPicker value="flight" onChange={() => {}} />
  </div>
);

export const Train = () => (
  <div style={{ width: 380 }}>
    <TransportPicker value="train" onChange={() => {}} />
  </div>
);
