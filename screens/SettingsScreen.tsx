import React, { useEffect, useState, useLayoutEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  Alert, Platform, ScrollView, useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';



interface Tile {
  id: string;
  icon: string;
  label: string;
  subtitle: string;
  accentColor: string;
  onPress: () => void;
}

export default function SettingsScreen({ route, navigation }: any) {
  const { width } = useWindowDimensions();
  // Cap the layout width at 480px (phone width) for web; fill the screen on native
  const contentWidth = Math.min(width, 480);
  const TILE_SIZE = (contentWidth - 20 * 2 - 12) / 2;

  const insets = useSafeAreaInsets();
  const { userId, currentName } = route.params || {};
  const [displayName, setDisplayName] = useState(currentName || '');
  const [isAnonymous, setIsAnonymous] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    async function loadUserInfo() {
      const storedName = await AsyncStorage.getItem('userName');
      if (storedName) setDisplayName(storedName);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        setIsAnonymous(user?.is_anonymous ?? true);
      } catch (_) {}
    }
    loadUserInfo();
  }, [route.params?.updatedUserName]);

  const executeLogout = async () => {
    await supabase.auth.signOut();
    await AsyncStorage.clear();
    navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
  };

  const handleLogout = () => {
    if (isAnonymous) {
      Alert.alert(
        'Warning: Guest Account',
        'If you log out without linking an email, your points, bets, and profile will be lost forever. Are you absolutely sure?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log Out Anyway', style: 'destructive', onPress: executeLogout },
        ]
      );
    } else {
      executeLogout();
    }
  };

  const comingSoon = (label: string) =>
    Alert.alert(`${label}`, 'This feature is coming soon! Stay tuned. 🚀');

  const tiles: Tile[] = [
    {
      id: 'profile',
      icon: '👤',
      label: 'Profile',
      subtitle: isAnonymous ? 'Guest Account' : displayName || 'Account & security',
      accentColor: '#BB86FC',
      onPress: () => navigation.navigate('Profile', { userId, currentName: displayName }),
    },
    {
      id: 'archive',
      icon: '🏆',
      label: 'Hall of Fame',
      subtitle: 'Completed campaigns',
      accentColor: '#FFD700',
      onPress: () => navigation.navigate('ArchivedCampaigns'),
    },
    {
      id: 'stats',
      icon: '📊',
      label: 'Statistics',
      subtitle: 'Coming soon',
      accentColor: '#333',
      onPress: () => comingSoon('Statistics'),
    },
    {
      id: 'notifications',
      icon: '🔔',
      label: 'Notifications',
      subtitle: 'Coming soon',
      accentColor: '#333',
      onPress: () => comingSoon('Notifications'),
    },
    {
      id: 'friends',
      icon: '👥',
      label: 'Friends',
      subtitle: 'Coming soon',
      accentColor: '#333',
      onPress: () => comingSoon('Friends'),
    },
    {
      id: 'appearance',
      icon: '🎨',
      label: 'Appearance',
      subtitle: 'Coming soon',
      accentColor: '#333',
      onPress: () => comingSoon('Appearance'),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingBottom: 40,
          maxWidth: 480,
          width: '100%',
          alignSelf: 'center',
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 12, marginBottom: 28 }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 4, marginBottom: 16 }}
          >
            <Text style={{ color: '#00D084', fontWeight: '600', fontSize: 16 }}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.pageTitle}>Settings</Text>
        </View>

        {/* Tile Grid */}
        <View style={styles.grid}>
          {tiles.map((tile) => (
            <TouchableOpacity
              key={tile.id}
              style={[
              styles.tile,
              { width: TILE_SIZE, height: TILE_SIZE },
              { borderColor: tile.accentColor === '#333' ? '#2a2a2a' : tile.accentColor + '40' }
            ]}
              onPress={tile.onPress}
              activeOpacity={0.75}
            >
              {/* Accent dot in top-right corner */}
              <View style={[styles.accentDot, { backgroundColor: tile.accentColor }]} />

              <Text style={styles.tileIcon}>{tile.icon}</Text>
              <Text style={styles.tileLabel}>{tile.label}</Text>
              <Text
                style={[
                  styles.tileSubtitle,
                  tile.accentColor === '#333' && { color: '#444' },
                ]}
                numberOfLines={1}
              >
                {tile.subtitle}
              </Text>

              {tile.accentColor === '#333' && (
                <View style={styles.comingSoonBadge}>
                  <Text style={styles.comingSoonText}>SOON</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Log Out */}
        <View style={{ marginTop: 'auto', paddingTop: 32 }}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    backgroundColor: '#1e1e1e',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    position: 'relative',
  },
  accentDot: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.8,
  },
  tileIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  tileLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  tileSubtitle: {
    color: '#a0a0a0',
    fontSize: 11,
    fontWeight: '500',
  },
  comingSoonBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  comingSoonText: {
    color: '#555',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: '#3a1a1a',
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  logoutText: {
    color: '#991b1b',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.5,
  },
});