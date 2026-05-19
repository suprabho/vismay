// Featured countries for the /wallet-geo choropleth. ISO 3166-1 alpha-2.
//
// Baseline address counts are a synthesized real-shape mock anchored to the
// Chainalysis 2025 Geography of Cryptocurrency adoption ranking — top-20
// adoption countries get the bulk of the volume; long-tail markets and
// transit hubs are seeded with smaller counts so the choropleth has spatial
// coverage without overstating numbers.
//
// `vpnRate` is the country's approximate VPN-adoption rate (share of internet
// users, 0–1) and seeds the IP-type split in lib/wallet-geo/data.ts.
//   Sources used as a reference for the baseline:
//     - cybernews.com/best-vpn/vpn-usage-by-country
//     - statista.com (Q2 2024)
//   We use it only to bias the synth — the rendered numbers are not the
//   source figures themselves.
//
// `centroid` doubles as the map-pin location for that country.

export interface WalletGeoCountry {
  code: string;
  name: string;
  lat: number;
  lng: number;
  addressBaseline: number;
  vpnRate: number;
  summary: string;
}

export const WALLET_GEO_COUNTRIES: WalletGeoCountry[] = [
  {
    code: "IN",
    name: "India",
    lat: 20.6,
    lng: 78.9,
    addressBaseline: 184_320,
    vpnRate: 0.45,
    summary:
      "Top of Chainalysis' 2025 adoption index. P2P and remittance corridors drive a broad address footprint; high VPN adoption skews the IP-type split toward masked traffic.",
  },
  {
    code: "US",
    name: "United States",
    lat: 39.8,
    lng: -98.5,
    addressBaseline: 162_540,
    vpnRate: 0.32,
    summary:
      "Second on the adoption index but #1 on institutional flows. Residential ISP traffic dominates; hosting/commercial weight is higher than retail-led markets.",
  },
  {
    code: "PK",
    name: "Pakistan",
    lat: 30.4,
    lng: 69.3,
    addressBaseline: 96_410,
    vpnRate: 0.41,
    summary:
      "Third on the 2025 adoption index. Retail-led footprint; VPN share elevated on the back of platform-access restrictions.",
  },
  {
    code: "VN",
    name: "Vietnam",
    lat: 14.0,
    lng: 108.3,
    addressBaseline: 82_840,
    vpnRate: 0.36,
    summary:
      "Long-running fixture in the top-5 of the adoption index. Heavy on-chain DEX activity correlates with mobile-residential IPs.",
  },
  {
    code: "BR",
    name: "Brazil",
    lat: -14.2,
    lng: -51.9,
    addressBaseline: 74_120,
    vpnRate: 0.21,
    summary:
      "Largest LATAM crypto market. Inflation hedging + stablecoin payroll drive a high share of residential IPs.",
  },
  {
    code: "NG",
    name: "Nigeria",
    lat: 9.1,
    lng: 8.7,
    addressBaseline: 68_530,
    vpnRate: 0.34,
    summary:
      "Sub-Saharan Africa's adoption leader. Naira instability and P2P USDT flows underpin a broad, mobile-heavy address base.",
  },
  {
    code: "ID",
    name: "Indonesia",
    lat: -0.79,
    lng: 113.9,
    addressBaseline: 61_240,
    vpnRate: 0.55,
    summary:
      "Top-3 APAC adoption. Very high VPN penetration shifts a large slice of observations into the masked-IP bucket.",
  },
  {
    code: "UA",
    name: "Ukraine",
    lat: 48.4,
    lng: 31.2,
    addressBaseline: 47_810,
    vpnRate: 0.33,
    summary:
      "Highest population-adjusted adoption in Europe. War-driven capital flight pushed retail wallet creation to record levels.",
  },
  {
    code: "PH",
    name: "Philippines",
    lat: 12.9,
    lng: 121.8,
    addressBaseline: 44_290,
    vpnRate: 0.30,
    summary:
      "Play-to-earn legacy + USDT remittances. Mobile residential ISP dominates; hosting/commercial share remains low.",
  },
  {
    code: "RU",
    name: "Russia",
    lat: 61.5,
    lng: 105.3,
    addressBaseline: 41_660,
    vpnRate: 0.38,
    summary:
      "Sanctions-era flows drive a non-trivial VPN/hosting share. Bridge/mixer traffic biases observation timestamps toward off-hours.",
  },
  {
    code: "GB",
    name: "United Kingdom",
    lat: 55.4,
    lng: -3.4,
    addressBaseline: 38_920,
    vpnRate: 0.27,
    summary:
      "Largest EMEA institutional hub. London-centric commercial/hosting share is higher than the global average.",
  },
  {
    code: "ET",
    name: "Ethiopia",
    lat: 9.1,
    lng: 40.5,
    addressBaseline: 22_180,
    vpnRate: 0.18,
    summary:
      "Top-15 by adoption — predominantly mobile-residential traffic with low VPN share.",
  },
  {
    code: "TR",
    name: "Türkiye",
    lat: 38.9,
    lng: 35.2,
    addressBaseline: 35_140,
    vpnRate: 0.32,
    summary:
      "Lira devaluation drove sustained retail demand. Residential IPs dominate; VPN share elevated.",
  },
  {
    code: "TH",
    name: "Thailand",
    lat: 15.9,
    lng: 100.9,
    addressBaseline: 31_580,
    vpnRate: 0.28,
    summary:
      "Regulated market with growing institutional activity. Stable mix of residential and commercial IPs.",
  },
  {
    code: "AR",
    name: "Argentina",
    lat: -38.4,
    lng: -63.6,
    addressBaseline: 26_910,
    vpnRate: 0.24,
    summary:
      "Top-20 adoption. Peso instability and dollar-stable demand drive consistent retail flows.",
  },
  {
    code: "MX",
    name: "Mexico",
    lat: 23.6,
    lng: -102.5,
    addressBaseline: 25_280,
    vpnRate: 0.18,
    summary:
      "Remittance corridor with USA. Low VPN share; residential ISPs dominate.",
  },
  {
    code: "JP",
    name: "Japan",
    lat: 36.2,
    lng: 138.3,
    addressBaseline: 28_640,
    vpnRate: 0.16,
    summary:
      "Mature institutional market. High share of commercial/hosting traffic. Very low VPN penetration.",
  },
  {
    code: "KR",
    name: "South Korea",
    lat: 35.9,
    lng: 127.8,
    addressBaseline: 27_410,
    vpnRate: 0.17,
    summary:
      "High exchange activity. Residential ISP dominates; hosting share above APAC average.",
  },
  {
    code: "DE",
    name: "Germany",
    lat: 51.2,
    lng: 10.4,
    addressBaseline: 24_870,
    vpnRate: 0.20,
    summary:
      "Largest crypto-asset volumes in the EU. Balanced IP-type mix; institutional + retail share is roughly even.",
  },
  {
    code: "FR",
    name: "France",
    lat: 46.6,
    lng: 1.9,
    addressBaseline: 18_460,
    vpnRate: 0.22,
    summary:
      "MiCA-compliant exchanges concentrate institutional activity in Paris; balanced IP-type mix.",
  },
  {
    code: "AE",
    name: "United Arab Emirates",
    lat: 23.4,
    lng: 53.8,
    addressBaseline: 17_290,
    vpnRate: 0.86,
    summary:
      "Free-zone regulation attracts firms; near-universal VPN adoption skews the IP-type split heavily toward masked traffic.",
  },
  {
    code: "CA",
    name: "Canada",
    lat: 56.1,
    lng: -106.3,
    addressBaseline: 16_140,
    vpnRate: 0.23,
    summary:
      "Stable retail + institutional mix. Hosting share elevated near major urban centers.",
  },
  {
    code: "AU",
    name: "Australia",
    lat: -25.3,
    lng: 133.8,
    addressBaseline: 14_560,
    vpnRate: 0.21,
    summary:
      "ASIC-regulated retail market. Balanced IP-type mix; weekend observations bias higher than weekday.",
  },
  {
    code: "PL",
    name: "Poland",
    lat: 51.9,
    lng: 19.1,
    addressBaseline: 12_840,
    vpnRate: 0.24,
    summary:
      "Largest CEE retail market. Steady growth in residential observations through 2025.",
  },
  {
    code: "NL",
    name: "Netherlands",
    lat: 52.1,
    lng: 5.3,
    addressBaseline: 11_580,
    vpnRate: 0.21,
    summary:
      "Cloud-region concentration biases the IP-type mix toward hosting/commercial.",
  },
  {
    code: "ES",
    name: "Spain",
    lat: 40.5,
    lng: -3.7,
    addressBaseline: 10_910,
    vpnRate: 0.22,
    summary:
      "Steady retail growth post-MiCA. Predominantly residential ISPs.",
  },
  {
    code: "ZA",
    name: "South Africa",
    lat: -30.6,
    lng: 22.9,
    addressBaseline: 9_870,
    vpnRate: 0.22,
    summary:
      "Largest African market after Nigeria. Mixed mobile and fixed residential traffic.",
  },
  {
    code: "SG",
    name: "Singapore",
    lat: 1.35,
    lng: 103.8,
    addressBaseline: 9_440,
    vpnRate: 0.27,
    summary:
      "MAS-licensed venues anchor a high-volume, mostly commercial-IP footprint despite the small population.",
  },
  {
    code: "VE",
    name: "Venezuela",
    lat: 6.4,
    lng: -66.6,
    addressBaseline: 8_710,
    vpnRate: 0.36,
    summary:
      "Hyperinflation hedging. Heavy P2P USDT activity; elevated VPN share due to platform restrictions.",
  },
  {
    code: "CO",
    name: "Colombia",
    lat: 4.6,
    lng: -74.1,
    addressBaseline: 8_240,
    vpnRate: 0.23,
    summary:
      "Top-30 adoption. Residential ISPs dominate; growing remittance corridor with USA.",
  },
  {
    code: "EG",
    name: "Egypt",
    lat: 26.8,
    lng: 30.8,
    addressBaseline: 7_460,
    vpnRate: 0.36,
    summary:
      "Restricted retail market drives a high VPN share. Stablecoin remittance dominates observed activity.",
  },
  {
    code: "MY",
    name: "Malaysia",
    lat: 4.2,
    lng: 101.9,
    addressBaseline: 6_950,
    vpnRate: 0.26,
    summary:
      "Top-30 adoption. Mix of residential and commercial IPs; growing hosting activity in Kuala Lumpur.",
  },
  {
    code: "IL",
    name: "Israel",
    lat: 31.0,
    lng: 34.8,
    addressBaseline: 6_120,
    vpnRate: 0.23,
    summary:
      "High institutional density; observations bias toward commercial/hosting traffic.",
  },
  {
    code: "CH",
    name: "Switzerland",
    lat: 46.8,
    lng: 8.2,
    addressBaseline: 5_680,
    vpnRate: 0.21,
    summary:
      "Zug-based service providers concentrate institutional flows. Hosting share is highest in Europe.",
  },
  {
    code: "HK",
    name: "Hong Kong",
    lat: 22.3,
    lng: 114.1,
    addressBaseline: 5_240,
    vpnRate: 0.30,
    summary:
      "OTC desks anchor a small but high-volume institutional footprint. Commercial IPs dominate.",
  },
];

// Lookup map for centroid + name when only the code is known.
export const WALLET_GEO_COUNTRIES_BY_CODE: Record<string, WalletGeoCountry> =
  Object.fromEntries(WALLET_GEO_COUNTRIES.map((c) => [c.code, c]));
