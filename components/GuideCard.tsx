import { ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Flag } from './Flag';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import type { DestinationGuide } from '../constants/guides';

export const GUIDE_CARD_WIDTH = 220;

/**
 * A destination guide in the horizontal row under the trips: a photo, the
 * flag, the country and the one line that says why it is here. Everything
 * else is in the guide itself, a tap away, which is what a card is for.
 */
export function GuideCard({ guide, onPress }: { guide: DestinationGuide; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <ImageBackground source={{ uri: guide.image }} style={styles.image} imageStyle={styles.imageInner}>
        {/* Only as dark as the two lines of text need. */}
        <LinearGradient
          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.8)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.text}>
          <Flag code={guide.countryCode} size={22} />
          <Text style={styles.country} numberOfLines={1}>{guide.country}</Text>
          <Text style={styles.tagline} numberOfLines={1}>{guide.tagline}</Text>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: GUIDE_CARD_WIDTH,
    height: 150,
    borderRadius: 18,
    overflow: 'hidden',
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
  },
  image: { flex: 1, justifyContent: 'flex-end' },
  imageInner: { borderRadius: 18 },
  text: { padding: 14, gap: 3 },
  country: { ...Typography.titleMedium, color: Colors.white, letterSpacing: -0.3 },
  tagline: { ...Typography.caption, color: Colors.whiteAlpha75, fontWeight: '600' },
});
