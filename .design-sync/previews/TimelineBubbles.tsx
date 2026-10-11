import { TimelineBubbles } from 'nomadu';

export const Default = () => <TimelineBubbles size={70} />;

export const CustomIcons = () => (
  <TimelineBubbles
    size={70}
    variant="none"
    icons={[{ name: 'bed-outline' }, { name: 'airplane', color: '#4DC1FF' }, { name: 'restaurant-outline' }]}
  />
);
