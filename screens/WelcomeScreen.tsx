import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function WelcomeScreen({ navigation }: any) {
  const [name, setName] = useState('');

  async function joinApp() {
  if (!name.trim()) return Alert.alert('Hold up', 'Please enter a name first.');

  const { data, error } = await supabase
    .from('users')
    .insert([{ display_name: name }])
    .select()
    .single();

  if (error) {
    Alert.alert('Error', error.message);
  } else if (data) {
    // SAVE TO PHONE MEMORY
    await AsyncStorage.setItem('userId', data.id);
    await AsyncStorage.setItem('userName', name);
    
    navigation.navigate('Campaigns', { userId: data.id, userName: name });
  }
}
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to the Board</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., Chris V."
        placeholderTextColor="#666"
        value={name}
        onChangeText={setName}
      />
      <TouchableOpacity style={styles.button} onPress={joinApp}>
        <Text style={styles.buttonText}>Find My Event</Text>
      </TouchableOpacity>
    </View>
  );
}

// Keeping styles compact for the example
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 20, textAlign: 'center' },
  input: { height: 50, backgroundColor: '#1e1e1e', color: '#fff', borderRadius: 8, paddingHorizontal: 15, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  button: { height: 50, backgroundColor: '#00D084', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 18, fontWeight: 'bold', color: '#000' }
});