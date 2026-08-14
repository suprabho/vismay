/**
 * Font families for the landing screen.
 *
 * The brand themes declare typography as CSS font stacks (`"Space Grotesk",
 * system-ui, …`), which the web app consumes directly. React Native cannot
 * resolve a stack, so native needs the concrete family names registered by
 * `useFonts` in `app/_layout.tsx` — and one family per weight, because RN does
 * not synthesise weights for custom fonts.
 */
export const font = {
  sans: 'SpaceGrotesk_400Regular',
  sansMedium: 'SpaceGrotesk_500Medium',
  sansSemiBold: 'SpaceGrotesk_600SemiBold',
  sansBold: 'SpaceGrotesk_700Bold',
  display: 'Forum_400Regular',
  mono: 'SpaceMono_400Regular',
} as const;
