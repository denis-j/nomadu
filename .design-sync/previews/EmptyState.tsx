import { EmptyState } from 'nomadu';

export const NoPlans = () => (
  <div style={{ height: 320, display: 'flex' }}>
    <EmptyState
      icon="🗺️"
      title="No plans yet"
      subtitle="Sketch your next trip: add stops, dates and how you get between them."
    />
  </div>
);

export const NoDocuments = () => (
  <div style={{ height: 320, display: 'flex' }}>
    <EmptyState
      icon="🛂"
      title="No documents"
      subtitle="Add your passport and visas to get reminders before they expire."
    />
  </div>
);
