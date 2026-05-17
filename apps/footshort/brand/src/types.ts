export type ColorTokens = {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
};

export type SpacingTokens = {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
};

export type RadiusTokens = {
  none: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
};

export type FontSizeToken = [size: string, lineHeight: string];

export type TypographyTokens = {
  fontFamily: {
    sans: string;
    display: string;
    mono: string;
  };
  fontSize: {
    xs: FontSizeToken;
    sm: FontSizeToken;
    base: FontSizeToken;
    lg: FontSizeToken;
    xl: FontSizeToken;
    '2xl': FontSizeToken;
    '3xl': FontSizeToken;
  };
  fontWeight: {
    regular: string;
    medium: string;
    bold: string;
  };
};

export type Theme = {
  name: string;
  scheme: 'light' | 'dark';
  colors: ColorTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  typography: TypographyTokens;
};

export type ThemeName = 'classic' | 'pitch' | 'terrace';
