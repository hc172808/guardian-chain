import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useFaucetClaims, useClaimFaucet } from "@/hooks/useApi";
import { GlowBadge } from "@/components/GlowBadge";
import { formatDistanceToNow, msToCountdown } from "@/lib/utils";

const WALLET_KEY = "@chaincore_wallet_address";
const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;

type Token = "GYD" | "GYDS";

export default function FaucetScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [address, setAddress] = useState("");
  const [savedAddress, setSavedAddress] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<Token>("GYD");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    AsyncStorage.getItem(WALLET_KEY).then((val) => {
      if (val) { setSavedAddress(val); setAddress(val); }
    });
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const claims = useFaucetClaims(address.trim());
  const claimMutation = useClaimFaucet();

  const lastClaim = claims.data?.find((c) => c.token === selectedToken);
  const lastClaimTime = lastClaim ? new Date(lastClaim.created_at).getTime() : 0;
  const cooldownMs = lastClaimTime ? Math.max(0, lastClaimTime + TWENTY_FOUR_H - now) : 0;
  const canClaim = !cooldownMs && address.trim().length > 5 && !claimMutation.isPending;

  const handleClaim = async () => {
    const trimmed = address.trim();
    if (!trimmed) {
      Alert.alert("Address Required", "Please enter your wallet address.");
      return;
    }
    try {
      await claimMutation.mutateAsync({ wallet_address: trimmed, token: selectedToken });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success!", `${selectedToken} tokens sent to your wallet.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to claim tokens";
      const already = msg.includes("24");
      Alert.alert(
        already ? "Cooldown Active" : "Claim Failed",
        already ? "You can only claim once every 24 hours." : msg
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const tokenAmounts: Record<Token, string> = { GYD: "100 GYD", GYDS: "10 GYDS" };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: topPad + 12, paddingBottom: botPad + 80 }]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Faucet</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Claim free testnet tokens every 24 hours
        </Text>

        {/* Token Selector */}
        <View style={[styles.tokenRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(["GYD", "GYDS"] as Token[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.tokenBtn,
                selectedToken === t && { backgroundColor: colors.primary },
              ]}
              onPress={() => setSelectedToken(t)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tokenBtnLabel,
                  { color: selectedToken === t ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {t}
              </Text>
              <Text
                style={[
                  styles.tokenBtnAmount,
                  { color: selectedToken === t ? colors.primaryForeground + "bb" : colors.mutedForeground + "88" },
                ]}
              >
                {tokenAmounts[t]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Claim Card */}
        <View style={[styles.claimCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.claimTop}>
            <Text style={[styles.claimAmount, { color: colors.primary }]}>
              {tokenAmounts[selectedToken]}
            </Text>
            <GlowBadge label="Testnet" variant="warning" />
          </View>
          <Text style={[styles.claimDesc, { color: colors.mutedForeground }]}>
            Free {selectedToken} tokens for testing on the GYDS testnet. One claim per 24 hours.
          </Text>

          {/* Address Input */}
          <View style={[styles.inputWrapper, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="briefcase" size={14} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              value={address}
              onChangeText={setAddress}
              placeholder="Wallet address"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {savedAddress && address !== savedAddress ? (
              <TouchableOpacity onPress={() => setAddress(savedAddress)}>
                <Text style={[styles.useStored, { color: colors.primary }]}>Use Saved</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Cooldown indicator */}
          {cooldownMs > 0 ? (
            <View style={[styles.cooldownBox, { backgroundColor: colors.muted }]}>
              <Feather name="clock" size={14} color={colors.warning} />
              <Text style={[styles.cooldownText, { color: colors.warning }]}>
                Next claim in {msToCountdown(cooldownMs)}
              </Text>
            </View>
          ) : null}

          {/* Claim Button */}
          <TouchableOpacity
            style={[
              styles.claimBtn,
              {
                backgroundColor: canClaim ? colors.primary : colors.muted,
                opacity: canClaim ? 1 : 0.6,
              },
            ]}
            onPress={handleClaim}
            disabled={!canClaim}
            activeOpacity={0.85}
          >
            {claimMutation.isPending ? (
              <Feather name="loader" size={18} color={canClaim ? colors.primaryForeground : colors.mutedForeground} />
            ) : (
              <Text
                style={[
                  styles.claimBtnText,
                  { color: canClaim ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {cooldownMs > 0 ? `Claim in ${msToCountdown(cooldownMs)}` : `Claim ${selectedToken}`}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Recent Claims */}
        {address.trim().length > 5 ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Claims</Text>
            {claims.isLoading ? (
              <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading...</Text>
            ) : !claims.data?.length ? (
              <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>No claims yet</Text>
            ) : (
              claims.data.map((claim) => (
                <View key={claim.id} style={[styles.claimHistoryRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.claimDot, { backgroundColor: colors.neonEmerald + "33" }]}>
                    <Feather name="droplet" size={12} color={colors.neonEmerald} />
                  </View>
                  <View style={styles.claimInfo}>
                    <Text style={[styles.claimHistoryAmount, { color: colors.foreground }]}>
                      {claim.amount} {claim.token}
                    </Text>
                    <Text style={[styles.claimHistoryTime, { color: colors.mutedForeground }]}>
                      {claim.created_at ? formatDistanceToNow(claim.created_at) : "—"}
                    </Text>
                  </View>
                  <GlowBadge
                    label={claim.status ?? "pending"}
                    variant={claim.status === "completed" ? "accent" : claim.status === "failed" ? "destructive" : "warning"}
                  />
                </View>
              ))
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: -4 },
  tokenRow: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  tokenBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    gap: 2,
  },
  tokenBtnLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  tokenBtnAmount: { fontSize: 11, fontFamily: "Inter_400Regular" },
  claimCard: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 14 },
  claimTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  claimAmount: { fontSize: 32, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  claimDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  useStored: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  cooldownBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cooldownText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  claimBtn: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  claimBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 12 },
  claimHistoryRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    marginBottom: 8,
  },
  claimDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  claimInfo: { flex: 1, gap: 3 },
  claimHistoryAmount: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  claimHistoryTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
