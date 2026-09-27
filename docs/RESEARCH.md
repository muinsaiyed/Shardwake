# Reference research: *Smash Hit* (Mediocre AB, 2014)

We use this only as a **mechanical and mood reference**. We copy no names, logos, levels, textures, models or music.

## Sources
1. Apple App Store listing, Mediocre AB: https://apps.apple.com/us/app/smash-hit/id603527166
2. Google Play listing: https://play.google.com/store/apps/details?id=com.mediocre.smashhit (the page wouldn't render through our fetch tool, so we relied on the App Store text, which is the same)
3. Wikipedia, "Smash Hit": https://en.wikipedia.org/wiki/Smash_Hit
4. Smash Hit community wiki (Miraheze): https://smashhit.miraheze.org/wiki/Smash_Hit (secondary)
5. JayIsGames review: https://jayisgames.com/review/smash-hit.php (secondary)
6. TV Tropes and Gamezebo pages surfaced by search (secondary, used only to cross-check)

## Confirmed (official store listing or several sources agree)
| Topic | Detail | Source |
|---|---|---|
| Perspective | First-person, automatically advancing rail shooter. The player never steers. | 1, 3, 5 |
| Controls | Tap or click a point to throw a metal ball toward it | 1, 5 |
| Ammo | Limited balls. The run ends when they run out | 1, 3 |
| Collision | Crashing into an obstacle costs **10 balls** and resets multiball | 3, 4 |
| Crystals | Shooting special crystals restores balls. The amount depends on the crystal's shape | 1, 3 |
| Multiball | Consecutive crystal hits raise the balls fired per tap, **up to 5**. A throw still costs 1 ball | 3, 4 |
| Streak break | Missing a crystal or taking damage resets multiball to 1 | 3 |
| Streak rate | Multiball goes up every **10 consecutive crystals** | 4 (secondary) |
| Power-ups | Temporary: endless balls ("Ball Frenzy", fired by holding), explosive balls ("Nitro"), slow motion ("Slo-mo") | 3, 4, 5 |
| Structure | 11 visual styles or levels, 50+ rooms, checkpoints between levels (a premium unlock), endless play after the last level | 1, 3 |
| Modes | Classic, Zen, Mayhem, Training, Versus, Co-op | 1, 4 |
| Audio | Music is synced to gameplay, and "obstacles move to each new tune". Composer: Douglas Holmquist | 1, 3 |
| Score | Measured as distance travelled | 3 |

## Unverified or assumed
- **Starting balls = 25.** This is the commonly cited figure, but no official source confirmed it. We use 25.
- **Power-up durations** aren't documented anywhere we found. Ours are design choices: Overdrive 6 s, Nova 8 s, Stasis 6 s.
- **Doors and switches:** secondary sources and our general knowledge of the genre describe doors opened by shooting buttons. The official listing doesn't mention them.
- **Streak rate:** the original reportedly needs 10 crystals per multiball tier. Our slice is short (4 rooms, about 90 s), so we use **5 crystals per tier** so players can actually reach 5 balls. This is a deliberate tuning change.

## Mechanics summary (what we build)
- Automatic forward travel along a fixed rail. Speed rises from room to room.
- Click or tap to throw a ball along the camera ray through that point. Balls follow a light ballistic arc.
- Ammo starts at 25. Each tap costs 1 ball, whatever the multiball level. A crash costs 10 and resets the streak. The run ends at 0.
- Crystals give +3 (small) or +5 (large). Every 5 consecutive crystal hits add a ball to each throw, up to 5. A crystal that passes the camera unbroken, or a crash, resets the streak.
- Glass shatters. Metal is solid and deflects balls. Switches open doors and freeze crushers.
- Power-ups: infinite ammo (hold to stream), explosive balls (smash metal and nearby glass), slowed time.
- Rooms have distinct palettes and structures. Each room has its own music pattern, and moving obstacles are phase-locked to the beat.
- Checkpoints at each room boundary. Game over offers "retry from checkpoint" or a full restart.
