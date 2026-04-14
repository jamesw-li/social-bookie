import React, { useState, useEffect } from 'react';
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

type AuthMode = 'signIn' | 'signUp' | 'forgotPassword';

export default function HostAuthScreen({ route, navigation }: any) {
  const [authMode, setAuthMode] = useState<AuthMode>(route.params?.startInLogin ? 'signIn' : 'signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hostName, setHostName] = useState(''); // Only used for Sign Up
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (timeLeft > 0) {
      timer = setTimeout(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [timeLeft]);

  const handleAuthentication = async () => {
    if (!email || !password) {
      Alert.alert("Missing Fields", "Please enter both email and password.");
      return;
    }
    if (authMode === 'signUp' && !hostName) {
      Alert.alert("Missing Fields", "Please enter a Host Name.");
      return;
    }

    setIsLoading(true);

    try {
      if (authMode === 'signIn') {
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

      // 🚨 THE NEW ROUTING LOGIC 🚨
      if (authMode === 'signIn') {
        // Returning users (Hosts or upgraded Guests) go to their Campaign list
        navigation.navigate('Campaigns'); 
      } else {
        // Brand new Hosts go straight to creating their first game
        navigation.navigate('CreateGame');
      }

    } catch (error: any) {
      Alert.alert("Authentication Failed", error.message);
      // The Web-Safe Error Popup
      if (Platform.OS === 'web') {
        window.alert(`Authentication Failed: ${error.message}`);
      } else {
        Alert.alert("Authentication Failed", error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!email) {
      Alert.alert("Missing Fields", "Please enter your email.");
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      setIsOtpSent(true);
      setTimeLeft(60);
    } catch (error: any) {
      Alert.alert("Error", error.message);
      if (Platform.OS === 'web') window.alert(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtpAndReset = async () => {
    if (!otp || !password) {
      Alert.alert("Missing Fields", "Please enter the OTP and your new password.");
      return;
    }
    setIsLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: 'recovery'
      });
      if (verifyError) throw verifyError;

      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });
      if (updateError) throw updateError;

      Alert.alert("Success", "Your password has been reset successfully. Please log in.");
      if (Platform.OS === 'web') window.alert("Your password has been reset successfully. Please log in.");
      
      setAuthMode('signIn');
      setIsOtpSent(false);
      setPassword(''); // clear password field
      setOtp('');
    } catch (error: any) {
      Alert.alert("Reset Failed", error.message);
      if (Platform.OS === 'web') window.alert(`Reset Failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getTitle = () => {
    if (authMode === 'signIn') return 'Welcome Back';
    if (authMode === 'signUp') return 'Claim Your Board';
    return 'Reset Password';
  };

  const getSubtitle = () => {
    if (authMode === 'signIn') return 'Log in to manage your active games.';
    if (authMode === 'signUp') return 'Create a permanent host account.';
    if (isOtpSent) return 'Enter the 8-digit code sent to your email.';
    return 'We will send an 8-digit code to your email.';
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: '#121212' }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 20} 
    >
      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 25 }} 
        keyboardShouldPersistTaps="handled"
        bounces={false} 
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.iconTitle}>{authMode === 'forgotPassword' ? '🔒' : '👑'}</Text>
          <Text style={styles.title}>{getTitle()}</Text>
          <Text style={styles.subtitle}>{getSubtitle()}</Text>

          {/* Host Name Input (Only shows during Sign Up) */}
          {authMode === 'signUp' && (
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

          {/* Email Input (shows in all modes, unless OTP is sent in forgotPassword) */}
          {(!isOtpSent || authMode !== 'forgotPassword') && (
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
          )}

          {/* OTP Code Input (only for forgotPassword when OTP is sent) */}
          {(authMode === 'forgotPassword' && isOtpSent) && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>8-Digit Code</Text>
              <TextInput
                style={styles.input}
                placeholder="12345678"
                placeholderTextColor="#555"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={8}
              />
            </View>
          )}

          {/* Password Input (shows for signIn, signUp, and when OTP is sent for resetting) */}
          {(authMode !== 'forgotPassword' || isOtpSent) && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{authMode === 'forgotPassword' ? 'New Password' : 'Password'}</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#555"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>
          )}

          {/* Primary Action Button */}
          {authMode !== 'forgotPassword' ? (
            <TouchableOpacity 
              style={[styles.authButton, isLoading ? styles.buttonDisabled : null]}
              onPress={handleAuthentication}
              disabled={isLoading}
            >
              <Text style={styles.authButtonText}>
                {isLoading ? 'PROCESSING...' : (authMode === 'signIn' ? 'LOG IN' : 'CREATE ACCOUNT')}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.authButton, isLoading ? styles.buttonDisabled : null]}
              onPress={isOtpSent ? handleVerifyOtpAndReset : handleSendOtp}
              disabled={isLoading}
            >
              <Text style={styles.authButtonText}>
                {isLoading ? 'PROCESSING...' : (isOtpSent ? 'RESET PASSWORD' : 'SEND CODE')}
              </Text>
            </TouchableOpacity>
          )}

          {/* Forgot Password Link / Resend Code Timer */}
          {authMode === 'signIn' && (
            <TouchableOpacity style={styles.linkButton} onPress={() => setAuthMode('forgotPassword')}>
              <Text style={styles.linkText}>Forgot Password?</Text>
            </TouchableOpacity>
          )}

          {authMode === 'forgotPassword' && isOtpSent && (
            <TouchableOpacity 
              style={[styles.linkButton, timeLeft > 0 ? { opacity: 0.5 } : null]} 
              onPress={() => timeLeft === 0 && handleSendOtp()}
              disabled={timeLeft > 0 || isLoading}
            >
              <Text style={styles.linkText}>
                {timeLeft > 0 ? `Resend Code in ${timeLeft}s` : 'Resend Code'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Toggle Login/Signup / Back to Login */}
          {authMode !== 'forgotPassword' ? (
            <TouchableOpacity style={styles.toggleButton} onPress={() => setAuthMode(authMode === 'signIn' ? 'signUp' : 'signIn')}>
              <Text style={styles.toggleText}>
                {authMode === 'signIn' ? "Don't have an account? " : "Already a host? "}
                <Text style={styles.toggleTextBold}>{authMode === 'signIn' ? "Sign Up" : "Log In"}</Text>
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.toggleButton} onPress={() => { setAuthMode('signIn'); setIsOtpSent(false); }}>
              <Text style={styles.toggleText}>
                Remembered your password? <Text style={styles.toggleTextBold}>Log In</Text>
              </Text>
            </TouchableOpacity>
          )}

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
  linkButton: { marginTop: 15, alignItems: 'center', padding: 5 },
  linkText: { color: '#BB86FC', fontSize: 14, fontWeight: 'bold' },
  toggleButton: { marginTop: 25, alignItems: 'center', padding: 10 },
  toggleText: { color: '#a0a0a0', fontSize: 14 },
  toggleTextBold: { color: '#BB86FC', fontWeight: 'bold' },
});