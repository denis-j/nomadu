import { UpdateBanner } from 'nomadu';

export const Visible = () => (
  <div style={{ position: 'relative', width: 390, height: 160, background: '#F8F9FA', borderRadius: 16, overflow: 'hidden' }}>
    <UpdateBanner visible onApply={() => {}} />
  </div>
);
