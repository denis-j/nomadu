import { StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';

/**
 * What a screen shows when it was opened without the stop, trip or plan it
 * is about. These screens are all reachable through the app's own URL
 * scheme, so anything can send them a link with a piece missing, and
 * reading a date out of `undefined` took the whole screen down.
 */
export function MissingRoute({ title, message }: { title: string; message: string }) {
  return (
    <>
      <Stack.Screen options={{ title }} />
      <View style={styles.wrap}>
        <Ionicons name="help-circle-outline" size={28} color={Colors.textTertiary} />
        <Text style={styles.text}>{message}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  text: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
});
