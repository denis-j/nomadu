import { CloudyButton, Ionicons, Colors } from 'nomadu';

// The primary CTA. Children are the label; center them with innerStyle.
const label = { fontSize: 17, fontWeight: 700, color: Colors.cloudyButtonText } as const;
const row = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 } as const;
const surface = { width: 380, padding: 20, background: Colors.background, borderRadius: 16 } as const;

export const WithIcon = () => (
  <div style={surface}>
    <CloudyButton onPress={() => {}}>
      <div style={row}>
        <Ionicons name="sparkles" size={22} color={Colors.cloudyButtonText} />
        <span style={label}>Import from screenshots</span>
      </div>
    </CloudyButton>
  </div>
);

export const Compact = () => (
  <div style={surface}>
    <CloudyButton compact onPress={() => {}} innerStyle={{ justifyContent: 'center' }}>
      <span style={label}>Come along</span>
    </CloudyButton>
  </div>
);

export const Disabled = () => (
  <div style={surface}>
    <CloudyButton disabled onPress={() => {}} style={{ opacity: 0.5 }} innerStyle={{ justifyContent: 'center' }}>
      <span style={label}>Continue</span>
    </CloudyButton>
  </div>
);
