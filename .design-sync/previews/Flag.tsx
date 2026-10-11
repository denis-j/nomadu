import { Flag } from 'nomadu';

const row = { display: 'flex', alignItems: 'center', gap: 12 } as const;

export const Countries = () => (
  <div style={row}>
    {['th', 'br', 'pt', 'mx', 'de', 'vn'].map((c) => <Flag key={c} code={c} />)}
  </div>
);

export const Sizes = () => (
  <div style={row}>
    <Flag code="br" size={16} />
    <Flag code="br" size={22} />
    <Flag code="br" size={32} />
    <Flag code="br" size={32} rounded={false} />
  </div>
);
