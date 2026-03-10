import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { supabase } from '../supabase'; // Ensure this path is correct for your project
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen({ route, navigation }: any) {
  // Grab the data passed from the Campaigns screen
  const { userId, currentName } = route.params || {};
  
  const [newName, setNewName] = useState(currentName || '');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);

  // States for Permanent Users changing their credentials
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingAccount, setIsUpdatingAccount] = useState(false);

  // The required security key
  const [currentPassword, setCurrentPassword] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');

  useEffect(() => {
    async function checkUserStatus() {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user?.is_anonymous) {
        setIsAnonymous(true);
      } else if (user?.email) {
        // They are a permanent user! Grab their email for the Profile Card.
        setIsAnonymous(false);
        setCurrentEmail(user.email);
      }
    }
    checkUserStatus();
  }, []);

  const handleSecureUpdate = async () => {
    if (!currentPassword) {
      if (Platform.OS === 'web') window.alert("Security Check: You must enter your Current Password to save changes.");
      else Alert.alert("Security Check", "You must enter your Current Password to save changes.");
      return;
    }

    setIsUpdatingAccount(true);

    try {
      // 1. Get the user's current session email so we can test their password
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user?.email) throw new Error("Could not verify user session.");

      // 2. THE BOUNCER: Try to sign in with the provided Current Password
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword
      });

      if (verifyError) {
        throw new Error("Incorrect current password. Changes blocked.");
      }

      // 3. PASSED! Now process the Auth updates (Email & Password)
      const authUpdates: { email?: string; password?: string } = {};
      if (newEmail.trim()) authUpdates.email = newEmail.trim();
      if (newPassword.trim()) authUpdates.password = newPassword.trim();

      if (Object.keys(authUpdates).length > 0) {
        const { error: authUpdateError } = await supabase.auth.updateUser(authUpdates);
        if (authUpdateError) throw authUpdateError;
      }

      // 4. Process the Database update (Display Name)
      let finalName = currentName; // Default to existing name
      
      if (newName.trim() && newName.trim() !== currentName) {
        const { error: dbError } = await supabase
          .from('users')
          .update({ display_name: newName.trim() })
          .eq('id', user.id);
          
        if (dbError) throw dbError;

        finalName = newName.trim();
        // Keep phone memory in sync
        await AsyncStorage.setItem('userName', finalName);
        setNewName(finalName);
      }

      // 5. Success Alerts & Cleanup
      if (Platform.OS === 'web') {
        window.alert("Success! 🛡️ Your account details have been securely updated.");
      } else {
        Alert.alert("Success! 🛡️", "Your account details have been securely updated.");
      }
      
      // Clear the sensitive fields
      setCurrentPassword('');
      setNewPassword('');
      setNewEmail('');

      // 6. Navigate back to Campaigns to refresh the Welcome text!
      navigation.navigate({
        name: 'Campaign', // Ensure this matches your App.tsx exact route name!
        params: { updatedUserName: finalName },
        merge: true,
      });

    } catch (error: any) {
      if (Platform.OS === 'web') {
        window.alert(`Update Failed: ${error.message}`);
      } else {
        Alert.alert("Update Failed", error.message);
      }
    } finally {
      setIsUpdatingAccount(false);
    }
  };

  const handleUpgradeAccount = async () => {
    if (!email || password.length < 6) {
      Alert.alert("Hold up", "Please enter a valid email and a password of at least 6 characters.");
      return;
    }

    setIsUpgrading(true);

    try {
      // This is the magic Supabase command. It upgrades the current session!
      const { data, error } = await supabase.auth.updateUser({
        email: email.trim(),
        password: password
      });

      if (error) throw error;

      Alert.alert("Success! 🎉", "Your account is now permanently saved. You can log in on any device.");
      
      // Hide the upgrade form now that they are a permanent user
      setIsAnonymous(false); 

    } catch (error: any) {
      Alert.alert("Upgrade Failed", error.message);
    } finally {
      setIsUpgrading(false);
    }
  };
  

  const executeLogout = async () => {
    // 1. Sign out of Supabase
    await supabase.auth.signOut();
    
    // 2. Nuke the phone's memory so a new user can start fresh
    await AsyncStorage.clear(); 
    
    // 3. Reset the navigation stack so they can't swipe back into the game
    navigation.reset({
      index: 0,
      routes: [{ name: 'Welcome' }],
    });
  };

  const handleLogout = () => {
    if (isAnonymous) {
      // --- WEB BEHAVIOR ---
      if (Platform.OS === 'web') {
        const userConfirmed = window.confirm(
          "Warning: Guest Account\n\nIf you log out without linking an email, your points, bets, and profile will be lost forever. Are you absolutely sure?"
        );
        if (userConfirmed) {
          executeLogout();
        }
      } 
      // --- MOBILE BEHAVIOR ---
      else {
        Alert.alert(
          "Warning: Guest Account",
          "If you log out without linking an email, your points, bets, and profile will be lost forever. Are you absolutely sure?",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Log Out Anyway", style: "destructive", onPress: executeLogout }
          ]
        );
      }
    } else {
      // Permanent users skip the warning and just log out
      executeLogout(); 
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
      {/* --- PREMIUM PROFILE CARD (Only for Permanent Users) --- */}
        {!isAnonymous && (
          <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 30 }}>
            {/* The Avatar Circle */}
            <View style={{ 
              width: 80, 
              height: 80, 
              borderRadius: 40, 
              backgroundColor: '#BB86FC', 
              justifyContent: 'center', 
              alignItems: 'center',
              marginBottom: 15,
              shadowColor: '#BB86FC',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 5,
              elevation: 5
            }}>
              <Text style={{ fontSize: 36, fontWeight: 'bold', color: '#121212' }}>
                {/* Grabs the first letter of their name, or a question mark if missing */}
                {currentName ? currentName.charAt(0).toUpperCase() : '?'}
              </Text>
            </View>
            
            {/* Display Name & Email */}
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 5 }}>
              {currentName || 'Host'}
            </Text>
            <Text style={{ fontSize: 16, color: '#a0a0a0', letterSpacing: 0.5 }}>
              {currentEmail || 'Loading email...'}
            </Text>
          </View>
        )}

    {/* --- THE UPGRADE ZONE (Only visible to Guests) --- */}
        {isAnonymous && (
          <View style={{ marginTop: 40, backgroundColor: '#1e1e1e', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#333' }}>
            <Text style={{ color: '#00D084', fontSize: 16, fontWeight: 'bold', marginBottom: 5 }}>Save Your Winnings 🏆</Text>
            <Text style={{ color: '#a0a0a0', fontSize: 14, marginBottom: 20 }}>
              You are playing as a Guest. Link an email to save your Hall of Fame stats and play on other devices.
            </Text>

            <Text style={{ color: '#BB86FC', fontSize: 12, fontWeight: 'bold', marginBottom: 5, textTransform: 'uppercase' }}>Email</Text>
            <TextInput
              style={{ backgroundColor: '#121212', borderWidth: 1, borderColor: '#444', borderRadius: 8, color: '#fff', padding: 12, marginBottom: 15 }}
              placeholder="you@email.com"
              placeholderTextColor="#555"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            <Text style={{ color: '#BB86FC', fontSize: 12, fontWeight: 'bold', marginBottom: 5, textTransform: 'uppercase' }}>Password</Text>
            <TextInput
              style={{ backgroundColor: '#121212', borderWidth: 1, borderColor: '#444', borderRadius: 8, color: '#fff', padding: 12, marginBottom: 20 }}
              placeholder="••••••••"
              placeholderTextColor="#555"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity 
              style={{ backgroundColor: '#BB86FC', padding: 15, borderRadius: 8, alignItems: 'center' }}
              onPress={handleUpgradeAccount}
              disabled={isUpgrading}
            >
              <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 16 }}>
                {isUpgrading ? 'SAVING...' : 'LINK ACCOUNT'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {/* --- ACCOUNT MANAGEMENT (Only visible to Permanent Users / Hosts) --- */}
        {!isAnonymous && (
          <View style={{ marginTop: 40, borderTopWidth: 1, borderColor: '#333', paddingTop: 30 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 20 }}>Account Settings</Text>
            
            {/* DISPLAY NAME */}
            <Text style={{ color: '#BB86FC', fontSize: 12, fontWeight: 'bold', marginBottom: 5, textTransform: 'uppercase' }}>Display Name</Text>
            <TextInput
              style={{ backgroundColor: '#121212', borderWidth: 1, borderColor: '#444', borderRadius: 8, color: '#fff', padding: 12, marginBottom: 15 }}
              value={newName}
              onChangeText={setNewName}
              maxLength={20}
            />

            {/* NEW EMAIL */}
            <Text style={{ color: '#BB86FC', fontSize: 12, fontWeight: 'bold', marginBottom: 5, textTransform: 'uppercase' }}>New Email</Text>
            <TextInput
              style={{ backgroundColor: '#121212', borderWidth: 1, borderColor: '#444', borderRadius: 8, color: '#fff', padding: 12, marginBottom: 15 }}
              placeholder="Leave blank to keep current"
              placeholderTextColor="#555"
              autoCapitalize="none"
              keyboardType="email-address"
              value={newEmail}
              onChangeText={setNewEmail}
            />

            {/* NEW PASSWORD */}
            <Text style={{ color: '#BB86FC', fontSize: 12, fontWeight: 'bold', marginBottom: 5, textTransform: 'uppercase' }}>New Password</Text>
            <TextInput
              style={{ backgroundColor: '#121212', borderWidth: 1, borderColor: '#444', borderRadius: 8, color: '#fff', padding: 12, marginBottom: 25 }}
              placeholder="Leave blank to keep current"
              placeholderTextColor="#555"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />

            {/* THE SECURITY KEY */}
            <View style={{ backgroundColor: '#1e1e1e', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#ff4444', marginBottom: 20 }}>
              <Text style={{ color: '#ff4444', fontSize: 12, fontWeight: 'bold', marginBottom: 10, textTransform: 'uppercase' }}>
                Required: Current Password
              </Text>
              <TextInput
                style={{ backgroundColor: '#121212', borderWidth: 1, borderColor: '#444', borderRadius: 8, color: '#fff', padding: 12 }}
                placeholder="Enter current password to save..."
                placeholderTextColor="#555"
                secureTextEntry
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
            </View>

            {/* SAVE BUTTON */}
            <TouchableOpacity 
              style={{ backgroundColor: currentPassword ? '#BB86FC' : '#333', padding: 15, borderRadius: 8, alignItems: 'center' }}
              onPress={handleSecureUpdate}
              disabled={isUpdatingAccount || !currentPassword}
            >
              <Text style={{ color: currentPassword ? '#000' : '#777', fontWeight: 'bold', fontSize: 16 }}>
                {isUpdatingAccount ? 'VERIFYING & SAVING...' : 'SAVE CHANGES'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {/* --- LOG OUT BUTTON (Visible to Everyone) --- */}
        <TouchableOpacity 
          style={{ marginTop: 50, marginBottom: 30, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#ff4444', padding: 15, borderRadius: 8, alignItems: 'center' }}
          onPress={handleLogout}
        >
          <Text style={{ color: '#ff4444', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 }}>
            LOG OUT
          </Text>
        </TouchableOpacity>
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