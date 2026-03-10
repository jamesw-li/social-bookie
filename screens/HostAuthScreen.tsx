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
import { supabase } from '../supabase'; // Update path if needed
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function HostAuthScreen({ navigation }: any) {
  const [isLogin, setIsLogin] = useState(true); // Toggles between Login and Sign Up
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hostName, setHostName] = useState(''); // Only used for Sign Up
  const [isLoading, setIsLoading] = useState(false);

  const handleAuthentication = async () => {
    if (!email || !password) {
      Alert.alert("Missing Fields", "Please enter both email and password.");
      return;
    }
    if (!isLogin && !hostName) {
      Alert.alert("Missing Fields", "Please enter a Host Name.");
      return;
    }

    setIsLoading(true);

    try {
      if (isLogin) {
        // --- LOGIN FLOW ---
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });
        if (authError) throw authError;

        const userId = authData.user.id;

        // Fetch their name from your users table
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('display_name')
          .eq('id', userId)
          .single();
        
        if (userError && userError.code !== 'PGRST116') throw userError; // Ignore "no rows found" error just in case

        const displayName = userData?.display_name || 'Host';

        // Save to phone memory
        await AsyncStorage.setItem('userId', userId);
        await AsyncStorage.setItem('userName', displayName);

      } else {
        // --- SIGN UP FLOW ---
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
        });
        if (authError) throw authError;

        const userId = authData.user?.id;
        if (!userId) throw new Error("Failed to create user ID.");

        // Add them to your public users table
        const { error: insertError } = await supabase
          .from('users')
          .upsert({ id: userId, display_name: hostName.trim() });
        if (insertError) throw insertError;

        // Save to phone memory
        await AsyncStorage.setItem('userId', userId);
        await AsyncStorage.setItem('userName', hostName.trim());
      }

      // Success! Route them to the Game Creation screen
      navigation.navigate('CreateGame');

    } catch (error: any) {
      Alert.alert("Authentication Failed", error.message);
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
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.iconTitle}>👑</Text>
          <Text style={styles.title}>{isLogin ? 'Welcome Back' : 'Claim Your Board'}</Text>
          <Text style={styles.subtitle}>
            {isLogin ? 'Log in to manage your active games.' : 'Create a permanent host account.'}
          </Text>

          {/* Host Name Input (Only shows during Sign Up) */}
          {!isLogin && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Host Display Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Commish Dave"
                placeholderTextColor="#555"
                value={hostName}
                onChangeText={setHostName}
                maxLength={20}
              />
            </View>
          )}

          {/* Email Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@email.com"
              placeholderTextColor="#555"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          {/* Password Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#555"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {/* Submit Button */}
          <TouchableOpacity 
            style={[styles.authButton, isLoading ? styles.buttonDisabled : null]}
            onPress={handleAuthentication}
            disabled={isLoading}
          >
            <Text style={styles.authButtonText}>
              {isLoading ? 'PROCESSING...' : (isLogin ? 'LOG IN' : 'CREATE ACCOUNT')}
            </Text>
          </TouchableOpacity>

          {/* Toggle Login/Signup */}
          <TouchableOpacity style={styles.toggleButton} onPress={() => setIsLogin(!isLogin)}>
            <Text style={styles.toggleText}>
              {isLogin ? "Don't have an account? " : "Already a host? "}
              <Text style={styles.toggleTextBold}>{isLogin ? "Sign Up" : "Log In"}</Text>
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
  header: { marginTop: 40, marginBottom: 20 },
  backButton: { padding: 10, marginLeft: -10, alignSelf: 'flex-start' },
  backText: { color: '#BB86FC', fontSize: 16, fontWeight: 'bold' },
  formContainer: { flex: 1, justifyContent: 'center', paddingBottom: 50 },
  iconTitle: { fontSize: 50, textAlign: 'center', marginBottom: 10 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#a0a0a0', textAlign: 'center', marginBottom: 40 },
  inputGroup: { marginBottom: 20 },
  label: { color: '#BB86FC', fontSize: 14, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  input: { backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333', borderRadius: 10, color: '#fff', fontSize: 16, padding: 15 },
  authButton: { backgroundColor: '#BB86FC', padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 10, shadowColor: '#BB86FC', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 },
  buttonDisabled: { backgroundColor: '#2a2a2a', shadowOpacity: 0 },
  authButtonText: { color: '#000', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  toggleButton: { marginTop: 25, alignItems: 'center', padding: 10 },
  toggleText: { color: '#a0a0a0', fontSize: 14 },
  toggleTextBold: { color: '#BB86FC', fontWeight: 'bold' },
});