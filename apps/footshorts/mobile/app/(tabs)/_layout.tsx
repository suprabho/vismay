import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '@/lib/AuthProvider';

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View className="items-center">
      <Text className={focused ? 'text-accent text-xs font-semibold' : 'text-muted text-xs'}>
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#00D26A" />
      </View>
    );
  }

  if (!session) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Feed" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Profile" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
