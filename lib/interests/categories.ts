/** The interest taxonomy, shared by onboarding and Settings (keep in sync with the apps). */
export interface InterestCategory {
  emoji: string;
  label: string;
  subs: string[];
}

export const INTEREST_CATEGORIES: InterestCategory[] = [
  { emoji: '🎵', label: 'Music', subs: ['Live Shows', 'DJing', 'Producing', 'Guitar', 'Piano', 'Singing', 'Alto Sax', 'Tenor Sax', 'Drums', 'Violin', 'Bass', 'Songwriting'] },
  { emoji: '🎼', label: 'Instruments', subs: ['Alto Sax', 'Tenor Sax', 'Trumpet', 'Clarinet', 'Cello', 'Flute', 'Ukulele', 'Synth', 'Beat Making'] },
  { emoji: '🥾', label: 'Hiking', subs: ['Day Hikes', 'Backpacking', 'Trail Running', 'Rock Climbing', 'Scrambling', 'Nature Walks'] },
  { emoji: '☕', label: 'Coffee', subs: ['Espresso', 'Pour Over', 'Cafe Hopping', 'Latte Art', 'Home Brewing'] },
  { emoji: '🎮', label: 'Gaming', subs: ['PC', 'Console', 'Indie', 'Board Games', 'VR', 'Competitive', 'Co-op', 'RPG', 'Strategy'] },
  { emoji: '📚', label: 'Reading', subs: ['Fiction', 'Non-Fiction', 'Sci-Fi', 'Fantasy', 'Book Clubs', 'Poetry'] },
  { emoji: '💪', label: 'Fitness', subs: ['Gym', 'Yoga', 'CrossFit', 'Running', 'Swimming', 'Martial Arts', 'Pilates', 'Cycling'] },
  { emoji: '💻', label: 'Tech', subs: ['AI/ML', 'Web Dev', 'Mobile Dev', 'Cybersecurity', 'Hardware', 'Open Source', 'Cloud', 'Data Science'] },
  { emoji: '🎨', label: 'Art', subs: ['Painting', 'Sketching', 'Digital Art', 'Sculpture', 'Ceramics', 'Street Art', 'Calligraphy', 'Graphic Design'] },
  { emoji: '🎬', label: 'Film', subs: ['Indie Film', 'Horror', 'Documentaries', 'Animation', 'Film Making'] },
  { emoji: '🍕', label: 'Food', subs: ['Cooking', 'Baking', 'Food Trucks', 'Fine Dining', 'Vegan', 'BBQ', 'Sushi', 'Meal Prep'] },
  { emoji: '✈️', label: 'Travel', subs: ['Backpacking', 'Road Trips', 'City Breaks', 'Solo Travel', 'Camping', 'Digital Nomad', 'Hostels'] },
  { emoji: '👨‍💻', label: 'Coding', subs: ['Python', 'JavaScript', 'Rust', 'Hackathons', 'Side Projects', 'Kotlin', 'TypeScript', 'Game Dev'] },
  { emoji: '⚽', label: 'Sports', subs: ['Basketball', 'Soccer', 'Baseball', 'Football', 'Tennis', 'Volleyball', 'Skiing', 'Surfing'] },
  { emoji: '🏈', label: 'Team Sports', subs: ['Baseball', 'Football', 'Softball', 'Flag Football', 'Rugby', 'Ultimate Frisbee'] },
  { emoji: '🏃', label: 'Outdoor Sports', subs: ['Running', 'Cycling', 'Triathlon', 'Climbing', 'Skiing', 'Snowboarding', 'Surfing'] },
  { emoji: '🤝', label: 'Volunteering', subs: ['Environment', 'Education', 'Community', 'Animal Welfare', 'Mentoring'] },
  { emoji: '🚀', label: 'Startups', subs: ['Founding', 'VC/Finance', 'Product', 'Growth', 'Social Impact'] },
  { emoji: '📸', label: 'Photography', subs: ['Street', 'Portrait', 'Landscape', 'Film Photography', 'Drone', 'Concert Photography', 'Editing'] },
  { emoji: '🧘', label: 'Wellness', subs: ['Meditation', 'Mindfulness', 'Breathwork', 'Journaling', 'Mental Health'] },
  { emoji: '🗣️', label: 'Languages', subs: ['Spanish', 'French', 'Mandarin', 'Japanese', 'Korean', 'Language Exchange'] },
  { emoji: '🎭', label: 'Performing Arts', subs: ['Theater', 'Improv', 'Acting', 'Stand-up Comedy', 'Dance'] },
  { emoji: '🐶', label: 'Animals', subs: ['Dogs', 'Cats', 'Birds', 'Animal Rescue', 'Pet Training'] },
  { emoji: '🧩', label: 'Puzzles & Strategy', subs: ['Chess', 'Sudoku', 'Escape Rooms', 'Crosswords', 'Go'] },
];

export const MIN_TAGS = 3;
