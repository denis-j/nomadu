import { GuideCard } from 'nomadu';
import { GUIDES } from '../../constants/guides';

export const Row = () => (
  <div style={{ display: 'flex', gap: 12 }}>
    {GUIDES.slice(0, 3).map((g) => <GuideCard key={g.id} guide={g} onPress={() => {}} />)}
  </div>
);
