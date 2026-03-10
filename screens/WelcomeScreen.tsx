import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';

export default function WelcomeScreen({ navigation }: any) {
  const [roomCode, setRoomCode] = useState('');

  // We will wire this up to Supabase Anonymous Auth in the next step!
  const handleJoinGame = () => {
    if (roomCode.length !== 6) return;
    
    // For now, let's just log it. Later, this will trigger the "Display Name" prompt.
    console.log("Joining Room:", roomCode);
    // navigation.navigate('GuestSetup', { code: roomCode }); 
  };

  const handleHostGame = () => {
    // This will route to the Apple/Google social auth wall
    console.log("Routing to Host Auth...");
    // navigation.navigate('HostAuth');
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.innerContainer}>

          {/* --- 1. THE HERO ZONE --- */}
          <View style={styles.heroSection}>
            <Text style={styles.logoText}>🎟️ THE SOCIAL BOOKIE</Text>
            <Text style={styles.heroTitle}>Enter the Action.</Text>
            <Text style={styles.heroSubtitle}>No sign-up required to play.</Text>
          </View>

          {/* --- 2. THE GUEST DROP ZONE --- */}
          <View style={styles.guestZone}>
            <Text style={styles.inputLabel}>Got a room code?</Text>
            <TextInput
              style={styles.codeInput}
              placeholder="X C Q - 9 9 3"
              placeholderTextColor="#444"
              autoCapitalize="characters"
              maxLength={6}
              value={roomCode}
              onChangeText={(text) => setRoomCode(text.toUpperCase())}
              keyboardType="default" // You could use 'visible-password' to force English keyboard if desired
            />
            
            <TouchableOpacity 
              style={[
                styles.joinButton, 
                roomCode.length === 6 ? styles.joinButtonActive : styles.joinButtonInactive
              ]}
              onPress={handleJoinGame}
              disabled={roomCode.length !== 6}
            >
              <Text style={styles.joinButtonText}>
                {roomCode.length === 6 ? 'JOIN GAME 🟢' : 'ENTER 6 DIGITS'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* --- 3. THE DIVIDER --- */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* --- 4. THE HOST ZONE --- */}
          <View style={styles.hostZone}>
            <Text style={styles.hostSubtitle}>Want to run your own board?</Text>
            
            <TouchableOpacity style={styles.hostButton} onPress={handleHostGame}>
              <Text style={styles.hostButtonText}>👑 Host a New Game</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.loginLink} onPress={() => console.log('Route to Login')}>
              <Text style={styles.loginLinkText}>Already a Host? <Text style={{ color: '#BB86FC', fontWeight: 'bold' }}>Log In</Text></Text>
            </TouchableOpacity>
          </View>

        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  innerContainer: {
    flex: 1,
    paddingHorizontal: 25,
    justifyContent: 'center',
  },
  
  // HERO STYLES
  heroSection: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
  },
  logoText: {
    fontSize: 24,
    color: '#00D084',
    marginBottom: 20,
    letterSpacing: 2,
    fontWeight: '900',
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#a0a0a0',
  },

  // GUEST ZONE STYLES
  guestZone: {
    backgroundColor: '#1e1e1e',
    padding: 25,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  inputLabel: {
    color: '#00D084',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  codeInput: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 10,
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingVertical: 15,
    marginBottom: 20,
    letterSpacing: 8, // Gives that wide, code-like spacing
  },
  joinButton: {
    paddingVertical: 18,
    borderRadius: 10,
    alignItems: 'center',
  },
  joinButtonActive: {
    backgroundColor: '#00D084',
  },
  joinButtonInactive: {
    backgroundColor: '#2a2a2a',
  },
  joinButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },

  // DIVIDER STYLES
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 40,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#333',
  },
  dividerText: {
    color: '#666',
    paddingHorizontal: 15,
    fontWeight: 'bold',
  },

  // HOST ZONE STYLES
  hostZone: {
    alignItems: 'center',
  },
  hostSubtitle: {
    color: '#a0a0a0',
    fontSize: 16,
    marginBottom: 15,
  },
  hostButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#BB86FC',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  hostButtonText: {
    color: '#BB86FC',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loginLink: {
    padding: 10,
  },
  loginLinkText: {
    color: '#a0a0a0',
    fontSize: 14,
  },
});