import type Ionicons from '@expo/vector-icons/Ionicons';
import type { DropdownOption } from '../Dropdown';
import {
  ACTIVITY_CATEGORY_ICONS,
  ACTIVITY_STATUSES,
  type ActivityCategory,
  type ActivitySource,
  type ActivityStatus,
} from '../../lib/activityModel';

type IconName = keyof typeof Ionicons.glyphMap;

/** A kind's symbol, monochrome like every other icon on the itinerary. */
export function categoryIcon(category: ActivityCategory): IconName {
  return ACTIVITY_CATEGORY_ICONS[category] as IconName;
}

/** The platform an activity was saved from, as a small mark on its row. */
export const SOURCE_MARK: Partial<Record<ActivitySource, { icon: IconName; label: string }>> = {
  tiktok: { icon: 'logo-tiktok', label: 'TikTok' },
  instagram: { icon: 'logo-instagram', label: 'Instagram' },
  youtube: { icon: 'logo-youtube', label: 'YouTube' },
  ai: { icon: 'sparkles', label: 'Suggested' },
  agent: { icon: 'hardware-chip-outline', label: 'Your agent' },
  link: { icon: 'link', label: 'Link' },
};

/** The status menu, the same on the list and on the sheet. SF Symbols, for the system menu. */
const STATUS_SYMBOL: Record<ActivityStatus, string> = {
  idea: 'lightbulb',
  planned: 'calendar',
  booked: 'ticket',
  done: 'checkmark.circle',
};

export function statusOptions(t: (key: string) => string): DropdownOption[] {
  return ACTIVITY_STATUSES.map((s) => ({
    id: s,
    label: t(`activityStatus.${s}`),
    icon: STATUS_SYMBOL[s],
  }));
}
