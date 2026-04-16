import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ImageBackground, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';

export default function IndexScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (email === '' || password === '') {
      alert('Παρακαλώ συμπληρώστε email και κωδικό!');
      return;
    }
    try {
      // ⚠️ ΒΑΛΕ ΤΗΝ IP ΣΟΥ (π.χ. 192.168.1.36)
      const response = await fetch('Your Ip/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: username, 
          email: email, 
          password: password 
        }),
      });
      const data = await response.json();
      
      // --- Η ΑΛΛΑΓΗ ΜΑΣ ΕΙΝΑΙ ΕΔΩ ---
      if (data.status === "success") {
        // Αντί να πάμε απλά στο '/home', στέλνουμε "πακέτο" τον ρόλο και το token!
        router.replace({
          pathname: '/home',
          params: { 
            role: data.role, 
            token: data.access_token 
          }
        }); 
      } else {
        alert("Σφάλμα: " + data.message);
      }
      // -------------------------------

    } catch (error) {
      alert('Σφάλμα Δικτύου!');
    }
  };

  const handleRegister = async () => {
    if (username === '' || email === '' || password === '') {
      alert('Παρακαλώ συμπληρώστε Όνομα, Email και Κωδικό για εγγραφή!');
      return;
    }
    
    try {
      // ⚠️ ΒΑΛΕ ΤΗΝ IP ΣΟΥ (π.χ. 192.168.1.36)
      const response = await fetch('Your Ip/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: username, 
          email: email, 
          password: password 
        }),
      });
      const data = await response.json();
      
      if (data.status === "success") {
         alert("Επιτυχής εγγραφή! Τώρα μπορείς να συνδεθείς.");
         // Καθαρίζουμε τους κωδικούς μετά την εγγραφή για ευκολία
         setPassword('');
      } else {
         alert("Σφάλμα Register: " + JSON.stringify(data)); 
      }
    } catch (error) {
      alert('Σφάλμα Δικτύου!');
    }
  };

  return (
    <ImageBackground 
      source={{ uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1000&auto=format&fit=crop' }} 
      style={styles.container}
    >
      <Text style={styles.title}>🏖️ SmartBeach 🏖️</Text>
      <Text style={styles.subtitle}>Σύνδεση & Εγγραφή</Text>

      <TextInput 
        style={styles.input} 
        placeholder="Γράψε το Όνομα Χρήστη (π.χ. George)" 
        value={username}
        onChangeText={setUsername} 
      />

      <TextInput 
        style={styles.input} 
        placeholder="Γράψε το Email σου" 
        value={email}
        onChangeText={setEmail} 
      />
      
      <TextInput 
        style={styles.input} 
        placeholder="Γράψε τον Κωδικό σου" 
        secureTextEntry={true} 
        value={password}
        onChangeText={setPassword} 
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Είσοδος</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.buttonRegister]} onPress={handleRegister}>
        <Text style={[styles.buttonText, { color: '#00ACC1' }]}>Εγγραφή</Text>
      </TouchableOpacity>

      <StatusBar style="auto" />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#006064', marginBottom: 10, backgroundColor: 'rgba(255, 255, 255, 0.8)', padding: 10, borderRadius: 10, overflow: 'hidden' },
  subtitle: { fontSize: 18, color: '#00838F', marginBottom: 40, backgroundColor: 'rgba(255, 255, 255, 0.7)', paddingVertical: 5, paddingHorizontal: 15, borderRadius: 20, overflow: 'hidden' },
  input: { backgroundColor: 'rgba(255, 255, 255, 0.9)', width: '80%', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#00ACC1' },
  button: { backgroundColor: '#00ACC1', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 25, elevation: 5, marginTop: 10, width: '80%', alignItems: 'center' },
  buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  buttonRegister: { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#00ACC1', marginTop: 15 }
});