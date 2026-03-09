import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

export default function CreateBoardScreen({ navigation }: any) {
  const [campaignName, setCampaignName] = useState('');
  const [eventName, setEventName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function generateJoinCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async function handleCreateBoard() {
    if (!campaignName.trim() || !eventName.trim()) {
      return Alert.alert('Missing Info', 'Please fill out both fields.');
    }

    setIsSubmitting(true);
    try {
      const userId = await AsyncStorage.getItem('userId');
      if (!userId) throw new Error("Could not find your User ID.");

      // GENERATE THE ROOM CODE
      const newJoinCode = generateJoinCode();

      // 1. Create the Campaign (Now with join_code!)
      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .insert([{ 
          name: campaignName, 
          host_id: userId, 
          bankroll_type: 'upfront',
          join_code: newJoinCode // <-- NEW FIELD SAVED TO DB
        }])
        .select()
        .single();

      if (campaignError) throw campaignError;

      // 2. Create the first "Live" Sub-Event for this Campaign
      const { error: eventError } = await supabase
        .from('events')
        .insert([{ 
          campaign_id: campaignData.id, 
          name: eventName, 
          status: 'live' 
        }]);

      if (eventError) throw eventError;

      // 3. Add the creator to the participants table as the 'host'
      const { error: participantError } = await supabase
        .from('campaign_participants')
        .insert([{ 
          user_id: userId, 
          campaign_id: campaignData.id, 
          role: 'host', 
          global_point_balance: 10000 
        }]);

      if (participantError) throw participantError;

      // 4. Save to phone memory and navigate to the Dashboard
      await AsyncStorage.setItem('campaignId', campaignData.id);
      await AsyncStorage.setItem('campaignName', campaignData.name);

      Alert.alert('Success!', `Your board is live. Room Code: ${newJoinCode}`);
      navigation.reset({ index: 0, routes: [{ name: 'Dashboard' }] });

    } catch (error: any) {
      Alert.alert('Error creating board', error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Host a New Game</Text>
      <Text style={styles.subtitle}>Set up the board for your crew.</Text>

      <Text style={styles.label}>Campaign Name (The Overall Trip/Party)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., Illenium Concert Crew"
        placeholderTextColor="#666"
        value={campaignName}
        onChangeText={setCampaignName}
      />

      <Text style={styles.label}>First Event Name (What's happening right now?)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g., The Pre-Game"
        placeholderTextColor="#666"
        value={eventName}
        onChangeText={setEventName}
      />

      <TouchableOpacity 
        style={[styles.button, isSubmitting && { opacity: 0.7 }]} 
        onPress={handleCreateBoard}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>Launch Board</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20, paddingTop: 40 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#FFD700', marginBottom: 5 },
  subtitle: { fontSize: 16, color: '#a0a0a0', marginBottom: 40 },
  label: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  input: { height: 50, backgroundColor: '#1e1e1e', color: '#fff', borderRadius: 8, paddingHorizontal: 15, marginBottom: 25, borderWidth: 1, borderColor: '#333' },
  button: { height: 55, backgroundColor: '#FFD700', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  buttonText: { fontSize: 18, fontWeight: 'bold', color: '#000' }
});