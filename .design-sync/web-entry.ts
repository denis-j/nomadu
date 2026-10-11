// Web entry for the Claude Design sync. Re-exports the app's core UI
// components so .design-sync/web-build.mjs can compile them for the browser
// (react-native aliased to react-native-web). Components here must render on
// web; 3D, map and native-only pieces are deliberately left out.
export { CloudyButton } from '../components/CloudyButton';
export { GlassPill } from '../components/GlassPill';
export { StatCard } from '../components/StatCard';
export { StatTile, StatRow } from '../components/StatTile';
export { PillRow } from '../components/PillRow';
export { YearPicker } from '../components/YearPicker';
export { TripCard } from '../components/TripCard';
export { EmptyState } from '../components/EmptyState';
export { Flag } from '../components/Flag';
export { GuideCard } from '../components/GuideCard';
export { StopSummary } from '../components/StopSummary';
export { TransportPicker } from '../components/TransportPicker';
export { CountryPicker } from '../components/CountryPicker';
export { UpdateBanner } from '../components/UpdateBanner';
export { StatsBars } from '../components/StatsBars';
export { TimelineBubbles } from '../components/TimelineBubbles';
export { Colors } from '../constants/colors';
export { Typography } from '../constants/typography';
export { default as Ionicons } from '@expo/vector-icons/Ionicons';
export { SafeAreaProvider } from 'react-native-safe-area-context';
