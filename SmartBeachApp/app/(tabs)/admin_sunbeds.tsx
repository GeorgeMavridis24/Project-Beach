import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Beach = { id: number; name: string };

export default function AdminSunbedsScreen() {
  const router = useRouter();
  const { token, role } = useLocalSearchParams();

  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [selectedBeach, setSelectedBeach] = useState<number | null>(null);
  
  // Πόσες ξαπλώστρες υπάρχουν ήδη
  const [sunbedCount, setSunbedCount] = useState({ total: 0, premium: 0, normal: 0 });
  const [loading, setLoading] = useState(false);

  // Φόρμα Δημιουργίας
  const [rows, setRows] = useState('10');
  const [cols, setCols] = useState('10');
  const [premiumRows, setPremiumRows] = useState('2');
  const [premiumPrice, setPremiumPrice] = useState('20');
  const [normalPrice, setNormalPrice] = useState('10');

  useEffect(() => {
    fetchBeaches();
  }, []);

  const fetchBeaches = async () => {
    try {
      const response = await fetch('Your Ip/beaches');
      const data = await response.json();
      setBeaches(data);
    } catch (error) { alert("Σφάλμα φόρτωσης παραλιών."); }
  };

  const selectBeach = async (beachId: number) => {
    setSelectedBeach(beachId);
    setLoading(true);
    try {
      const response = await fetch(`Your Ip/beaches/${beachId}/sunbeds/count`);
      const data = await response.json();
      if (data.status === 'success') {
        setSunbedCount({ total: data.total_sunbeds, premium: data.premium_sunbeds, normal: data.normal_sunbeds });
      }
    } catch (error) {
      alert("Σφάλμα φόρτωσης πληροφοριών.");
    } finally {
      setLoading(false);
    }
  };

  const generateGrid = async () => {
    if (!selectedBeach) return alert("Επίλεξε παραλία!");
    if (sunbedCount.total > 0) return alert("Υπάρχουν ήδη ξαπλώστρες! Πρέπει να τις διαγράψεις πρώτα.");

    setLoading(true);
    try {
      // Στέλνουμε τις παραμέτρους στο URL όπως ακριβώς τις ζητάει η Python
      const response = await fetch(`Your Ip/admin/beaches/${selectedBeach}/sunbeds/grid?rows=${rows}&cols=${cols}&premium_rows=${premiumRows}&prem_price=${premiumPrice}&price=${normalPrice}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (data.status === 'success') {
        alert(data.message);
        selectBeach(selectedBeach); // Ανανεώνουμε τα νούμερα
      } else alert("Σφάλμα: " + data.message);
    } catch (error) {
      alert("Σφάλμα Δικτύου!");
    } finally {
      setLoading(false);
    }
  };

  const clearSunbeds = async () => {
    if (!selectedBeach) return;
    Alert.alert("Προσοχή!", "Αυτό θα διαγράψει ΟΛΕΣ τις ξαπλώστρες (και τυχόν κρατήσεις τους) σε αυτή την παραλία. Συνέχεια;", [
      { text: "Ακύρωση", style: "cancel" },
      { text: "Διαγραφή", style: "destructive", onPress: async () => {
          setLoading(true);
          try {
            const response = await fetch(`Your Ip/admin/beaches/${selectedBeach}/sunbeds`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.status === 'success') {
              alert(data.message);
              selectBeach(selectedBeach);
            } else alert(data.message);
          } catch (e) { alert("Σφάλμα!"); } finally { setLoading(false); }
        }
      }
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Διαχείριση Ξαπλωστρών 🪑</Text>

      <Text style={styles.label}>1. Επίλεξε Παραλία</Text>
      <View style={styles.beachesContainer}>
        {beaches.map(beach => (
          <TouchableOpacity 
            key={beach.id} 
            style={[styles.beachButton, selectedBeach === beach.id && styles.beachButtonActive]}
            onPress={() => selectBeach(beach.id)}
          >
            <Text style={[styles.beachButtonText, selectedBeach === beach.id && {color: 'white'}]}>{beach.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator size="large" color="#E65100" /> : selectedBeach && (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Στατιστικά Παραλίας</Text>
          <Text style={styles.infoText}>Σύνολο Ξαπλωστρών: <Text style={{fontWeight: 'bold'}}>{sunbedCount.total}</Text></Text>
          <Text style={styles.infoText}>VIP (Premium): {sunbedCount.premium} | Κανονικές: {sunbedCount.normal}</Text>
          
          {sunbedCount.total > 0 && (
            <TouchableOpacity style={styles.deleteBtn} onPress={clearSunbeds}>
              <Text style={styles.btnText}>🗑️ Διαγραφή Όλων για Reset</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {selectedBeach && sunbedCount.total === 0 && !loading && (
        <View style={styles.generatorCard}>
          <Text style={styles.infoTitle}>Γεννήτρια Πλέγματος (Grid) ⚙️</Text>
          
          <View style={styles.row}>
            <View style={styles.halfInput}>
              <Text style={styles.smallLabel}>Σειρές</Text>
              <TextInput style={styles.input} value={rows} onChangeText={setRows} keyboardType="numeric" />
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.smallLabel}>Στήλες</Text>
              <TextInput style={styles.input} value={cols} onChangeText={setCols} keyboardType="numeric" />
            </View>
          </View>

          <Text style={styles.smallLabel}>Πόσες από τις Σειρές θα είναι VIP (Premium);</Text>
          <TextInput style={styles.input} value={premiumRows} onChangeText={setPremiumRows} keyboardType="numeric" />

          <View style={styles.row}>
            <View style={styles.halfInput}>
              <Text style={styles.smallLabel}>Τιμή VIP (€)</Text>
              <TextInput style={styles.input} value={premiumPrice} onChangeText={setPremiumPrice} keyboardType="numeric" />
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.smallLabel}>Τιμή Κανονικής (€)</Text>
              <TextInput style={styles.input} value={normalPrice} onChangeText={setNormalPrice} keyboardType="numeric" />
            </View>
          </View>

          <TouchableOpacity style={styles.generateBtn} onPress={generateGrid}>
            <Text style={styles.btnText}>✨ Αυτόματη Δημιουργία</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => router.replace({ pathname: '/(tabs)/home', params: { token: token, role: role || 'user' } })}
      >
        <Text style={styles.backButtonText}>⬅️ Πίσω στο Μενού</Text>
      </TouchableOpacity>
      
      <View style={{height: 40}} /> 
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF3E0', padding: 20, paddingTop: 50 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#E65100', marginBottom: 20, textAlign: 'center' },
  label: { fontSize: 16, fontWeight: 'bold', color: '#E65100', marginBottom: 10 },
  
  beachesContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 },
  beachButton: { backgroundColor: 'white', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#FB8C00' },
  beachButtonActive: { backgroundColor: '#FB8C00' },
  beachButtonText: { color: '#FB8C00', fontWeight: 'bold' },

  infoCard: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 20, elevation: 2, borderWidth: 1, borderColor: '#FFE0B2' },
  infoTitle: { fontSize: 18, fontWeight: 'bold', color: '#E65100', marginBottom: 10, textAlign: 'center' },
  infoText: { fontSize: 16, marginBottom: 5, color: '#333', textAlign: 'center' },
  deleteBtn: { backgroundColor: '#D32F2F', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 15 },

  generatorCard: { backgroundColor: '#FFF', padding: 15, borderRadius: 10, marginBottom: 20, borderWidth: 2, borderColor: '#FFB74D' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  halfInput: { flex: 1 },
  smallLabel: { fontSize: 14, color: '#555', marginBottom: 5 },
  input: { backgroundColor: '#FAFAFA', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0', marginBottom: 15 },
  
  generateBtn: { backgroundColor: '#4CAF50', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

  backButton: { backgroundColor: '#757575', padding: 15, borderRadius: 10, marginTop: 10, alignItems: 'center' },
  backButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});