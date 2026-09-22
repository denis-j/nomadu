import { ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Flag } from './Flag';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { guideDays, type DestinationGuide } from '../constants/guides';

export const GUIDE_CARD_WIDTH = 140;

/**
 * A destination guide as a poster in the row under the trips: the place,
 * its flag, and how long the route runs. What it is like to arrive there
 * is the guide's job, one tap away; a card that tries to say it too ends
 * up a wall of text on a photo.
 */
export function GuideCard({ guide, onPress }: { guide: DestinationGuide; onPress: () => void }) {
  const days = guideDays(guide);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <ImageBackground source={{ uri: guide.image }} style={styles.image} imageStyle={styles.imageInner}>
        {/* Only the lower half darkens, and only as far as the name needs. */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']}
          locations={[0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.flag}>
          <Flag code={guide.countryCode} size={20} />
        </View>
        <View style={styles.text}>
          <Text style={styles.country} numberOfLines={1}>{guide.country}</Text>
          <Text style={styles.meta}>
            {guide.legs.length} {guide.legs.length === 1 ? 'stop' : 'stops'} · {days} days
          </Text>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: GUIDE_CARD_WIDTH,
    height: 200,
    borderRadius: 18,
    overflow: 'hidden',
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceSecondary,
  },
  image: { flex: 1, justifyContent: 'flex-end' },
  imageInner: { borderRadius: 18 },
  flag: { position: 'absolute', top: 10, left: 10 },
  text: { padding: 12, gap: 2 },
  country: { ...Typography.titleSmall, fontSize: 17, fontWeight: '700', color: Colors.white },
  meta: { ...Typography.caption, fontSize: 11, fontWeight: '600', color: Colors.whiteAlpha75 },
});
