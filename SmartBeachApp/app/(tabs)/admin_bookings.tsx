import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Booking = {
  booking_id: number;
  res_date: string;
  username: string;
  sunbed_id: number;
  beach_name: string;
};

export default function AdminBookingsScreen() {
  const router = useRouter();
  const { token, role } = useLocalSearchParams();
  
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const response = await fetch('Your Ip/admin/bookings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.status === 'success') {
        setBookings(data.data);
      } else {
        alert("Σφάλμα: " + data.message);
      }
    } catch (error) {
      alert("Σφάλμα φόρτωσης κρατήσεων.");
    } finally {
      setLoading(false);
    }
  };

  const cancelBooking = async (bookingId: number) => {
    // Βάζουμε μια επιβεβαίωση (Alert) για να μην πατηθεί κατά λάθος!
    Alert.alert(
      "Ακύρωση Κράτησης",
      "Είσαι σίγουρος ότι θέλεις να διαγράψεις αυτή την κράτηση;",
      [
        { text: "Όχι", style: "cancel" },
        { 
          text: "Ναι, Διαγραφή", 
          style: "destructive",
          onPress: async () => {
            try {
              const response = await fetch(`Your Ip/admin/bookings/${bookingId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              const data = await response.json();
              
              if (data.status === 'success') {
                alert(data.message);
                fetchBookings(); // Ανανεώνουμε τη λίστα!
              } else {
                alert("Σφάλμα: " + data.message);
              }
            } catch (error) {
              alert("Σφάλμα Δικτύου!");
            }
          }
        }
      ]
    );
  };

  const renderBooking = ({ item }: { item: Booking }) => (
    <View style={styles.bookingCard}>
      <Text style={styles.beachName}>🏖️ {item.beach_name}</Text>
      <Text style={styles.detailText}>👤 Πελάτης: <Text style={{fontWeight: 'bold'}}>{item.username}</Text></Text>
      <Text style={styles.detailText}>📅 Ημερομηνία: {item.res_date}</Text>
      <Text style={styles.detailText}>🪑 Ξαπλώστρα No: {item.sunbed_id}</Text>
      
      <TouchableOpacity style={styles.deleteBtn} onPress={() => cancelBooking(item.booking_id)}>
        <Text style={styles.deleteBtnText}>❌ Ακύρωση Κράτησης</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Διαχείριση Κρατήσεων 📋</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#E65100" />
      ) : (
        <FlatList 
          data={bookings}
          keyExtractor={(item) => item.booking_id.toString()}
          renderItem={renderBooking}
          ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Δεν υπάρχουν ενεργές κρατήσεις.</Text>}
        />
      )}

      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => router.replace({ pathname: '/(tabs)/home', params: { token: token, role: role || 'user' } })}
      >
        <Text style={styles.backButtonText}>⬅️ Πίσω στο Μενού</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF3E0', padding: 20, paddingTop: 50 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#E65100', marginBottom: 20, textAlign: 'center' },
  bookingCard: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#FFCC80', elevation: 2 },
  beachName: { fontSize: 18, fontWeight: 'bold', color: '#00838F', marginBottom: 10 },
  detailText: { fontSize: 15, marginBottom: 5, color: '#333' },
  deleteBtn: { backgroundColor: '#D32F2F', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  deleteBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  backButton: { backgroundColor: '#757575', padding: 15, borderRadius: 10, marginTop: 10, alignItems: 'center' },
  backButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});