import React from 'react';
import { TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

type BackButtonProps = {
  onPress?: () => void;
  color?: string;
  accessibilityLabel?: string;
};

export default function BackButton({
  onPress,
  color = '#00D084',
  accessibilityLabel = 'Go back',
}: BackButtonProps) {
  const navigation = useNavigation<any>();

  if (!onPress && !navigation.canGoBack()) return null;

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      navigation.goBack();
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={{ marginLeft: 5, padding: 5 }}
    >
      <MaterialCommunityIcons name="chevron-left" size={32} color={color} />
    </TouchableOpacity>
  );
}
