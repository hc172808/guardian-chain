import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useTransaction } from "@/hooks/useApi";
import { Shimmer } from "@/components/Shimmer";
import { GlowBadge } from "@/components/GlowBadge";
import { formatDistanceToNow, truncateAddress } from "@/lib/utils";

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const colors = useColors();
  return (
    <View style={[dr.row, { borderColor: colors.border }]}>
      <Text style={[dr.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text
        style={[dr.value, { color: colors.foreground, fontFamily: mono ? "Inter_400Regular" : "Inter_500Medium" }]}
        numberOfLines={2}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

const dr = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  label: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 0.42 },
  value: { fontSize: 13, flex: 0.58, textAlign: "right" },
});

export default function TxDetailScreen() {
  const { hash } = useLocalSearchParams<{ hash: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const tx = useTransaction(hash ?? "");

  const valueParsed = tx.data?.value
    ? (Number(BigInt(tx.data.value)) / 1e18).toFixed(6)
    : "0";

  const statusVariant =
    tx.data?.status === "success" ? "accent"
    : tx.data?.status === "failed" ? "destructive"
    : "warning";

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.navHeader, { paddingTop: topPad + 6, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>Transaction</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {tx.isLoading ? (
          <View style={{ gap: 12 }}>
            <Shimmer height={24} width="70%" />
            <Shimmer height={140} />
            <Shimmer height={240} />
          </View>
        ) : !tx.data ? (
          <View style={styles.notFound}>
            <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
            <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>
              Transaction not found
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.txHeader}>
              <Text style={[styles.txLabel, { color: colors.mutedForeground }]}>Transaction</Text>
              <View style={styles.txBadgeRow}>
                <GlowBadge label={tx.data.status ?? "pending"} variant={statusVariant} />
                <GlowBadge label="GYD" variant="primary" />
              </View>
            </View>

            {/* Amount */}
            <View style={[styles.amountCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.amountValue, { color: colors.primary }]}>
                {valueParsed}
              </Text>
              <Text style={[styles.amountToken, { color: colors.mutedForeground }]}>GYD</Text>
            </View>

            {/* Details */}
            <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <DetailRow label="Hash" value={tx.data.hash ?? "—"} mono />
              <DetailRow label="From" value={truncateAddress(tx.data.from, 10)} />
              <DetailRow label="To" value={truncateAddress(tx.data.to, 10)} />
              <DetailRow label="Block" value={`#${tx.data.blockNumber?.toLocaleString() ?? "—"}`} />
              <DetailRow label="Gas Used" value={tx.data.gasUsed?.toLocaleString() ?? "—"} />
              <DetailRow label="Gas Price" value={tx.data.gasPrice ? `${(Number(tx.data.gasPrice) / 1e9).toFixed(2)} Gwei` : "—"} />
              <DetailRow
                label="Time"
                value={tx.data.timestamp ? formatDistanceToNow(tx.data.timestamp * 1000) : "—"}
              />
            </View>

            {/* Block link */}
            {tx.data.blockNumber ? (
              <TouchableOpacity
                style={[styles.blockLink, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push(`/block/${tx.data!.blockNumber}`)}
                activeOpacity={0.75}
              >
                <View>
                  <Text style={[styles.blockLinkLabel, { color: colors.mutedForeground }]}>
                    Included in Block
                  </Text>
                  <Text style={[styles.blockLinkValue, { color: colors.primary }]}>
                    #{tx.data.blockNumber.toLocaleString()}
                  </Text>
                </View>
                <Feather name="arrow-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : null}
          </>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  navHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },
  txHeader: { gap: 8 },
  txLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  txBadgeRow: { flexDirection: "row", gap: 8 },
  amountCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 4,
  },
  amountValue: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1.5,
  },
  amountToken: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  detailCard: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, overflow: "hidden" },
  blockLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  blockLinkLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4 },
  blockLinkValue: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  notFound: { paddingTop: 80, alignItems: "center", gap: 12 },
  notFoundText: { fontSize: 16, fontFamily: "Inter_500Medium" },
});
