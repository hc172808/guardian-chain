import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  Animated,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useNetworkStats, useBlocks, usePriceHistory } from "@/hooks/useApi";
import { useBlockStream } from "@/hooks/useBlockStream";
import { StatCard } from "@/components/StatCard";
import { BlockRow } from "@/components/BlockRow";
import { PriceCard } from "@/components/PriceSparkline";
import { StatCardShimmer, RowShimmer } from "@/components/Shimmer";
import { GlowBadge } from "@/components/GlowBadge";

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const stats = useNetworkStats();
  const blocks = useBlocks(8);
  const priceHistory = usePriceHistory();

  const pulseAnim = useRef(new Animated.Value(1)).current;

  const triggerPulse = useCallback(() => {
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.15, duration: 180, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();
  }, [pulseAnim]);

  useBlockStream({
    enabled: true,
    onBlock: () => {
      triggerPulse();
      stats.refetch();
    },
  });

  const isRefreshing = stats.isFetching || blocks.isFetching;

  const onRefresh = useCallback(() => {
    stats.refetch();
    blocks.refetch();
    priceHistory.refetch();
  }, [stats, blocks, priceHistory]);

  const pricePoints = priceHistory.data?.prices?.map((p) => p.price) ?? [];
  const currentPrice = priceHistory.data?.current ?? 0.042;
  const change24h =
    pricePoints.length >= 2
      ? ((pricePoints[pricePoints.length - 1] - pricePoints[0]) / pricePoints[0]) * 100
      : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 12, paddingBottom: botPad + 90 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.networkName, { color: colors.mutedForeground }]}>
              GYDS Chain · ID {stats.data?.chainId ?? 13370}
            </Text>
            <Text style={[styles.appTitle, { color: colors.foreground }]}>ChainCore</Text>
          </View>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <GlowBadge label="Live" variant="accent" />
          </Animated.View>
        </View>

        {/* Price Card */}
        <PriceCard price={currentPrice} change24h={change24h} priceHistory={pricePoints} />

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {stats.isLoading ? (
            <>
              <StatCardShimmer />
              <StatCardShimmer />
            </>
          ) : (
            <>
              <StatCard
                label="Block Height"
                value={stats.data?.blockHeight?.toLocaleString() ?? "—"}
                accent
              />
              <StatCard
                label="Validators"
                value={stats.data?.peerCount?.toLocaleString() ?? "—"}
              />
            </>
          )}
        </View>
        <View style={styles.statsGrid}>
          {stats.isLoading ? (
            <>
              <StatCardShimmer />
              <StatCardShimmer />
            </>
          ) : (
            <>
              <StatCard
                label="Total Txs"
                value={stats.data?.totalTransactions?.toLocaleString() ?? "—"}
              />
              <StatCard
                label="Gas Price"
                value={
                  stats.data?.gasPrice
                    ? `${(Number(stats.data.gasPrice) / 1e9).toFixed(1)} Gwei`
                    : "—"
                }
              />
            </>
          )}
        </View>

        {/* Recent Blocks */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Recent Blocks
        </Text>

        {blocks.isLoading ? (
          <>
            <RowShimmer />
            <RowShimmer />
            <RowShimmer />
          </>
        ) : blocks.error ? (
          <View
            style={[
              styles.emptyBox,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.emptyText, { color: colors.destructive }]}>
              Failed to load blocks
            </Text>
          </View>
        ) : !blocks.data?.length ? (
          <View
            style={[
              styles.emptyBox,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No blocks yet
            </Text>
          </View>
        ) : (
          blocks.data.map((block) => (
            <BlockRow
              key={block.hash}
              block={block}
              onPress={() => router.push(`/block/${block.number}`)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 12 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  networkName: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  appTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
    marginTop: 2,
  },
  statsGrid: { flexDirection: "row", gap: 10 },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
    marginBottom: 4,
  },
  emptyBox: { padding: 24, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
