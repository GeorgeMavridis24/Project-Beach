import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type User = {
  id: number;
  username: string;
  email: string;
  role: string;
};

export default function AdminUsersScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  // Βελτιωμένη συνάρτηση που τραβάει τους χρήστες
  const fetchUsers = async () => {
    setLoading(true); // Δείχνουμε το κυκλάκι φόρτωσης
    try {
      const response = await fetch('Your Ip/admin/users', {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        }
      });
      const data = await response.json();

      if (data.status === 'success') {
        setUsers(data.data);
      } else {
        alert("Σφάλμα: " + data.message);
      }
    } catch (error) {
      alert("Σφάλμα σύνδεσης με τον server.");
    } finally {
      setLoading(false); // Κρύβουμε το κυκλάκι
    }
  };

  const changeRole = async (user: User, newRole: string) => {
    try {
      const response = await fetch(`Your Ip/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          username: user.username,
          email: user.email,
          role: newRole 
        })
      });
      const data = await response.json();
      
      if (data.status === 'success') {
        alert(data.message);
        fetchUsers(); // Ανανεώνει τη λίστα αυτόματα
      } else {
        alert("Σφάλμα: " + data.message);
      }
    } catch (error) {
      alert("Σφάλμα Δικτύου!");
    }
  };

  const renderUser = ({ item }: { item: User }) => (
    <View style={styles.userCard}>
      <Text style={styles.userName}>👤 {item.username}</Text>
      <Text style={styles.userInfo}>📧 {item.email}</Text>
      <Text style={[styles.userRole, { color: item.role === 'admin' ? '#D32F2F' : '#00796B' }]}>
        Ρόλος: {item.role.toUpperCase()}
      </Text>
      
      <View style={styles.buttonRow}>
        {item.role === 'user' ? (
          <TouchableOpacity 
            style={[styles.roleButton, { backgroundColor: '#D32F2F' }]} 
            onPress={() => changeRole(item, 'admin')}
          >
            <Text style={styles.roleButtonText}>⬆️ Κάνε Admin</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.roleButton, { backgroundColor: '#00796B' }]} 
            onPress={() => changeRole(item, 'user')}
          >
            <Text style={styles.roleButtonText}>⬇️ Κάνε User</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Λίστα Χρηστών</Text>
      <Text style={styles.hint}>Σύρε προς τα κάτω για ανανέωση ⬇️</Text>
      
      <FlatList 
        data={users}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderUser}
        contentContainerStyle={{ paddingBottom: 20 }}
        // ΠΡΟΣΘΗΚΗ: Pull to refresh!
        refreshing={loading}
        onRefresh={fetchUsers}
      />

      {/* ΠΡΟΣΘΗΚΗ: Το κουμπί πίσω σε πάει ΣΙΓΟΥΡΑ στο Home ως Admin */}
     
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => router.replace({ pathname: '/(tabs)/home', params: { role: 'admin', token: token } })}
      >
        <Text style={styles.backButtonText}>⬅️ Πίσω στο Μενού</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', padding: 20, paddingTop: 50 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#006064', marginBottom: 5, textAlign: 'center' },
  hint: { fontSize: 12, color: '#757575', textAlign: 'center', marginBottom: 15 },
  userCard: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 3 },
  userName: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  userInfo: { fontSize: 15, color: '#555', marginBottom: 5 },
  userRole: { fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
  buttonRow: { flexDirection: 'row', marginTop: 10 },
  roleButton: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 5 },
  roleButtonText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  backButton: { backgroundColor: '#757575', padding: 15, borderRadius: 10, marginTop: 10, alignItems: 'center' },
  backButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});