import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Beach = { id: number; name: string; description: string };
type Sunbed = { id: number; grid_x: number; grid_y: number; price: string; status: string };

export default function BookSunbedScreen() {
  const router = useRouter();
  const { token, role } = useLocalSearchParams();

  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [selectedBeach, setSelectedBeach] = useState<number | null>(null);
  
  // Πεδία Ημερομηνίας και Ωρών
  const [date, setDate] = useState('2026-06-15'); 
  const [arrivalTime, setArrivalTime] = useState('10:00');
  const [leaveTime, setLeaveTime] = useState('18:00'); 
  
  const [sunbeds, setSunbeds] = useState<Sunbed[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false); 

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

  const handleSearch = async () => {
    if (!selectedBeach) return alert("Επίλεξε παραλία!");
    setLoading(true); setSearched(true);
    try {
      const response = await fetch(`Your Ip/beaches/${selectedBeach}/sunbeds/availability?res_date=${date}`);
      const data = await response.json();
      setSunbeds(data);
    } catch (error) { alert("Σφάλμα φόρτωσης ξαπλωστρών."); } finally { setLoading(false); }
  };

  const handleBooking = async (sunbedId: number) => {
    try {
      // Στέλνουμε ΚΑΙ την ώρα άφιξης ΚΑΙ την ώρα αναχώρησης!
      const response = await fetch(`Your Ip/book?sunbed_id=${sunbedId}&res_date=${date}&res_time=${arrivalTime}&leave_time=${leaveTime}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();

      if (data.status === 'success') {
        alert(data.message);
        handleSearch(); // Ανανέωση λίστας ξαπλωστρών
      } else alert("Σφάλμα: " + data.message);
    } catch (error) { alert("Σφάλμα Δικτύου!"); }
  };

  const renderSunbed = ({ item }: { item: Sunbed }) => {
    const isAvailable = item.status === 'available';
    return (
      <View style={[styles.sunbedCard, { borderColor: isAvailable ? '#4CAF50' : '#F44336' }]}>
        <Text style={styles.sunbedInfo}>🪑 Νο: {item.id} (Σειρά: {item.grid_x}, Θέση: {item.grid_y})</Text>
        <Text style={styles.sunbedPrice}>Τιμή: {item.price}€</Text>
        {isAvailable ? (
          <TouchableOpacity style={styles.bookButton} onPress={() => handleBooking(item.id)}>
            <Text style={styles.bookButtonText}>Κράτηση Τώρα</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.occupiedBadge}><Text style={styles.occupiedText}>Κλεισμένη ❌</Text></View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Νέα Κράτηση 🏖️</Text>
      
      <View style={styles.rowInputs}>
        <View style={{flex: 1, marginRight: 5}}>
          <Text style={styles.label}>Ημερομηνία</Text>
          <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="ΕΕΕΕ-ΜΜ-ΗΗ" />
        </View>
      </View>
      
      {/* 2η Γραμμή: Ώρες */}
      <View style={styles.rowInputs}>
        <View style={{flex: 1, marginRight: 5}}>
          <Text style={styles.label}>Ώρα Άφιξης</Text>
          <TextInput style={styles.input} value={arrivalTime} onChangeText={setArrivalTime} placeholder="10:00" />
        </View>
        <View style={{flex: 1, marginLeft: 5}}>
          <Text style={styles.label}>Ώρα Αναχώρησης</Text>
          <TextInput style={styles.input} value={leaveTime} onChangeText={setLeaveTime} placeholder="18:00" />
        </View>
      </View>

      <Text style={styles.label}>Επίλεξε Παραλία</Text>
      <View style={styles.beachesContainer}>
        {beaches.map(beach => (
          <TouchableOpacity key={beach.id} style={[styles.beachButton, selectedBeach === beach.id && styles.beachButtonActive]} onPress={() => setSelectedBeach(beach.id)}>
            <Text style={[styles.beachButtonText, selectedBeach === beach.id && {color: 'white'}]}>{beach.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.submitButton} onPress={handleSearch}>
        <Text style={styles.submitButtonText}>🔍 Υποβολή / Αναζήτηση</Text>
      </TouchableOpacity>

      {searched && <Text style={styles.label}>Διαθέσιμες Ξαπλώστρες</Text>}
      {loading ? <ActivityIndicator size="large" color="#00ACC1" /> : (searched && (
          <FlatList data={sunbeds} keyExtractor={(item) => item.id.toString()} renderItem={renderSunbed} contentContainerStyle={{ paddingBottom: 20 }}/>
      ))}

      <TouchableOpacity style={styles.backButton} onPress={() => router.replace({ pathname: '/(tabs)/home', params: { token: token, role: role || 'user' } })}>
        <Text style={styles.backButtonText}>⬅️ Πίσω στο Μενού</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', padding: 20, paddingTop: 50 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#006064', marginBottom: 20, textAlign: 'center' },
  label: { fontSize: 14, fontWeight: 'bold', color: '#00838F', marginBottom: 5, marginTop: 10 },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  input: { backgroundColor: 'white', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#B2EBF2' },
  beachesContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 },
  beachButton: { backgroundColor: 'white', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#00ACC1' },
  beachButtonActive: { backgroundColor: '#00ACC1' },
  beachButtonText: { color: '#00ACC1', fontWeight: 'bold' },
  submitButton: { backgroundColor: '#FF9800', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 20, elevation: 3 },
  submitButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  sunbedCard: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 10, borderWidth: 2, elevation: 2 },
  sunbedInfo: { fontSize: 16, fontWeight: 'bold' },
  sunbedPrice: { fontSize: 14, color: '#555', marginBottom: 10 },
  bookButton: { backgroundColor: '#4CAF50', padding: 10, borderRadius: 8, alignItems: 'center' },
  bookButtonText: { color: 'white', fontWeight: 'bold' },
  occupiedBadge: { backgroundColor: '#FFEBEE', padding: 10, borderRadius: 8, alignItems: 'center' },
  occupiedText: { color: '#D32F2F', fontWeight: 'bold' },
  backButton: { backgroundColor: '#757575', padding: 15, borderRadius: 10, marginTop: 10, alignItems: 'center' },
  backButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});