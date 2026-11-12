import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { C, RADIUS } from '@/constants/brand';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Screen({
  title,
  subtitle,
  right,
  children,
  scroll = true,
  onRefresh,
  refreshing,
  topInset = true,
}: {
  topInset?: boolean;
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const header = title ? (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Text style={s.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  ) : null;
  return (
    <SafeAreaView style={s.screen} edges={topInset ? ['top'] : []}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[s.content, { flex: 1 }]}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  icon,
  variant = 'primary',
  disabled,
  loading,
  small,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    primary: { bg: C.primary, fg: '#FFFFFF', border: C.primary },
    secondary: { bg: C.card, fg: C.primary, border: C.primary },
    danger: { bg: C.card, fg: C.danger, border: C.danger },
    ghost: { bg: 'transparent', fg: C.textMuted, border: 'transparent' },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      style={({ pressed }) => [
        s.button,
        small && s.buttonSmall,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={palette.fg} /> : null}
          <Text style={[s.buttonText, small && { fontSize: 14 }, { color: palette.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[s.chip, selected && s.chipOn]}
    >
      {icon ? <Ionicons name={icon} size={14} color={selected ? '#FFFFFF' : C.primary} /> : null}
      <Text style={[s.chipText, selected && { color: '#FFFFFF' }]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children, wrap }: { children: React.ReactNode; wrap?: boolean }) {
  if (wrap) return <View style={[s.chipRow, { flexWrap: 'wrap' }]}>{children}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
      {children}
    </ScrollView>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.section}>{children}</Text>
      {right}
    </View>
  );
}

export function Field({
  label,
  containerStyle,
  ...props
}: TextInputProps & { label?: string; containerStyle?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginBottom: 12 }, containerStyle]}>
      {label ? <Label>{label}</Label> : null}
      <TextInput placeholderTextColor={C.textFaint} {...props} style={[s.input, props.style]} />
    </View>
  );
}

export function Badge({ text, tone = 'neutral', icon }: { text: string; tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'primary'; icon?: IconName }) {
  const colors = {
    neutral: { bg: '#EFEDE6', fg: C.textMuted },
    success: { bg: C.successSoft, fg: C.success },
    danger: { bg: C.dangerSoft, fg: C.danger },
    warning: { bg: C.warningSoft, fg: C.warning },
    primary: { bg: C.primarySoft, fg: C.primaryDark },
  }[tone];
  return (
    <View style={[s.badge, { backgroundColor: colors.bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={colors.fg} /> : null}
      <Text style={[s.badgeText, { color: colors.fg }]}>{text}</Text>
    </View>
  );
}

export function Banner({ text, tone = 'danger' }: { text: string; tone?: 'danger' | 'success' | 'warning' | 'info' }) {
  const colors = {
    danger: { bg: C.dangerSoft, fg: C.danger, icon: 'alert-circle' as IconName },
    success: { bg: C.successSoft, fg: C.success, icon: 'checkmark-circle' as IconName },
    warning: { bg: C.warningSoft, fg: C.warning, icon: 'warning' as IconName },
    info: { bg: C.primarySoft, fg: C.primaryDark, icon: 'information-circle' as IconName },
  }[tone];
  return (
    <View style={[s.banner, { backgroundColor: colors.bg }]} accessibilityRole="alert">
      <Ionicons name={colors.icon} size={18} color={colors.fg} />
      <Text style={[s.bannerText, { color: colors.fg }]}>{text}</Text>
    </View>
  );
}

export function Empty({ icon = 'sunny-outline', text }: { icon?: IconName; text: string }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={36} color={C.textFaint} />
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

export function Loading() {
  return <ActivityIndicator size="large" color={C.primary} style={{ marginVertical: 32 }} />;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={s.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[s.segment, on && s.segmentOn]}
          >
            <Text style={[s.segmentText, on && { color: C.primaryDark }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', color: C.text },
  subtitle: { fontSize: 14, color: C.textMuted, marginTop: 2 },
  card: {
    backgroundColor: C.card,
    borderRadius: RADIUS,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1.5,
    minHeight: 48,
  },
  buttonSmall: { paddingVertical: 8, paddingHorizontal: 12, minHeight: 38 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 36,
  },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 14, color: C.text, fontWeight: '500' },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  label: { fontSize: 13, fontWeight: '600', color: C.textMuted, marginBottom: 6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 8 },
  section: { fontSize: 18, fontWeight: '700', color: C.text },
  input: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: C.text,
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  banner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 10, marginBottom: 12 },
  bannerText: { flex: 1, fontSize: 14, fontWeight: '500' },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { color: C.textMuted, fontSize: 15, textAlign: 'center' },
  segmented: { flexDirection: 'row', backgroundColor: '#EBE8E0', borderRadius: 10, padding: 3, marginBottom: 12 },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  segmentOn: { backgroundColor: C.card },
  segmentText: { fontSize: 14, fontWeight: '600', color: C.textMuted },
});
