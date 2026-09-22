import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import * as Haptics from 'expo-haptics';

export interface DropdownOption {
  id: string;
  label: string;
  /** A line under the label, iOS 15+. */
  subtitle?: string;
  /** An SF Symbol name. */
  icon?: string;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * A native pull-down menu on whatever it wraps: the system's own UIMenu,
 * anchored to the control, with a check on the current choice. Used for
 * the small choices on a page (a currency, a status, the "..." menu),
 * where an action sheet over the whole screen was too much.
 */
export function Dropdown({
  title,
  options,
  value,
  onPick,
  right,
  style,
  children,
}: {
  title?: string;
  options: DropdownOption[];
  /** The option shown as chosen. */
  value?: string | null;
  onPick: (id: string) => void;
  /** Anchor the menu to the control's right edge, for controls at the right of the screen. */
  right?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <MenuView
      title={title}
      isAnchoredToRight={right}
      shouldOpenOnLongPress={false}
      style={[styles.wrap, style]}
      actions={options.map((o) => ({
        id: o.id,
        title: o.label,
        subtitle: o.subtitle,
        image: o.icon,
        state: value === o.id ? 'on' : 'off',
        attributes: { destructive: o.destructive, disabled: o.disabled },
      }))}
      onPressAction={({ nativeEvent }) => {
        Haptics.selectionAsync();
        onPick(nativeEvent.event);
      }}
    >
      <View>{children}</View>
    </MenuView>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
});
