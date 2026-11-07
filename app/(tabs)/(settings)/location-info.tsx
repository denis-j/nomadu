import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from '../../../contexts/LanguageContext';
import { Colors } from '../../../constants/colors';
import { Typography, FontSize } from '../../../constants/typography';

const ITEMS = [
  { icon: 'battery-half-outline', title: 'settings.sheetBatteryTitle', desc: 'settings.sheetBatteryDesc' },
  { icon: 'time-outline', title: 'settings.sheetBgTitle', desc: 'settings.sheetBgDesc' },
  { icon: 'phone-portrait-outline', title: 'settings.sheetInstantTitle', desc: 'settings.sheetInstantDesc' },
  { icon: 'navigate-outline', title: 'settings.sheetCityTitle', desc: 'settings.sheetCityDesc' },
  { icon: 'lock-closed-outline', title: 'settings.sheetPrivateTitle', desc: 'settings.sheetPrivateDesc' },
] as const;

/** How the location tracking works: Settings, "How it works". */
export default function LocationInfoSheet() {
  const { t } = useTranslation();
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      {ITEMS.map((item) => (
        <View key={item.title} style={styles.item}>
          <Ionicons name={item.icon} size={22} color={Colors.primary} />
          <View style={styles.itemText}>
            <Text style={styles.itemTitle}>{t(item.title)}</Text>
            <Text style={styles.itemDesc}>{t(item.desc)}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 22 },
  item: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  itemText: { flex: 1, gap: 2 },
  itemTitle: { ...Typography.titleSmall },
  itemDesc: { ...Typography.bodySmall, fontSize: FontSize.subheadline, color: Colors.textSecondary, lineHeight: 20 },
});
