import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import WelcomeScreen from './screens/WelcomeScreen';
import CampaignScreen from './screens/CampaignScreen';
import DashboardScreen from './screens/DashboardScreen';
import HostScreen from './screens/HostScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import FinalResultsScreen from './screens/FinalResultsScreen';
import ReadOnlyDashboardScreen from './screens/ReadOnlyDashboardScreen';
import SettingsScreen from './screens/SettingsScreen';
import CreateGameScreen from './screens/CreateGameScreen';
import HostAuthScreen from './screens/HostAuthScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  const [savedData, setSavedData] = useState<any>({});
  const MyDarkTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: '#121212', // 🚨 THE FIX: Paints the navigation canvas dark!
    },
  };
  useEffect(() => {
    checkLocalUser();
  }, []);

  async function checkLocalUser() {
    try {
      // Check the phone's memory for saved IDs
      const userId = await AsyncStorage.getItem('userId');
      const userName = await AsyncStorage.getItem('userName');
      const campaignId = await AsyncStorage.getItem('campaignId');
      const campaignName = await AsyncStorage.getItem('campaignName');

      if (userId && campaignId) {
        // They already joined an event! Send them straight to the board.
        setSavedData({ userName, campaignName });
        setInitialRoute('Dashboard');
      } else if (userId) {
        // They made an account but didn't pick an event yet.
        setSavedData({ userId, userName });
        setInitialRoute('Campaigns');
      } else {
        // Brand new user.
        setInitialRoute('Welcome');
      }
    } catch (e) {
      setInitialRoute('Welcome');
    }
  }

  // Show a loading spinner while checking the phone's memory
  if (!initialRoute) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#00D084" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={MyDarkTheme}>
      <Stack.Navigator 
        initialRouteName={initialRoute}
        screenOptions={{
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
        <Stack.Screen 
          name="Campaigns" 
          component={CampaignScreen} 
          initialParams={savedData} // Pass the recovered user data
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="Dashboard" 
          component={DashboardScreen} 
          initialParams={savedData} // Pass the recovered campaign data
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="Host" 
          component={HostScreen} 
          options={{ title: 'Host Control', headerTintColor: '#FFD700' }} 
        />
        <Stack.Screen 
          name="Leaderboard" 
          component={LeaderboardScreen} 
          options={{ title: 'Leaderboard', headerTintColor: '#00D084' }} 
        />
        
        {/* ... your other screens ... */}
      <Stack.Screen 
        name="FinalResults" 
        component={FinalResultsScreen} 
        options={{ 
          title: 'Final Results', 
          headerTintColor: '#FFD700',
          headerLeft: () => null // Hides the back button so they can't escape the podium!
        }} 
      />
      <Stack.Screen 
          name="ReadOnlyDashboard" 
          component={ReadOnlyDashboardScreen} 
          options={{ headerShown: false }} 
      />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CreateGame" component={CreateGameScreen} options={{ headerShown: false }} />
      <Stack.Screen name="HostAuth" component={HostAuthScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}