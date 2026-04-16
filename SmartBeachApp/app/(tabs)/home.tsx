import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ImageBackground, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const role = params.role; 
  const token = params.token;

  const handleLogout = () => {
    router.replace('/'); 
  };

  return (
    <ImageBackground 
      source={{ uri: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?q=80&w=1000&auto=format&fit=crop' }} 
      style={styles.container}
    >
      <View style={styles.overlay}>
        <Text style={styles.title}>Καλώς ήρθες! 🏝️</Text>
        <Text style={styles.subtitle}>
          Είσαι συνδεδεμένος ως: <Text style={{fontWeight: 'bold', color: '#D32F2F'}}>{role === 'admin' ? 'Διαχειριστής' : 'Πελάτης'}</Text>
        </Text>

        <ScrollView style={{width: '100%'}}>
          
          {/* ---- ΜΕΝΟΥ ΠΕΛΑΤΗ ---- */}
          <View style={styles.menuSection}>
            <Text style={styles.sectionTitle}>Επιλογές</Text>
            
            <TouchableOpacity style={styles.actionButton}
              onPress={() => router.push({ pathname: '/(tabs)/book_sunbed', params: { token: token, role: role } })}
            >
              <Text style={styles.actionButtonText}>📅 Νέα Κράτηση Ξαπλώστρας</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionButton}
              onPress={() => router.push({ pathname: '/(tabs)/beaches', params: { token: token, role: role } })}
            >
              <Text style={styles.actionButtonText}>🏖️ Δες τις Παραλίες</Text>
            </TouchableOpacity>

            {/* Εμφανίζεται ΜΟΝΟ στον απλό χρήστη, ΠΟΤΕ στον Admin */}
            {role !== 'admin' && (
              <TouchableOpacity style={styles.actionButton}
                onPress={() => router.push({ pathname: '/(tabs)/user_bookings', params: { token: token, role: role } })}
              >
                <Text style={styles.actionButtonText}>📋 Οι Κρατήσεις Μου (Ακύρωση)</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ---- ΜΕΝΟΥ ΜΟΝΟ ΓΙΑ ADMINS ---- */}
          {role === 'admin' && (
            <View style={styles.adminSection}>
              <Text style={styles.adminTitle}>⚙️ Πίνακας Ελέγχου Admin</Text>
              
              <TouchableOpacity style={styles.adminButton}>
                <Text style={styles.adminButtonText}>🕒 Αλλαγή Ωραρίου</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.adminButton}
                onPress={() => router.push({ pathname: '/(tabs)/admin_bookings', params: { token: token, role: role } })}
              >
                <Text style={styles.adminButtonText}>❌ Ακύρωση Κρατήσεων Πελατών</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.adminButton}
                onPress={() => router.push({ pathname: '/(tabs)/admin_sunbeds', params: { token: token, role: role } })}
              >
                <Text style={styles.adminButtonText}>🪑 Διαχείριση / Δημιουργία Ξαπλωστρών</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.adminButton}
                onPress={() => router.push({ pathname: '/(tabs)/admin_users', params: { token: token, role: role } })}
              >
                <Text style={styles.adminButtonText}>👥 Προβολή Εγγεγραμμένων Χρηστών</Text>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Αποσύνδεση</Text>
        </TouchableOpacity>
      </View>
      <StatusBar style="auto" />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingTop: 40, paddingBottom: 20, paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    width: '90%',
    maxHeight: '85%'
  },
  title: { fontSize: 28, fontWeight: 'bold', color: '#006064', marginBottom: 5 },
  subtitle: { fontSize: 16, color: '#00838F', marginBottom: 20, textAlign: 'center' },
  
  menuSection: { width: '100%', marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#00838F', marginBottom: 10 },
  actionButton: { backgroundColor: '#00ACC1', padding: 15, borderRadius: 10, marginBottom: 10 },
  actionButtonText: { color: 'white', fontWeight: 'bold', textAlign: 'center', fontSize: 16 },

  adminSection: { width: '100%', backgroundColor: '#FFF3E0', padding: 15, borderRadius: 15, marginBottom: 20, borderWidth: 1, borderColor: '#FFB74D' },
  adminTitle: { fontSize: 18, fontWeight: 'bold', color: '#E65100', marginBottom: 15, textAlign: 'center' },
  adminButton: { backgroundColor: '#FB8C00', padding: 12, borderRadius: 8, marginBottom: 10 },
  adminButtonText: { color: 'white', fontWeight: 'bold', textAlign: 'center', fontSize: 15 },

  logoutButton: { marginTop: 10, padding: 10 },
  logoutText: { color: '#D32F2F', fontSize: 16, fontWeight: 'bold' }
});