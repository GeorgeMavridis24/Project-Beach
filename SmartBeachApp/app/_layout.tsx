import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { C } from "@/constants/brand";
import { AuthProvider, useAuth } from "@/lib/auth";
import { REQUIRED_API_VERSION } from "@/lib/config";
import { isStaffLike } from "@/lib/roles";

function RootNavigator() {
  const { user, loading, config } = useAuth();
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: C.bg,
        }}
      >
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }
  const isStaff = isStaffLike(user);
  // Protected routes: χωρίς σύνδεση φαίνεται μόνο το login, και η "Διαχείριση"
  // υπάρχει μόνο για προσωπικό/διαχειριστές.
  // Παλιός server (π.χ. έμεινε ανοιχτό παράθυρο από παλιό φάκελο): προειδοποίηση.
  const outdated = !!config && (config.api_version ?? 0) < REQUIRED_API_VERSION;
  return (
    <View style={{ flex: 1 }}>
      {outdated ? (
        <SafeAreaView edges={["top"]} style={{ backgroundColor: C.danger }}>
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 13,
              fontWeight: "600",
              padding: 10,
            }}
            accessibilityRole="alert"
          >
            Τρέχει παλιότερη έκδοση του server. Κλείσε όλα τα μαύρα παράθυρα
            «SmartBeach» και άνοιξε ξανά το 2-EKKINISI.bat από τον νέο φάκελο.
          </Text>
        </SafeAreaView>
      ) : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="partner" />
          <Stack.Protected guard={isStaff}>
            <Stack.Screen name="admin" />
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style="dark" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
