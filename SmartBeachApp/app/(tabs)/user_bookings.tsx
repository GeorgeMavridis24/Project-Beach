import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Booking = {
  booking_id: number;
  res_date: string;
  sunbed_id: number;
  beach_name: string;
  price: string;
  type: string;
};

export default function UserBookingsScreen() {
  const router = useRouter();
  const { token, role } = useLocalSearchParams();
  
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchMyBookings();
  }, []);

  const fetchMyBookings = async () => {
    setLoading(true);
    try {
      const response = await fetch('Your Ip/my_bookings', {
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

  const cancelMyBooking = async (bookingId: number) => {
    Alert.alert(
      "Ακύρωση Κράτησης",
      "Είσαι σίγουρος ότι θέλεις να ακυρώσεις αυτή την κράτηση;",
      [
        { text: "Όχι", style: "cancel" },
        { 
          text: "Ναι, Ακύρωση", 
          style: "destructive",
          onPress: async () => {
            try {
              const response = await fetch(`Your Ip/my_bookings/${bookingId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              const data = await response.json();
              
              if (data.status === 'success') {
                alert("Η κράτηση σου ακυρώθηκε!");
                fetchMyBookings(); // Ανανέωση της λίστας
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
      <Text style={styles.detailText}>📅 Ημερομηνία: <Text style={{fontWeight: 'bold'}}>{item.res_date}</Text></Text>
      <Text style={styles.detailText}>🪑 Ξαπλώστρα No: {item.sunbed_id} ({item.type === 'premium' ? 'VIP' : 'Κανονική'})</Text>
      <Text style={styles.priceText}>Κόστος: {item.price}€</Text>
      
      <TouchableOpacity style={styles.deleteBtn} onPress={() => cancelMyBooking(item.booking_id)}>
        <Text style={styles.deleteBtnText}>❌ Ακύρωση Κράτησης</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Το Ιστορικό μου 📋</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#00ACC1" />
      ) : (
        <FlatList 
          data={bookings}
          keyExtractor={(item) => item.booking_id.toString()}
          renderItem={renderBooking}
          ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20, color: '#555'}}>Δεν έχεις καμία ενεργή κράτηση.</Text>}
          refreshing={loading}
          onRefresh={fetchMyBookings}
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
  container: { flex: 1, backgroundColor: '#E0F7FA', padding: 20, paddingTop: 50 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#00838F', marginBottom: 20, textAlign: 'center' },
  bookingCard: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#B2EBF2', elevation: 2 },
  beachName: { fontSize: 18, fontWeight: 'bold', color: '#00ACC1', marginBottom: 10 },
  detailText: { fontSize: 15, marginBottom: 5, color: '#333' },
  priceText: { fontSize: 15, fontWeight: 'bold', color: '#4CAF50', marginTop: 5 },
  deleteBtn: { backgroundColor: '#F44336', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  deleteBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  backButton: { backgroundColor: '#757575', padding: 15, borderRadius: 10, marginTop: 10, alignItems: 'center' },
  backButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});