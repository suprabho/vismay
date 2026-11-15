import { Geist_Mono, Instrument_Sans, Instrument_Serif } from 'next/font/google'

/**
 * The home page's type, self-hosted by next/font and scoped to the page: its
 * root carries these variables, other routes keep the layout's fonts.
 * Instrument Serif for headlines and big numbers, Instrument Sans for text,
 * Geist Mono for dates and data.
 */
const serif = Instrument_Serif({ weight: '400', style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-home-serif' })
const sans = Instrument_Sans({ subsets: ['latin'], variable: '--font-home-sans' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-home-mono' })

export const homeFontVars = `${serif.variable} ${sans.variable} ${mono.variable}`
