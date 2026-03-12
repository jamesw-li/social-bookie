import React, { useState } from 'react';
import { supabase } from '../supabase'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  const [eventName, setEventName] = useState('');
  const [startingBankroll, setStartingBankroll] = useState('10000');
  const [isLoading, setIsLoading] = useState(false);

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleCreateGame = async () => {
    if (!gameName.trim() || !eventName.trim()) {
      return Alert.alert("Hold up", "Please fill out the game and event names.");
    }

    setIsLoading(true);
    const newCode = generateRoomCode();

    try {
      const hostId = await AsyncStorage.getItem('userId');
      const hostName = await AsyncStorage.getItem('userName');
      
      if (!hostId) throw new Error("We couldn't find your Host ID. Try logging in again.");

      // 1. Create the Campaign (WITH HOST ID!)
      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .insert([{
          name: gameName.trim(),
          join_code: newCode,
          host_id: hostId, // 🚨 The missing piece!
          status: 'active'
        }])
        .select().single();

      if (campaignError) throw campaignError;

      // 2. Create the critical First Event
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .insert([{ 
          campaign_id: campaignData.id, 
          name: eventName.trim(), 
          status: 'live' // 🚨 Wakes up the Host Dashboard!
        }])
        .select().single();

      if (eventError) throw eventError;

      // 3. Add YOU as the Host with custom bankroll
      const { error: participantError } = await supabase
        .from('campaign_participants')
        .insert([{
          campaign_id: campaignData.id,
          user_id: hostId,
          role: 'host', 
          global_point_balance: parseInt(startingBankroll) || 10000
        }]);

      if (participantError) throw participantError;

      // 4. Save ALL IDs to phone memory
      await AsyncStorage.setItem('campaignId', campaignData.id);
      await AsyncStorage.setItem('campaignName', campaignData.name);
      await AsyncStorage.setItem('activeEventId', eventData.id); // 🚨 Helps the dashboard load instantly

      // 5. Blast off!
      Alert.alert('Success!', `Your board is live. Room Code: ${newCode}`);
      
      // Using reset ensures they can't "swipe back" to the creation screen
      navigation.reset({
        index: 0,
        routes: [{ 
          name: 'Dashboard', 
          params: { userName: hostName || 'Host', campaignName: campaignData.name } 
        }],
      });

    } catch (error: any) {
      console.error(error);
      Alert.alert("Error Creating Game", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.innerContainer} keyboardShouldPersistTaps="handled">
        
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Host a Game</Text>
          <View style={{ width: 60 }} /> 
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.iconTitle}>👑</Text>
          <Text style={styles.title}>Set the Stage</Text>
          <Text style={styles.subtitle}>Set up the board for your crew.</Text>

          {/* Campaign Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Campaign Name (The Trip/Party)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. UFC 300 Watch Party"
              placeholderTextColor="#555"
              value={gameName}
              onChangeText={setGameName}
              maxLength={30}
            />
          </View>

          {/* Event Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>First Event (What's happening right now?)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. The Main Card"
              placeholderTextColor="#555"
              value={eventName}
              onChangeText={setEventName}
              maxLength={30}
            />
          </View>

          {/* Starting Bankroll */}
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
            style={[styles.createButton, (!gameName.trim() || !eventName.trim()) ? styles.buttonDisabled : null]}
            onPress={handleCreateGame}
            disabled={!gameName.trim() || !eventName.trim() || isLoading}
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