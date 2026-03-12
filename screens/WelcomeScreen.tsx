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
import { supabase } from '../supabase'; // Make sure this path is correct!
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function WelcomeScreen({ navigation }: any) {
  const [step, setStep] = useState<1 | 2>(1); // 1 = Room Code, 2 = Display Name
  const [roomCode, setRoomCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [validCampaign, setValidCampaign] = useState<any>(null);

  // --- STEP 1: Verify the Code Exists ---
  const handleVerifyCode = async () => {
    if (roomCode.length !== 6) return;
    setIsLoading(true);

    try {
      const cleanCode = roomCode.trim().toUpperCase();
      
      const { data: campaign, error } = await supabase
        .from('campaigns')
        .select('id, name, status')
        .eq('join_code', cleanCode)
        .single();

      if (error || !campaign) throw new Error("Room not found. Double check the code!");
      if (campaign.status === 'closed') throw new Error("This game has already ended.");

      // If valid, save the campaign data temporarily and move to Step 2
      setValidCampaign(campaign);
      setStep(2); 

    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // --- STEP 2: Create Anonymous User & Join ---
  const handleJoinAsGuest = async () => {
    if (!displayName.trim() || !validCampaign) return;
    setIsLoading(true);

    try {
      // 1. Authenticate Anonymously with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
      if (authError) throw authError;

      const newUserId = authData.user?.id;
      if (!newUserId) throw new Error("Failed to generate user ID.");

      // 2. Add their name to your public 'users' table
      const { error: userError } = await supabase
        .from('users')
        .upsert({ id: newUserId, display_name: displayName.trim() });
      if (userError) throw userError;

      // 3. Add them to the campaign with their starting bankroll
      const { error: joinError } = await supabase
        .from('campaign_participants')
        .insert({
          campaign_id: validCampaign.id,
          user_id: newUserId,
          role: 'guest',
          global_point_balance: 10000
        });
      if (joinError) throw joinError;

      // 4. Save credentials to phone memory so they stay logged in
      await AsyncStorage.setItem('userId', newUserId);
      await AsyncStorage.setItem('userName', displayName.trim());
      await AsyncStorage.setItem('campaignId', validCampaign.id);
      await AsyncStorage.setItem('campaignName', validCampaign.name);

      // 5. Route them to the Dashboard!
      navigation.navigate('Dashboard', { userName: displayName.trim(), campaignName: validCampaign.name });

    } catch (error: any) {
      console.error(error);
      Alert.alert("Join Failed", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleHostGame = () => {
    navigation.navigate('HostAuth'); 
  };

  return (
   <KeyboardAvoidingView 
  style={styles.container} 
  // 🚨 THE FIX: iOS gets padding, Android gets 'undefined' so it relies on the OS
  behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
>
  <ScrollView 
    // 🚨 Bonus fix: Ensures tapping anywhere outside the text box instantly closes the keyboard
    keyboardShouldPersistTaps="handled" 
    contentContainerStyle={{ flexGrow: 1 }}
  >
        <View style={styles.innerContainer}>

          <View style={styles.heroSection}>
            <Text style={styles.logoText}>🎟️ THE SOCIAL BOOKIE</Text>
            <Text style={styles.heroTitle}>Enter the Action.</Text>
            <Text style={styles.heroSubtitle}>No sign-up required to play.</Text>
          </View>

          {/* --- DYNAMIC GUEST ZONE --- */}
          <View style={styles.guestZone}>
            
            {step === 1 ? (
              // STEP 1 UI: THE ROOM CODE
              <>
                <Text style={styles.inputLabel}>Got a room code?</Text>
                <TextInput
                  style={styles.codeInput}
                  placeholder="X C Q - 9 9 3"
                  placeholderTextColor="#444"
                  autoCapitalize="characters"
                  maxLength={6}
                  value={roomCode}
                  onChangeText={(text) => setRoomCode(text.toUpperCase())}
                />
                <TouchableOpacity 
                  style={[styles.joinButton, roomCode.length === 6 && !isLoading ? styles.joinButtonActive : styles.joinButtonInactive]}
                  onPress={handleVerifyCode}
                  disabled={roomCode.length !== 6 || isLoading}
                >
                  <Text style={styles.joinButtonText}>{isLoading ? 'SEARCHING...' : 'NEXT 🟢'}</Text>
                </TouchableOpacity>
              </>
            ) : (
              // STEP 2 UI: THE DISPLAY NAME
              <>
                <Text style={styles.inputLabel}>Choose a Display Name</Text>
                <TextInput
                  style={[styles.codeInput, { letterSpacing: 2, fontSize: 22 }]}
                  placeholder="e.g. Maverick"
                  placeholderTextColor="#444"
                  maxLength={15}
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoFocus={true} // Pops the keyboard up immediately
                />
                <TouchableOpacity 
                  style={[styles.joinButton, displayName.trim().length > 1 && !isLoading ? styles.joinButtonActive : styles.joinButtonInactive]}
                  onPress={handleJoinAsGuest}
                  disabled={displayName.trim().length < 2 || isLoading}
                >
                  <Text style={styles.joinButtonText}>{isLoading ? 'JOINING...' : 'JOIN GAME 🟢'}</Text>
                </TouchableOpacity>
                
                {/* A little back button just in case they typed the wrong code */}
                <TouchableOpacity style={{ marginTop: 15, alignItems: 'center' }} onPress={() => setStep(1)} disabled={isLoading}>
                  <Text style={{ color: '#666' }}>← Back</Text>
                </TouchableOpacity>
              </>
            )}

          </View>

          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.hostZone}>
            <Text style={styles.hostSubtitle}>Want to run your own board?</Text>
            <TouchableOpacity style={styles.hostButton} onPress={handleHostGame}>
              <Text style={styles.hostButtonText}>👑 Host a New Game</Text>
            </TouchableOpacity>

          {/* 🚨 ADD THIS NEW LOGIN LINK 🚨 */}
          <TouchableOpacity 
            style={{ marginTop: 25, alignItems: 'center', padding: 10 }} 
            // We pass a parameter to tell the Auth screen to start in "Login" mode
            onPress={() => navigation.navigate('HostAuth', { startInLogin: true })}
          >
            <Text style={{ color: '#a0a0a0', fontSize: 14 }}>
              Already have an account? <Text style={{ color: '#BB86FC', fontWeight: 'bold' }}>Log In</Text>
            </Text>
          </TouchableOpacity>
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Keep the exact same styles as before!
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  innerContainer: { 
    flex: 1, 
    paddingHorizontal: 25, 
    justifyContent: 'center',
    paddingVertical: 40 // Adds breathing room at top/bottom for smaller screens
  },
  heroSection: { alignItems: 'center', marginBottom: 40, marginTop: 20 },
  logoText: { fontSize: 24, color: '#00D084', marginBottom: 20, letterSpacing: 2, fontWeight: '900' },
  heroTitle: { fontSize: 36, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  heroSubtitle: { fontSize: 16, color: '#a0a0a0' },
  guestZone: { backgroundColor: '#1e1e1e', padding: 25, borderRadius: 16, borderWidth: 1, borderColor: '#333', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 },
  inputLabel: { color: '#00D084', fontSize: 14, fontWeight: 'bold', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  codeInput: { backgroundColor: '#121212', borderWidth: 1, borderColor: '#444', borderRadius: 10, color: '#fff', fontSize: 28, fontWeight: 'bold', textAlign: 'center', paddingVertical: 15, marginBottom: 20, letterSpacing: 8 },
  joinButton: { paddingVertical: 18, borderRadius: 10, alignItems: 'center' },
  joinButtonActive: { backgroundColor: '#00D084' },
  joinButtonInactive: { backgroundColor: '#2a2a2a' },
  joinButtonText: { color: '#000', fontSize: 18, fontWeight: 'bold', letterSpacing: 1 },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 40 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#333' },
  dividerText: { color: '#666', paddingHorizontal: 15, fontWeight: 'bold' },
  hostZone: { alignItems: 'center' },
  hostSubtitle: { color: '#a0a0a0', fontSize: 16, marginBottom: 15 },
  hostButton: { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#BB86FC', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 10, width: '100%', alignItems: 'center', marginBottom: 20 },
  hostButtonText: { color: '#BB86FC', fontSize: 18, fontWeight: 'bold' },
  loginLink: { padding: 10 },
  loginLinkText: { color: '#a0a0a0', fontSize: 14 },
});