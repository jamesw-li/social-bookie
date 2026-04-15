import React, { useEffect, useState, useLayoutEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, TextInput, Alert,
  Platform, ScrollView, KeyboardAvoidingView, ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ProfileScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { userId, currentName } = route.params || {};

  const [newName, setNewName] = useState(currentName || '');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingAccount, setIsUpdatingAccount] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    async function checkUserStatus() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;

        if (user?.is_anonymous) {
          setIsAnonymous(true);
        } else if (user?.email) {
          setIsAnonymous(false);
          setCurrentEmail(user.email);
        } else {
          setIsAnonymous(false);
          setCurrentEmail('Email unavailable');
        }
      } catch (error: any) {
        console.error('Auth Check Error:', error.message);
        if (error.message.includes('Auth session missing')) {
          setCurrentEmail('Session expired');
          await AsyncStorage.removeItem('userId');
          await AsyncStorage.removeItem('userName');
        } else {
          setCurrentEmail('Error loading email');
        }
      } finally {
        setIsCheckingAuth(false);
      }
    }
    checkUserStatus();
  }, []);

  const handleSecureUpdate = async () => {
    if (!currentPassword) {
      Alert.alert('Security Check', 'You must enter your Current Password to save changes.');
      return;
    }
    setIsUpdatingAccount(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user?.email) throw new Error('Could not verify user session.');

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyError) throw new Error('Incorrect current password. Changes blocked.');

      const authUpdates: { email?: string; password?: string } = {};
      if (newEmail.trim()) authUpdates.email = newEmail.trim();
      if (newPassword.trim()) authUpdates.password = newPassword.trim();
      if (Object.keys(authUpdates).length > 0) {
        const { error: authUpdateError } = await supabase.auth.updateUser(authUpdates);
        if (authUpdateError) throw authUpdateError;
      }

      let finalName = currentName;
      if (newName.trim() && newName.trim() !== currentName) {
        const { error: dbError } = await supabase
          .from('users')
          .update({ display_name: newName.trim() })
          .eq('id', user.id);
        if (dbError) throw dbError;
        finalName = newName.trim();
        await AsyncStorage.setItem('userName', finalName);
        setNewName(finalName);
      }

      Alert.alert('Success! 🛡️', 'Your account details have been securely updated.');
      setCurrentPassword('');
      setNewPassword('');
      setNewEmail('');

      navigation.navigate({
        name: 'Campaigns',
        params: { updatedUserName: finalName },
        merge: true,
      });
    } catch (error: any) {
      Alert.alert('Update Failed', error.message);
    } finally {
      setIsUpdatingAccount(false);
    }
  };

  const handleUpgradeAccount = async () => {
    if (!email || password.length < 6) {
      Alert.alert('Hold up', 'Please enter a valid email and a password of at least 6 characters.');
      return;
    }
    setIsUpgrading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: email.trim(), password });
      if (error) throw error;
      Alert.alert('Success! 🎉', 'Your account is now permanently saved. You can log in on any device.');
      setIsAnonymous(false);
    } catch (error: any) {
      Alert.alert('Upgrade Failed', error.message);
    } finally {
      setIsUpgrading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#121212' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 60, paddingHorizontal: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 12 }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 4, marginBottom: 16 }}
          >
            <Text style={{ color: '#00D084', fontWeight: '600', fontSize: 16 }}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.pageTitle}>Profile</Text>
        </View>

        {isCheckingAuth ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 }}>
            <ActivityIndicator size="large" color="#BB86FC" />
          </View>
        ) : (
          <>
            {/* --- AVATAR CARD --- */}
            <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 30 }}>
              <View style={styles.avatarCircle}>
                <Text style={{ fontSize: 40, fontWeight: 'bold', color: '#121212' }}>
                  {(currentName || newName || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 4 }}>
                {newName || currentName || 'Player'}
              </Text>
              {!isAnonymous && (
                <Text style={{ fontSize: 14, color: '#a0a0a0', letterSpacing: 0.5 }}>
                  {currentEmail || 'Loading...'}
                </Text>
              )}
              {isAnonymous && (
                <View style={{ backgroundColor: '#2a1a00', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginTop: 6, borderWidth: 1, borderColor: '#FFD700' }}>
                  <Text style={{ color: '#FFD700', fontSize: 12, fontWeight: 'bold' }}>GUEST ACCOUNT</Text>
                </View>
              )}
            </View>

            {/* --- ANONYMOUS: UPGRADE ZONE --- */}
            {isAnonymous && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>🔒 Save Your Account</Text>
                <Text style={{ color: '#a0a0a0', fontSize: 13, marginBottom: 16, lineHeight: 20 }}>
                  Link an email and password to keep your points and profile on any device.
                </Text>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor="#555"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="At least 6 characters"
                  placeholderTextColor="#555"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity
                  style={[styles.saveButton, { backgroundColor: '#00D084' }]}
                  onPress={handleUpgradeAccount}
                  disabled={isUpgrading}
                >
                  <Text style={[styles.saveButtonText, { color: '#000' }]}>
                    {isUpgrading ? 'Saving...' : '🔓 Create Permanent Account'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* --- PERMANENT USER: ACCOUNT SETTINGS --- */}
            {!isAnonymous && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>Account Settings</Text>

                <Text style={styles.fieldLabel}>Display Name</Text>
                <TextInput
                  style={styles.input}
                  value={newName}
                  onChangeText={setNewName}
                  maxLength={20}
                  placeholderTextColor="#555"
                />

                <Text style={styles.fieldLabel}>New Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Leave blank to keep current"
                  placeholderTextColor="#555"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={newEmail}
                  onChangeText={setNewEmail}
                />

                <Text style={styles.fieldLabel}>New Password</Text>
                <TextInput
                  style={[styles.input, { marginBottom: 20 }]}
                  placeholder="Leave blank to keep current"
                  placeholderTextColor="#555"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                />

                {/* Security Gate */}
                <View style={{ backgroundColor: '#1a0000', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#7f1d1d', marginBottom: 20 }}>
                  <Text style={{ color: '#ff4444', fontSize: 11, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Required to Save: Current Password
                  </Text>
                  <TextInput
                    style={[styles.input, { marginBottom: 0 }]}
                    placeholder="Enter current password..."
                    placeholderTextColor="#555"
                    secureTextEntry
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.saveButton, { backgroundColor: currentPassword ? '#BB86FC' : '#2a2a2a', borderWidth: 1, borderColor: currentPassword ? '#BB86FC' : '#333' }]}
                  onPress={handleSecureUpdate}
                  disabled={isUpdatingAccount || !currentPassword}
                >
                  <Text style={[styles.saveButtonText, { color: currentPassword ? '#000' : '#555' }]}>
                    {isUpdatingAccount ? 'Verifying & Saving...' : 'Save Changes'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#BB86FC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#BB86FC',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 20,
  },
  sectionLabel: {
    color: '#BB86FC',
    fontSize: 13,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  fieldLabel: {
    color: '#a0a0a0',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    color: '#fff',
    fontSize: 15,
    padding: 12,
    marginBottom: 14,
  },
  saveButton: {
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    fontWeight: 'bold',
    fontSize: 15,
  },
});
