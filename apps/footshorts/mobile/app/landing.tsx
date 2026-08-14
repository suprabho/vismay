import { Pressable, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { vars } from 'nativewind';
import { terrace, themeToVars } from '@footshorts/brand';
import { useAuth } from '@/lib/AuthProvider';
import { PRIVACY_URL } from '@/lib/links';
import { NetTexture } from '@/components/landing/NetTexture';
import { StoryCarousel } from '@/components/landing/StoryCarousel';
import { BriefSlide } from '@/components/landing/slides/BriefSlide';
import { EndOfFeedSlide } from '@/components/landing/slides/EndOfFeedSlide';
import { FollowSlide } from '@/components/landing/slides/FollowSlide';
import { font } from '@/components/landing/fonts';
import { BrandMark } from '@/components/landing/ui';

/**
 * Mobile landing for logged-out users. Three value props run as a story-style
 * carousel, each one a mock of a real app surface — the brief, the follow
 * graph, the end of the feed — under Sign up / Log in.
 *
 * The screen pins the `terrace` theme rather than following the app's stored
 * preference: a logged-out visitor has never picked one, and the cream paper
 * look is what the landing was designed against. Scoping is done the same way
 * the brand ThemeProvider does it, so every token class below resolves to
 * terrace without touching the app-wide theme.
 *
 * Logged-in users never see this; they're redirected by the index route to
 * onboarding or /feed.
 */
export default function LandingScreen() {
  const router = useRouter();
  const { session, loading } = useAuth();

  // If a logged-in user lands here directly (deep link, back stack), bounce
  // out to the index router which will pick onboarding vs feed.
  if (!loading && session) return <Redirect href="/" />;

  const slides = [<BriefSlide key="brief" />, <FollowSlide key="follow" />, <EndOfFeedSlide key="end" />];

  return (
    <View className="flex-1 bg-bg" style={vars(themeToVars(terrace))}>
      {/* terrace is a light scheme; the root StatusBar follows the app theme,
          which may be dark, so this screen states its own. */}
      <StatusBar style="dark" />

      {/* Outside the safe area so the net runs edge to edge, under the notch. */}
      <NetTexture color={terrace.colors.brand} />

      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-6 pt-1.5 pb-3">
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <BrandMark size={18} color={terrace.colors.brand} />
            <Text
              className="text-text"
              style={{ fontFamily: font.sansBold, fontSize: 18, letterSpacing: -0.2 }}
            >
              Footshorts
            </Text>
          </View>
          <Text
            className="text-muted"
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
            }}
          >
            Football, in short
          </Text>
        </View>

        <StoryCarousel slides={slides} />

        <View className="px-6" style={{ paddingTop: 18, gap: 12 }}>
          <Pressable
            onPress={() => router.push('/login?mode=signup')}
            className="bg-brand rounded-lg items-center active:opacity-90"
            style={{ paddingVertical: 15, paddingHorizontal: 20 }}
          >
            <Text
              className="text-brand-text"
              style={{ fontFamily: font.sansSemiBold, fontSize: 16 }}
            >
              Sign up
            </Text>
          </Pressable>

          <View className="flex-row items-center justify-center" style={{ gap: 6 }}>
            <Text className="text-muted" style={{ fontFamily: font.sans, fontSize: 14 }}>
              Already have an account?
            </Text>
            <Pressable onPress={() => router.push('/login')} hitSlop={6} className="active:opacity-80">
              <Text
                className="text-brand"
                style={{
                  fontFamily: font.sansSemiBold,
                  fontSize: 14,
                  textDecorationLine: 'underline',
                }}
              >
                Log in
              </Text>
            </Pressable>
          </View>
        </View>

        <View className="flex-row items-center justify-center px-6 pt-5" style={{ gap: 10 }}>
          <Text className="text-muted" style={{ fontFamily: font.sans, fontSize: 11 }}>
            Terms
          </Text>
          <Text className="text-muted" style={{ fontFamily: font.sans, fontSize: 11 }}>
            ·
          </Text>
          <Pressable onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} hitSlop={6}>
            <Text className="text-muted" style={{ fontFamily: font.sans, fontSize: 11 }}>
              Privacy
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
