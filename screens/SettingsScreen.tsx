import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert } from 'react-native';
import { supabase } from '../supabase'; // Ensure this path is correct for your project
import { Ionicons } from '@expo/vector-icons';

export default function SettingsScreen({ route, navigation }: any) {
  // Grab the data passed from the Campaigns screen
  const { userId, currentName } = route.params || {};
  
  const [newName, setNewName] = useState(currentName || '');
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  const handleUpdateName = async () => {
    if (!newName.trim() || !userId) return;
    setIsUpdatingName(true);

    try {
      const { error } = await supabase
        .from('users') 
        .update({ display_name: newName.trim() })
        .eq('id', userId);

      if (error) throw error;

      Alert.alert("Success", "Username updated successfully!");
      
      // Navigate back to the previous screen
      navigation.navigate({
        name: 'Campaigns', // Make sure this matches the exact name in your App.tsx / Stack Navigator!
        params: { updatedUserName: newName.trim() },
        merge: true,
      });

    } catch (error) {
      console.error("Error updating name:", error);
      Alert.alert("Error", "Failed to update name.");
    } finally {
      setIsUpdatingName(false);
    }
  };

  return (
    <View style={styles.container}>
      
      {/* Header with Back Button */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 5, marginRight: 15 }}>
          <Ionicons name="arrow-back" size={28} color="#BB86FC" />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Edit Username</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Enter new display name"
          placeholderTextColor="#666"
          value={newName}
          onChangeText={setNewName}
          maxLength={20} 
        />

        <TouchableOpacity 
          style={[styles.saveButton, (isUpdatingName || !newName.trim()) && { opacity: 0.5 }]} 
          onPress={handleUpdateName}
          disabled={isUpdatingName || !newName.trim() || newName === currentName}
        >
          <Text style={styles.saveButtonText}>
            {isUpdatingName ? 'Saving...' : 'Save Changes'}
          </Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 60 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  card: {
    backgroundColor: '#1e1e1e',
    padding: 20,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  label: { color: '#BB86FC', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  input: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    color: '#fff',
    fontSize: 18,
    padding: 15,
    marginBottom: 20,
  },
  saveButton: {
    backgroundColor: '#BB86FC',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
});