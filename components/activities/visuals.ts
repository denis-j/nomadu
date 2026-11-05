import type Ionicons from '@expo/vector-icons/Ionicons';
import { ACTIVITY_CATEGORY_ICONS, type ActivityCategory, type ActivitySource } from '../../lib/activityModel';

type IconName = keyof typeof Ionicons.glyphMap;

/** A kind's symbol, monochrome like every other icon on the itinerary. */
export function categoryIcon(category: ActivityCategory): IconName {
  return ACTIVITY_CATEGORY_ICONS[category] as IconName;
}

/** The platform an activity was saved from, as a small mark on its card. */
export const SOURCE_MARK: Partial<Record<ActivitySource, { icon: IconName; label: string }>> = {
  tiktok: { icon: 'logo-tiktok', label: 'TikTok' },
  instagram: { icon: 'logo-instagram', label: 'Instagram' },
  youtube: { icon: 'logo-youtube', label: 'YouTube' },
  ai: { icon: 'sparkles', label: 'Suggested' },
  agent: { icon: 'hardware-chip-outline', label: 'Your agent' },
  link: { icon: 'link', label: 'Link' },
};
