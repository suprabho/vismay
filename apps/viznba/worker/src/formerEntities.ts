/**
 * Notable people no longer on any roster — retired players, legends, former
 * head coaches — who still drive NBA news (deaths, Hall of Fame, retirements,
 * jersey nights, ownership, punditry). The roster seed only sees current
 * rosters, so without this list "Bob Pettit dies at 93" resolves to nothing.
 *
 * seedRoster.ts looks each name up on ESPN and writes it with active=false;
 * the resolver prefers an active row whenever a key is shared, so these never
 * steal a current player's name. Anyone back on a roster is skipped.
 *
 * Names must match ESPN's display name exactly. Add a name when the dry run or
 * an `[entity-miss]` log shows a real miss.
 */

export const FORMER_PLAYERS: string[] = [
  // Legends the press reaches for constantly
  'Michael Jordan',
  'Kobe Bryant',
  'Magic Johnson',
  'Larry Bird',
  'Kareem Abdul-Jabbar',
  "Shaquille O'Neal",
  'Tim Duncan',
  'Dirk Nowitzki',
  'Bill Russell',
  'Wilt Chamberlain',
  'Hakeem Olajuwon',
  'Jerry West',
  'Oscar Robertson',
  'Julius Erving',
  'Bob Pettit',
  'Karl Malone',
  'John Stockton',
  'Isiah Thomas',
  'Patrick Ewing',
  'Charles Barkley',
  'Scottie Pippen',
  'Dennis Rodman',
  'Allen Iverson',
  'Kevin Garnett',
  'Paul Pierce',
  'Ray Allen',
  'Reggie Miller',
  'Dwyane Wade',
  'Steve Nash',
  'Vince Carter',
  'Tracy McGrady',
  'Yao Ming',
  'Pau Gasol',
  'Manu Ginobili',
  'Tony Parker',
  'Carmelo Anthony',
  'Dwight Howard',
  'Derrick Rose',
  // Recently retired / out of the league, still in the news
  'Russell Westbrook',
  'JR Smith',
]

/** Former head coaches; they also land in viznba_coaches as inactive rows. */
export const FORMER_COACHES: string[] = [
  'Gregg Popovich',
  'Phil Jackson',
  'Pat Riley',
  'Don Nelson',
  'Lenny Wilkens',
  'Larry Brown',
  "Mike D'Antoni",
]
