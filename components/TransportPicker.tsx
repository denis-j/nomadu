import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GlassPill } from './GlassPill';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import type { TransportType } from '../lib/database';

/**
 * How one gets to a stop. One list for the picker in the add and edit
 * forms and for the read-only places that show the choice back (the stop
 * sheet, the timeline), so an icon never drifts from its label.
 */
export const TRANSPORTS: { type: TransportType; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { type: 'flight', icon: 'airplane', label: 'Flight' },
  { type: 'train', icon: 'train-outline', label: 'Train' },
  { type: 'car', icon: 'car-outline', label: 'Car' },
  { type: 'bus', icon: 'bus-outline', label: 'Bus' },
  { type: 'ferry', icon: 'boat-outline', label: 'Ferry' },
  { type: 'walk', icon: 'walk-outline', label: 'Walk' },
];

/** Icon and label for a stored transport, flight for anything unknown. */
export function transportInfo(type: string | null | undefined) {
  return TRANSPORTS.find((t) => t.type === type) ?? TRANSPORTS[0];
}

/** The app's pills, wrapping so all six are in view; the active one is tinted. */
export function TransportPicker({ value, onChange }: { value: TransportType; onChange: (t: TransportType) => void }) {
  return (
    <View style={styles.row}>
      {TRANSPORTS.map((t) => {
        const active = value === t.type;
        return (
          <GlassPill
            key={t.type}
            active={active}
            onPress={() => {
              if (active) return;
              Haptics.selectionAsync();
              onChange(t.type);
            }}
          >
            <View style={styles.pill}>
              <Ionicons name={t.icon} size={15} color={active ? Colors.white : Colors.text} />
              <Text style={[styles.label, active && styles.labelActive]}>{t.label}</Text>
            </View>
          </GlassPill>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { ...Typography.label, fontWeight: '600', color: Colors.text },
  labelActive: { color: Colors.white },
});
