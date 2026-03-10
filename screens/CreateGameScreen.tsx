import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  ScrollView,
  Alert
} from 'react-native';

export default function CreateGameScreen({ navigation }: any) {
  const [gameName, setGameName] = useState('');
  const [startingBankroll, setStartingBankroll] = useState('10000');
  const [isLoading, setIsLoading] = useState(false);

  // Helper function to generate a random 6-character alphanumeric code
  const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Formats it like "ABC - 123" just for visual display if we wanted, 
    // but we will save it raw as "ABC123"
    return result;
  };

  const handleCreateGame = async () => {
    if (!gameName.trim()) {
      Alert.alert("Hold up", "Give your game a name first!");
      return;
    }

    setIsLoading(true);
    const newCode = generateRoomCode();

    try {
      // 🚨 SUPABASE LOGIC WILL GO HERE 🚨
      // 1. Create the Campaign in the database with `newCode`
      // 2. Add the current user as a 'host'
      // 3. Navigate to Dashboard
      
      console.log("Creating Game:", gameName, "with Code:", newCode);
      
      // Temporary navigation for testing the UI
      // navigation.navigate('Dashboard', { campaignName: gameName, role: 'host' });

    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.innerContainer} keyboardShouldPersistTaps="handled">
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Host a Game</Text>
          <View style={{ width: 60 }} /> {/* Spacer to center the title */}
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.iconTitle}>👑</Text>
          <Text style={styles.title}>Set the Stage</Text>
          <Text style={styles.subtitle}>Name your room and set the starting bankroll for your players.</Text>

          {/* Game Name Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Game Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. UFC 300 Watch Party"
              placeholderTextColor="#555"
              value={gameName}
              onChangeText={setGameName}
              maxLength={30}
            />
          </View>

          {/* Starting Bankroll Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Starting Points (Per Player)</Text>
            <TextInput
              style={styles.input}
              placeholder="10000"
              placeholderTextColor="#555"
              value={startingBankroll}
              onChangeText={setStartingBankroll}
              keyboardType="numeric"
              maxLength={7}
            />
          </View>

          {/* Create Button */}
          <TouchableOpacity 
            style={[styles.createButton, !gameName.trim() ? styles.buttonDisabled : null]}
            onPress={handleCreateGame}
            disabled={!gameName.trim() || isLoading}
          >
            <Text style={styles.createButtonText}>
              {isLoading ? 'GENERATING...' : 'GENERATE ROOM CODE'}
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  innerContainer: { flexGrow: 1, padding: 25 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, marginBottom: 30 },
  backButton: { padding: 10, marginLeft: -10 },
  backText: { color: '#BB86FC', fontSize: 16, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  formContainer: { flex: 1, justifyContent: 'center', paddingBottom: 50 },
  iconTitle: { fontSize: 50, textAlign: 'center', marginBottom: 10 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#a0a0a0', textAlign: 'center', marginBottom: 40, paddingHorizontal: 20 },
  inputGroup: { marginBottom: 25 },
  label: { color: '#BB86FC', fontSize: 14, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  input: { backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333', borderRadius: 10, color: '#fff', fontSize: 18, padding: 15 },
  createButton: { backgroundColor: '#BB86FC', padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 20, shadowColor: '#BB86FC', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 },
  buttonDisabled: { backgroundColor: '#2a2a2a', shadowOpacity: 0 },
  createButtonText: { color: '#000', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
});