/**
 * Seed script — populates MongoDB with initial data from Frontend/src/constants.ts
 * Run: npm run seed
 */

import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { Story } from '../models/Story.model';
import { Signal } from '../models/Signal.model';
import { User } from '../models/User.model';
import { GraphSpec } from '../models/GraphSpec.model';

// ── Seed data (mirrors Frontend/src/constants.ts) ────────────────────────────

const SEED_STORIES = [
  {
    slug:        'anatomy-of-an-undercut',
    category:    'Strategy',
    title:       'The Anatomy of an Undercut',
    summary:     'A granular breakdown of the crucial three laps where the race was won, analyzing tire temperatures, pit lane deltas, and the precise moment the call was made.',
    coverImage:  {
      url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBLbd3qWrVrtRtv7Jcj_w_4v1HLkUTMGaoLltgcuGuEHhChbT7v3Da8p4NQfm0l1EiLF98YaYpjIGgWm41fIQQrlz1PDjeWPtxhqnwSVlLE48cIWFKKJ_RMDN0pKUJ7_koGhVyroBFgjj9lS9lf1mD9lCjcLZp5oFEri1__d1DlldkpOfvhmsCSNqx3U-Rcll3SjNATby3jyLul6x13UVOZkJH9L5AMshKX58UNjkxIJTkYYYudDQB8t8ANEszyVo2EzVF7R6-zrOo',
      alt: 'The Anatomy of an Undercut',
    },
    content: [
      { type: 'paragraph' as const, text: 'To the naked eye, it appeared to be a classic out-braking maneuver. Driver A, trailing by 0.4 seconds down the back straight, pulls alongside entering the braking zone for Turn 14.' },
      { type: 'paragraph' as const, text: 'This is the narrative standard for modern motorsport. Late braking equals bravery, and bravery equals position. However, an analysis of the throttle and brake trace reveals a more calculated reality.' },
      { type: 'paragraph' as const, text: 'Look at the telemetry trace. Driver A actually initiated the braking phase 15 meters earlier than Driver B. By lifting early and transferring weight to the front axle in a controlled manner, Driver A achieved a significantly higher minimum apex speed.' },
      { type: 'paragraph' as const, text: "While Driver B was still heavily engaged in deceleration, scrubbing speed deep into the corner to defend the line, Driver A had already completed the rotation phase. This early rotation allowed Driver A to pick up the throttle a critical 0.2 seconds earlier." },
    ],
    readTimeMin: 6,
    tags:        ['strategy', 'undercut', 'pit-stop'],
    status:      'published' as const,
    publishedAt: new Date('2026-05-02'),
    aiGenerated: false,
  },
  {
    slug:        'floor-development-underfloor-war',
    category:    'Technical',
    title:       'Floor Development: The Underfloor War',
    summary:     "How Red Bull's latest floor update targets high-speed stability through complex vortex management at the floor edge.",
    coverImage:  {
      url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDCKeLOZFezpIf7MwpCgMnFKT5YhIUn21HXdTlyi-nUJEaLJ9hUMQAUX5Pm2wd63TorG5Vsjjw63inWBJx-9easeu6go9tr5R4u1VqIMfBNybz2Op9rnJlfLXDX5lQLndx77rf-ARb70AS2PBce3hzRYihQcNzOVdsGy1VuaAhoOEl0pCwQG2yKQRPB_IgCBFRAMZQ59m4pnOiGqMx8Pnhs2Pm-pHPuSMMqcXk3Cz-fpzLLuarS0wQngdSk0Ly6ANebL7vytd__oKI',
      alt: 'Floor Development: The Underfloor War',
    },
    content: [
      { type: 'paragraph' as const, text: 'The current ground-effect era has moved the aerodynamic focus from top-surface components to the intricate geometry of the underbody.' },
      { type: 'paragraph' as const, text: 'By manipulating the strength of the floor-edge vortices, engineers are able to "seal" the floor more effectively without relying on dangerously low ride heights.' },
      { type: 'paragraph' as const, text: 'Telemetry from recent testing suggests a 3% increase in downforce stability under pitching moments—the difference between a confident apex attack and a tentative lift.' },
    ],
    readTimeMin: 9,
    tags:        ['technical', 'aero', 'floor', 'red-bull'],
    status:      'published' as const,
    publishedAt: new Date('2026-04-28'),
    aiGenerated: false,
  },
  {
    slug:        'tire-whisperer-hamilton-interlagos',
    category:    'Driver Analysis',
    title:       'The Tire Whisperer: Hamilton at Interlagos',
    summary:     'Analyzing the micro-inputs that allowed Lewis Hamilton to extend a Soft tire stint beyond all simulation predictions.',
    coverImage:  {
      url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBLbd3qWrVrtRtv7Jcj_w_4v1HLkUTMGaoLltgcuGuEHhChbT7v3Da8p4NQfm0l1EiLF98YaYpjIGgWm41fIQQrlz1PDjeWPtxhqnwSVlLE48cIWFKKJ_RMDN0pKUJ7_koGhVyroBFgjj9lS9lf1mD9lCjcLZp5oFEri1__d1DlldkpOfvhmsCSNqx3U-Rcll3SjNATby3jyLul6x13UVOZkJH9L5AMshKX58UNjkxIJTkYYYudDQB8t8ANEszyVo2EzVF7R6-zrOo',
      alt: 'Hamilton at Interlagos',
    },
    content: [
      { type: 'paragraph' as const, text: 'Formula 1 strategy is often a battle against physics, but Interlagos provided a masterclass in how driver input can override simulation software.' },
      { type: 'paragraph' as const, text: "The secret lies in the braking phase. By slightly over-rotating the car on corner entry and avoiding 'corrected' steering inputs mid-corner, Hamilton minimized the lateral scrub that typically overheats the tread surface." },
      { type: 'paragraph' as const, text: 'This "tire whispering" allowed Mercedes to skip a planned second stop, turning a potential P5 into a podium finish.' },
    ],
    readTimeMin: 7,
    tags:        ['driver-analysis', 'hamilton', 'tires', 'interlagos'],
    status:      'published' as const,
    publishedAt: new Date('2026-04-15'),
    aiGenerated: false,
  },
  {
    slug:        'active-aero-2026-shift',
    category:    'Innovation',
    title:       'Active Aero: The 2026 Shift',
    summary:     'What the upcoming regulations mean for "X-Mode" and "Z-Mode" flap positions on the straights and corners.',
    coverImage:  {
      url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDCKeLOZFezpIf7MwpCgMnFKT5YhIUn21HXdTlyi-nUJEaLJ9hUMQAUX5Pm2wd63TorG5Vsjjw63inWBJx-9easeu6go9tr5R4u1VqIMfBNybz2Op9rnJlfLXDX5lQLndx77rf-ARb70AS2PBce3hzRYihQcNzOVdsGy1VuaAhoOEl0pCwQG2yKQRPB_IgCBFRAMZQ59m4pnOiGqMx8Pnhs2Pm-pHPuSMMqcXk3Cz-fpzLLuarS0wQngdSk0Ly6ANebL7vytd__oKI',
      alt: 'Active Aero 2026',
    },
    content: [
      { type: 'paragraph' as const, text: 'The 2026 regulations represent the most significant change in aerodynamic philosophy since the introduction of DRS.' },
      { type: 'paragraph' as const, text: 'The technical challenge is maintaining aero-balance during this switch. If the rear wing sheds drag while the front wing remains pitched for downforce, the car will suffer from extreme high-speed understeer.' },
      { type: 'paragraph' as const, text: 'Early simulator feedback suggests that drivers will have to manage these modes manually on certain tracks, adding another layer to the already high cognitive load of piloting a 1000hp hybrid machine.' },
    ],
    readTimeMin: 12,
    tags:        ['innovation', 'regulations', '2026', 'aero'],
    status:      'published' as const,
    publishedAt: new Date('2026-04-02'),
    aiGenerated: false,
  },
];

