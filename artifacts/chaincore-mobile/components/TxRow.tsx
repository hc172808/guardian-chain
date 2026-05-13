import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { Transaction } from "@/hooks/useApi";
import { formatDistanceToNow, truncateAddress } from "@/lib/utils";

interface TxRowProps {
  tx: Transaction;
  onPress?: () => void;
}

export function TxRow({ tx, onPress }: TxRowProps) {
  const colors = useColors();
  const statusColor =
    tx.status === "success"
      ? colors.neonEmerald
      : tx.status === "failed"
      ? colors.destructive
      : colors.warning;

  const valueParsed = tx.value ? (Number(BigInt(tx.value)) / 1e18).toFixed(4) : "0";

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.dot, { backgroundColor: statusColor + "33" }]}>
        <View style={[styles.dotInner, { backgroundColor: statusColor }]} />
      </View>
      <View style={styles.info}>
        <Text style={[styles.hash, { color: colors.foreground }]} numberOfLines={1}>
          {tx.hash ? `${tx.hash.slice(0, 14)}...` : "—"}
        </Text>
        <Text style={[styles.addresses, { color: colors.mutedForeground }]} numberOfLines={1}>
          {truncateAddress(tx.from)} → {truncateAddress(tx.to)}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.value, { color: colors.primary }]}>
          {valueParsed} GYD
        </Text>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>
          {tx.timestamp ? formatDistanceToNow(tx.timestamp * 1000) : "—"}
        </Text>
        <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    marginBottom: 8,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  hash: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.2,
  },
  addresses: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  right: {
    alignItems: "flex-end",
    gap: 2,
  },
  value: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  time: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
});
