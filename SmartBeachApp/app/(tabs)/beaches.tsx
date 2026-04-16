import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Beach = { id: number; name: string; description: string; ltd: number; lgd: number };

export default function BeachesScreen() {
  const router = useRouter();
  const { token, role } = useLocalSearchParams();

  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [loading, setLoading] = useState(false);

  // States για την επεξεργασία (Admin)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editLtd, setEditLtd] = useState('');
  const [editLgd, setEditLgd] = useState('');

  // States για την Προσθήκη Νέας Παραλίας (Admin)
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchBeaches();
  }, []);

  const fetchBeaches = async () => {
    setLoading(true);
    try {
      const response = await fetch('Your Ip/beaches');
      const data = await response.json();
      setBeaches(data);
    } catch (error) {
      alert("Σφάλμα φόρτωσης παραλιών.");
    } finally {
      setLoading(false);
    }
  };

  // ---- ΛΕΙΤΟΥΡΓΙΕΣ ADMIN ----
  const handleSaveEdit = async (id: number) => {
    try {
      const response = await fetch(`Your Ip/admin/beaches/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: editName, description: editDesc, ltd: parseFloat(editLtd) || 0, lgd: parseFloat(editLgd) || 0 })
      });
      const data = await response.json();
      if (data.status === 'success') {
        alert(data.message);
        setEditingId(null);
        fetchBeaches();
      } else alert("Σφάλμα: " + data.message);
    } catch (error) { alert("Σφάλμα δικτύου!"); }
  };

  const handleAddNew = async () => {
    try {
      const response = await fetch(`Your Ip/admin/beaches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: editName, description: editDesc, ltd: parseFloat(editLtd) || 0, lgd: parseFloat(editLgd) || 0 })
      });
      const data = await response.json();
      if (data.status === 'success') {
        alert(data.message);
        setIsAdding(false);
        fetchBeaches();
      } else alert("Σφάλμα: " + data.message);
    } catch (error) { alert("Σφάλμα δικτύου!"); }
  };

  const startEditing = (beach: Beach) => {
    setEditingId(beach.id);
    setEditName(beach.name);
    setEditDesc(beach.description);
    setEditLtd(beach.ltd.toString());
    setEditLgd(beach.lgd.toString());
    setIsAdding(false);
  };

  const startAdding = () => {
    setIsAdding(true); setEditingId(null);
    setEditName(''); setEditDesc(''); setEditLtd(''); setEditLgd('');
  };

  const renderBeach = ({ item }: { item: Beach }) => {
    // Αν ο admin έχει πατήσει επεξεργασία ΣΕ ΑΥΤΗ την παραλία, δείξε φόρμα
    if (editingId === item.id) {
      return (
        <View style={styles.beachCard}>
          <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Όνομα Παραλίας" />
          <TextInput style={styles.input} value={editDesc} onChangeText={setEditDesc} placeholder="Περιγραφή" multiline />
          <TextInput style={styles.input} value={editLtd} onChangeText={setEditLtd} placeholder="Γεωγρ. Πλάτος (Lat)" keyboardType="numeric" />
          <TextInput style={styles.input} value={editLgd} onChangeText={setEditLgd} placeholder="Γεωγρ. Μήκος (Lng)" keyboardType="numeric" />
          
          <View style={styles.row}>
            <TouchableOpacity style={styles.saveBtn} onPress={() => handleSaveEdit(item.id)}><Text style={styles.btnText}>💾 Αποθήκευση</Text></TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingId(null)}><Text style={styles.btnText}>❌ Ακύρωση</Text></TouchableOpacity>
          </View>
        </View>
      );
    }

    // Κανονική προβολή παραλίας (Για Users & Admins)
    return (
      <View style={styles.beachCard}>
        <Text style={styles.beachName}>🏖️ {item.name}</Text>
        <Text style={styles.beachDesc}>{item.description}</Text>
        {role === 'admin' && (
          <TouchableOpacity style={styles.editBtn} onPress={() => startEditing(item)}>
            <Text style={styles.btnText}>✏️ Επεξεργασία</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Οι Παραλίες μας 🌊</Text>

      {/* Φόρμα Προσθήκης Νέας Παραλίας (Μόνο Admin) */}
      {role === 'admin' && !isAdding && (
        <TouchableOpacity style={styles.addBtn} onPress={startAdding}>
          <Text style={styles.btnText}>➕ Προσθήκη Νέας Παραλίας</Text>
        </TouchableOpacity>
      )}

      {isAdding && (
        <View style={[styles.beachCard, { borderColor: '#4CAF50', borderWidth: 2 }]}>
          <Text style={styles.beachName}>Νέα Παραλία ✨</Text>
          <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Όνομα Παραλίας" />
          <TextInput style={styles.input} value={editDesc} onChangeText={setEditDesc} placeholder="Περιγραφή" multiline />
          <TextInput style={styles.input} value={editLtd} onChangeText={setEditLtd} placeholder="Γεωγρ. Πλάτος (Lat)" keyboardType="numeric" />
          <TextInput style={styles.input} value={editLgd} onChangeText={setEditLgd} placeholder="Γεωγρ. Μήκος (Lng)" keyboardType="numeric" />
          <View style={styles.row}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleAddNew}><Text style={styles.btnText}>💾 Προσθήκη</Text></TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsAdding(false)}><Text style={styles.btnText}>❌ Ακύρωση</Text></TouchableOpacity>
          </View>
        </View>
      )}

      {loading ? <ActivityIndicator size="large" color="#00ACC1" /> : (
        <FlatList data={beaches} keyExtractor={(item) => item.id.toString()} renderItem={renderBeach} />
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
  container: { flex: 1, backgroundColor: '#F5F5F5', padding: 20, paddingTop: 50 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#006064', marginBottom: 20, textAlign: 'center' },
  beachCard: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 3 },
  beachName: { fontSize: 20, fontWeight: 'bold', color: '#00838F', marginBottom: 5 },
  beachDesc: { fontSize: 15, color: '#555', marginBottom: 10 },
  input: { backgroundColor: '#F0F8FF', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#B2EBF2', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  editBtn: { backgroundColor: '#FFB300', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  addBtn: { backgroundColor: '#4CAF50', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 20 },
  saveBtn: { backgroundColor: '#4CAF50', padding: 10, borderRadius: 8, flex: 1, marginRight: 5, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#F44336', padding: 10, borderRadius: 8, flex: 1, marginLeft: 5, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: 'bold' },
  backButton: { backgroundColor: '#757575', padding: 15, borderRadius: 10, marginTop: 10, alignItems: 'center' },
  backButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});