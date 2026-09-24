import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';

/**
 * Any link the app has no screen for. Expo Router's default page offered a
 * "Sitemap" of every route, including the development ones, to anyone with
 * a mistyped or crafted link.
 */
export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: false }} />
      <View style={styles.wrap}>
        <Ionicons name="compass-outline" size={32} color={Colors.textTertiary} />
        <Text style={styles.title}>This page does not exist</Text>
        <Text style={styles.text}>The link may be old or mistyped.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/(tabs)/(timeline)')}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.buttonText}>Back to your timeline</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40, backgroundColor: Colors.background },
  title: { ...Typography.body, fontWeight: '600', color: Colors.text, textAlign: 'center' },
  text: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  button: { marginTop: 12, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: Colors.surfaceSecondary },
  buttonText: { ...Typography.body, fontWeight: '600', color: Colors.text },
});
