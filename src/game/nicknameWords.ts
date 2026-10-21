/**
 * Curated nickname halves. Players only get `adjective + noun`.
 * Every pair is original: no people, clubs, or brands.
 * `nicknameWords.test.ts` scans every combo against the blocked-word list.
 * `docs/NICKNAME_WORDS.md` and the SQL seed are generated from these arrays.
 */

export const ADJECTIVES = [
  'Turbo', 'Golden', 'Rocket', 'Shadow', 'Neon', 'Thunder', 'Cosmic', 'Blazing', 'Street', 'Lightning',
  'Mega', 'Wild', 'Frosty', 'Ninja', 'Laser', 'Supersonic', 'Electric', 'Galactic', 'Silent', 'Iron',
  'Crimson', 'Mighty', 'Rapid', 'Brave', 'Lucky', 'Sunny', 'Velvet', 'Marble', 'Silver', 'Bronze',
  'Copper', 'Emerald', 'Sapphire', 'Diamond', 'Platinum', 'Atomic', 'Sonic', 'Hyper', 'Prime',
  'Royal', 'Noble', 'Swift', 'Flash', 'Inferno', 'Solar', 'Lunar', 'Stellar', 'Astral', 'Polar',
  'Arctic', 'Jungle', 'Urban', 'Midnight', 'Dawn', 'Dusk', 'Rainbow', 'Retro', 'Funky', 'Groovy',
  'Rhythm', 'Tempo', 'Echo', 'Chill', 'Icy', 'Fiery', 'Heroic', 'Fearless', 'Daring', 'Bold',
  'Steady', 'Clever', 'Sneaky', 'Stealth', 'Phantom', 'Ghost', 'Spirit', 'Mystic', 'Magic', 'Wonder',
  'Epic', 'Iconic', 'Shiny', 'Glossy', 'Metal', 'Steel', 'Titan', 'Giant', 'Tiny', 'Mini',
  'Jumbo', 'Colossal', 'Massive', 'Bright', 'Radiant', 'Glowing', 'Dazzle', 'Zoom', 'Dash', 'Nitro',
  'Boost', 'Power', 'Energy', 'Volt', 'Pulse', 'Storm', 'Cyclone', 'Tornado', 'Breeze', 'Cloud',
  'Nova', 'Meteor', 'Astro', 'Nebula', 'Cosmos', 'Zenith', 'Apex', 'Summit', 'Alpine', 'Canyon',
  'Desert', 'Oasis', 'Ocean', 'River', 'Frost', 'Glacier', 'Frozen', 'Molten', 'Ember', 'Flame',
  'Scorch', 'Zephyr', 'Aero', 'Kinetic', 'Quantum', 'Photon', 'Plasma', 'Circuit', 'Arcade', 'Fiesta',
  'Samba', 'Bravo', 'Vivid', 'Blizzard', 'Prism', 'Quartz', 'Onyx', 'Cobalt', 'Indigo',
  'Magenta', 'Cyan',
] as const;

export const NOUNS = [
  'Striker', 'Keeper', 'Volley', 'Nutmeg', 'Rabona', 'Panenka', 'Maestro', 'Wizard', 'Panther', 'Falcon',
  'Cobra', 'Tiger', 'Wolf', 'Dragon', 'Phoenix', 'Rhino', 'Shark', 'Comet', 'Legend', 'Juggler',
  'Bandit', 'Pirate', 'Samurai', 'Goalie', 'Sweeper', 'Winger', 'Captain', 'Playmaker', 'Finisher', 'Dribbler',
  'Scorer', 'Header', 'Curler', 'Chipper', 'Spinner', 'Hopper', 'Kicker', 'Jumper', 'Dancer', 'Groover',
  'Ranger', 'Rider', 'Racer', 'Sprinter', 'Flyer', 'Glider', 'Climber', 'Rover', 'Nomad', 'Voyager',
  'Scout', 'Knight', 'Guardian', 'Champion', 'Artist', 'Dreamer', 'Builder', 'Lion', 'Leopard', 'Cheetah',
  'Lynx', 'Ocelot', 'Bobcat', 'Cougar', 'Bear', 'Panda', 'Koala', 'Otter', 'Beaver', 'Fox',
  'Coyote', 'Hyena', 'Eagle', 'Hawk', 'Owl', 'Raven', 'Parrot', 'Toucan', 'Flamingo', 'Penguin',
  'Pelican', 'Heron', 'Crane', 'Dove', 'Dolphin', 'Whale', 'Orca', 'Marlin', 'Turtle', 'Gecko',
  'Iguana', 'Viper', 'Python', 'Mamba', 'Frog', 'Toad', 'Zebra', 'Giraffe', 'Elephant', 'Hippo',
  'Buffalo', 'Bison', 'Gazelle', 'Impala', 'Kangaroo', 'Wombat', 'Hornet', 'Beetle', 'Mantis',
  'Octopus', 'Squid', 'Camel', 'Llama', 'Lemur', 'Unicorn', 'Griffin', 'Kraken', 'Yeti',
  'Scorpion', 'Corner', 'Penalty', 'Touchline', 'Elastico', 'Roulette', 'Bicycle', 'Acrobat', 'Magician', 'Drummer',
  'Pioneer', 'Paladin', 'Warden', 'Flicker', 'Balancer', 'Poet', 'Skipper', 'Midfielder', 'Defender',
  'Forward', 'Condor', 'Macaw', 'Ibex', 'Okapi', 'Tapir', 'Bongo', 'Badger', 'Rabbit',
  'Walrus', 'Narwhal', 'Starling', 'Sparrow',
] as const;

export type NicknameAdjective = (typeof ADJECTIVES)[number];
export type NicknameNoun = (typeof NOUNS)[number];