const SEED_SIGNALS = [
  {
    sessionKey:  'monza_p1_2026',
    lap:         24,
    location:    'SECTOR 2',
    priority:    'high' as const,
    title:       'Medium compound front-left graining exceeding predicted model by 14%.',
    meaning:     'Current pace delta will drop by +0.8s per lap within next 3 laps.',
    implication: 'Strategy window shifting. Mandatory pit for Hard compound required 4 laps early.',
    telemetryFields: [
      { label: 'Tire Temp (FL)', value: '115°C',          colorToken: 'text-f1-red',        percentage: 85 },
      { label: 'Wear Rate',      value: '+14% vs Model',  colorToken: 'text-f1-red',        percentage: 60 },
    ],
    isActive:    true,
    aiGenerated: false,
  },
  {
    sessionKey:  'monza_p1_2026',
    lap:         22,
    location:    'TURN 4',
    priority:    'med' as const,
    title:       'Sudden drop in rear downforce detected on corner entry.',
    meaning:     'Potential debris strike to underfloor or diffuser stall.',
    implication: 'Monitor cornering speeds. Adjust brake bias forward to compensate for rear instability.',
    telemetryFields: [
      { label: 'AERO BAL',   value: '42.1% F', colorToken: 'text-primary'        },
      { label: 'R-RIDE HGT', value: '+2mm',    colorToken: 'text-caution-yellow' },
      { label: 'DELTA',      value: '+0.15s',  colorToken: 'text-f1-red'         },
    ],
    isActive:    true,
    aiGenerated: false,
  },
  {
    sessionKey:  'monza_p1_2026',
    lap:         15,
    location:    'PIT STRAIGHT',
    priority:    'low' as const,
    title:       'ERS deployment optimized, exiting slipstream.',
    meaning:     'Target top speed achieved 50m earlier than previous lap.',
    implication: 'Overtake delta established. Prepare for move into Turn 1.',
    telemetryFields: [],
    isActive:    true,
    aiGenerated: false,
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  await mongoose.connect(env.MONGODB_URI);
  logger.info('Connected to MongoDB');

  // ── Stories ──────────────────────────────────────────────────────────────
  await Story.deleteMany({});
  const stories = await Story.insertMany(SEED_STORIES);
  logger.info(`Seeded ${stories.length} stories`);

  // ── Signals ───────────────────────────────────────────────────────────────
  await Signal.deleteMany({});
  const signals = await Signal.insertMany(SEED_SIGNALS);
  logger.info(`Seeded ${signals.length} signals`);

  // ── GraphSpec for 'anatomy-of-an-undercut' ────────────────────────────────
  await GraphSpec.deleteMany({});
  const undercut = stories.find(s => s.slug === 'anatomy-of-an-undercut');
  if (undercut) {
    await GraphSpec.create({
      type:       'annotated_svg',
      title:      'Undercut Window — Lap Delta vs Leader',
      subtitle:   'Lap 18–21 · Driver A (red) vs Driver B (blue)',
      storyId:    undercut._id,
      sessionKey: null,
      xAxis:      null,
      yAxis:      null,
      series:     [],
      dataPoints: [],
      projectionConfig: null,
      svgPaths: [
        { d: 'M 0 60 L 50 55 L 100 40 L 150 30 L 200 20', stroke: '#e8002d', strokeWidth: 2, fill: 'none' },
        { d: 'M 0 60 L 50 60 L 100 62 L 150 65 L 200 68', stroke: '#0067ff', strokeWidth: 2, fill: 'none' },
      ],
      annotations: [
        { type: 'band',  xValue: 100, xRange: [100, 150], color: 'rgba(232,0,45,0.15)', label: 'Undercut window' },
        { type: 'point', xValue: 150, xRange: null,       color: '#e8002d',             label: 'Position change'  },
      ],
      generatedByAI: false,
      aiRunId:       null,
    });
    logger.info('Seeded GraphSpec for anatomy-of-an-undercut');
  }

  // ── Admin user placeholder ────────────────────────────────────────────────
  // The admin user record is created automatically on first Firebase login.
  // To promote an existing user to admin, run:
  //   db.users.updateOne({ email: "you@example.com" }, { $set: { role: "admin" } })
  const userCount = await User.countDocuments();
  logger.info(`Users in DB: ${userCount} (promoted via PATCH /api/auth/users/:id/role)`);

  await mongoose.disconnect();
  logger.info('Seed complete ✓');
}

seed().catch((err) => {
  logger.error('Seed failed', { error: err });
  process.exit(1);
});
