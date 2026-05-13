import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  positive?: boolean;
  negative?: boolean;
}

export function StatCard({ label, value, sub, accent, positive, negative }: StatCardProps) {
  const colors = useColors();

  const valueColor = positive
    ? colors.neonEmerald
    : negative
    ? colors.destructive
    : accent
    ? colors.primary
    : colors.foreground;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? (
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>{sub}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    minWidth: 0,
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  value: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
});
