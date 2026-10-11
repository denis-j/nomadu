import { GlassPill, Ionicons, Colors } from 'nomadu';

const inner = { display: 'flex', alignItems: 'center', gap: 6 } as const;
const text = (active: boolean) => ({ fontSize: 13, fontWeight: 600, color: active ? Colors.white : Colors.text });

export const States = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    <GlassPill active onPress={() => {}}>
      <div style={inner}><Ionicons name="airplane" size={15} color={Colors.white} /><span style={text(true)}>Flight</span></div>
    </GlassPill>
    <GlassPill onPress={() => {}}>
      <div style={inner}><Ionicons name="train-outline" size={15} color={Colors.text} /><span style={text(false)}>Train</span></div>
    </GlassPill>
  </div>
);

export const AccentTint = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    <GlassPill active activeTint={Colors.accent} onPress={() => {}}>
      <span style={text(true)}>Visited</span>
    </GlassPill>
    <GlassPill onPress={() => {}}>
      <span style={text(false)}>Wishlist</span>
    </GlassPill>
  </div>
);
