export interface InterestTopic {
  id: string;
  label: string;
  emoji: string;
  category: string;
  keywords: string[];
}

export const INTEREST_TOPICS: InterestTopic[] = [
  // Technology
  { id: 'ai-ml',        label: 'AI & Machine Learning', emoji: '🤖', category: 'Technology', keywords: ['ai', 'a.i.', 'artificial intelligence', 'machine learning', 'llm', 'openai', 'chatgpt', 'gpt', 'gemini', 'google ai', 'claude', 'anthropic', 'deepmind', 'generative ai', 'gen ai', 'deep learning', 'neural network', 'copilot', 'llama', 'mistral', 'agi', 'ai model', 'chatbot'] },
  { id: 'smartphones',  label: 'Smartphones & Gadgets',  emoji: '📱', category: 'Technology', keywords: ['iphone', 'android', 'samsung', 'galaxy', 'pixel', 'oneplus', 'smartphone', 'gadget', 'xiaomi', 'redmi', 'realme', 'vivo', 'oppo', 'foldable', 'ios', 'apple watch', 'wearable'] },
  { id: 'cybersecurity',label: 'Cybersecurity',          emoji: '🔐', category: 'Technology', keywords: ['hack', 'hacked', 'hacker', 'cyber', 'cyberattack', 'cybersecurity', 'breach', 'data breach', 'ransomware', 'malware', 'phishing', 'vulnerability', 'exploit', 'zero-day', 'spyware', 'data leak', 'ddos'] },
  { id: 'space',        label: 'Space & Astronomy',      emoji: '🚀', category: 'Technology', keywords: ['nasa', 'spacex', 'isro', 'rocket', 'satellite', 'mars', 'moon', 'lunar', 'asteroid', 'space', 'cosmos', 'starship', 'falcon 9', 'chandrayaan', 'gaganyaan', 'orbit', 'spacecraft', 'astronaut'] },
  { id: 'ev',           label: 'Electric Vehicles',      emoji: '⚡', category: 'Technology', keywords: ['tesla', 'electric vehicle', 'ev', 'evs', 'battery', 'charging', 'ola electric', 'tata ev', 'byd', 'rivian', 'lucid', 'e-scooter', 'ev sales', 'ather'] },
  { id: 'startups',     label: 'Startups & VC',          emoji: '🦄', category: 'Technology', keywords: ['startup', 'startups', 'funding', 'seed round', 'series a', 'series b', 'series c', 'unicorn', 'venture capital', 'venture', 'founder', 'valuation', 'fundraise', 'angel investor'] },
  { id: 'crypto',       label: 'Blockchain & Crypto',    emoji: '₿',  category: 'Technology', keywords: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cryptocurrency', 'blockchain', 'defi', 'nft', 'web3', 'solana', 'binance', 'coinbase', 'stablecoin', 'token'] },
  { id: 'gaming',       label: 'Gaming',                 emoji: '🎮', category: 'Technology', keywords: ['game', 'gaming', 'gamer', 'xbox', 'playstation', 'ps5', 'nintendo', 'switch', 'esports', 'steam', 'gta', 'valorant', 'video game'] },
  { id: 'social-media', label: 'Social Media',           emoji: '📣', category: 'Technology', keywords: ['twitter', 'x corp', 'elon musk', 'instagram', 'tiktok', 'facebook', 'meta', 'whatsapp', 'youtube', 'linkedin', 'snapchat', 'threads', 'reddit', 'social media'] },
  { id: 'cloud',        label: 'Cloud Computing',        emoji: '☁️', category: 'Technology', keywords: ['aws', 'azure', 'google cloud', 'cloud computing', 'cloud', 'saas', 'data center', 'kubernetes', 'devops', 'server', 'oracle cloud'] },

  // India
  { id: 'india-politics', label: 'Indian Politics',      emoji: '🇮🇳', category: 'India', keywords: ['modi', 'narendra modi', 'bjp', 'congress', 'rahul gandhi', 'parliament', 'lok sabha', 'rajya sabha', 'election', 'chief minister', 'cm ', 'cabinet', 'amit shah', 'opposition', 'nda', 'india alliance', 'minister', 'mla', 'mp ', 'assembly', 'poll', 'bypoll', 'shah', 'kharge'] },
  { id: 'india-economy',  label: 'Indian Economy',       emoji: '📊', category: 'India', keywords: ['gdp', 'rbi', 'inflation', 'rupee', 'budget', 'fiscal deficit', 'gst', 'repo rate', 'economic growth', 'imf india', 'fdi', 'india economy', 'forex reserves'] },
  { id: 'india-startups', label: 'Indian Startups',      emoji: '🏢', category: 'India', keywords: ['zomato', 'swiggy', 'flipkart', 'ola', 'paytm', 'byju', 'razorpay', 'meesho', 'zepto', 'blinkit', 'phonepe', 'nykaa', 'startup india', 'unicorn', 'cred'] },
  { id: 'defence',        label: 'Defence & Military',   emoji: '🪖', category: 'India', keywords: ['army', 'defence', 'defense', 'missile', 'air force', 'navy', 'border', 'military', 'drdo', 'loc', 'surgical strike', 'brahmos', 'rafale', 'agni', 'indian army', 'troops', 'soldier'] },
  { id: 'infrastructure', label: 'Infrastructure',       emoji: '🏗️', category: 'India', keywords: ['highway', 'railway', 'metro', 'airport', 'port', 'infrastructure', 'expressway', 'vande bharat', 'bullet train', 'nhai', 'smart city', 'flyover'] },
  { id: 'india-health',   label: 'Health & Pharma',      emoji: '💊', category: 'India', keywords: ['hospital', 'vaccine', 'health', 'pharma', 'drug', 'medicine', 'disease', 'aiims', 'epidemic', 'covid', 'dengue', 'outbreak', 'icmr', 'virus'] },
  { id: 'india-edu',      label: 'Education',            emoji: '🎓', category: 'India', keywords: ['iit', 'iim', 'neet', 'jee', 'school', 'university', 'education', 'upsc', 'cbse', 'board exam', 'ugc', 'nep', 'student', 'college'] },
  { id: 'mumbai',         label: 'Mumbai & Maharashtra', emoji: '🌆', category: 'India', keywords: ['mumbai', 'maharashtra', 'bmc', 'thackeray', 'shiv sena', 'pune', 'nagpur', 'fadnavis', 'ncp', 'eknath shinde'] },
  { id: 'delhi',          label: 'Delhi & NCR',          emoji: '🏛️', category: 'India', keywords: ['delhi', 'ncr', 'kejriwal', 'aap', 'noida', 'gurgaon', 'gurugram', 'faridabad', 'mcd', 'delhi government'] },
  { id: 'judiciary',      label: 'Judiciary & Law',      emoji: '⚖️', category: 'India', keywords: ['supreme court', 'high court', 'cbi', 'enforcement directorate', 'judiciary', 'verdict', 'bail', 'arrest', 'fir', 'chief justice', 'court', 'plea', 'petition'] },

  // World
  { id: 'us-politics',    label: 'US Politics',          emoji: '🇺🇸', category: 'World', keywords: ['trump', 'donald trump', 'biden', 'harris', 'us congress', 'senate', 'white house', 'democrat', 'republican', 'washington', 'maga', 'us election', 'capitol', 'gop', 'pentagon', 'us president'] },
  { id: 'middle-east',    label: 'Middle East',          emoji: '🕌', category: 'World', keywords: ['israel', 'palestine', 'gaza', 'iran', 'saudi', 'lebanon', 'hamas', 'hezbollah', 'netanyahu', 'idf', 'west bank', 'tehran', 'houthi', 'qatar', 'syria'] },
  { id: 'russia-ukraine', label: 'Russia-Ukraine',       emoji: '🌍', category: 'World', keywords: ['russia', 'ukraine', 'putin', 'zelensky', 'nato', 'kyiv', 'moscow', 'kremlin', 'donbas', 'frontline', 'russian forces', 'drone strike'] },
  { id: 'china',          label: 'China & Taiwan',       emoji: '🇨🇳', category: 'World', keywords: ['china', 'chinese', 'xi jinping', 'taiwan', 'beijing', 'pla', 'hong kong', 'ccp', 'taiwan strait', 'south china sea', 'shanghai'] },
  { id: 'uk-europe',      label: 'UK & Europe',          emoji: '🇬🇧', category: 'World', keywords: ['uk', 'britain', 'british', 'eu', 'europe', 'sunak', 'starmer', 'macron', 'germany', 'france', 'london', 'brussels', 'european union', 'brexit', 'italy', 'spain'] },
  { id: 'climate',        label: 'Climate & Environment',emoji: '🌱', category: 'World', keywords: ['climate', 'carbon', 'emission', 'global warming', 'cop', 'green energy', 'renewable', 'solar', 'wildfire', 'flood', 'heatwave', 'cyclone', 'pollution', 'environment'] },
  { id: 'trade',          label: 'International Trade',  emoji: '🤝', category: 'World', keywords: ['tariff', 'trade war', 'import', 'export', 'wto', 'sanctions', 'trade deal', 'customs duty', 'supply chain', 'free trade'] },
  { id: 'africa',         label: 'Africa',               emoji: '🌍', category: 'World', keywords: ['africa', 'nigeria', 'kenya', 'ethiopia', 'south africa', 'ghana', 'egypt', 'sudan', 'congo', 'african union'] },
  { id: 'southeast-asia', label: 'Southeast Asia',       emoji: '🌏', category: 'World', keywords: ['myanmar', 'bangladesh', 'sri lanka', 'pakistan', 'nepal', 'thailand', 'vietnam', 'indonesia', 'philippines', 'malaysia', 'afghanistan', 'taliban'] },
  { id: 'diplomacy',      label: 'Diplomacy & UN',       emoji: '🕊️', category: 'World', keywords: ['united nations', 'un ', 'g7', 'g20', 'imf', 'diplomacy', 'treaty', 'summit', 'bilateral', 'foreign policy', 'embassy', 'ambassador', 'sanctions'] },

  // Markets
  { id: 'stock-markets',  label: 'Stock Markets',        emoji: '📈', category: 'Markets', keywords: ['sensex', 'nifty', 'bse', 'nse', 'stock', 'shares', 'stock market', 'rally', 'market crash', 'bull', 'bear', 'trading', 'dalal street', 'wall street', 'dow', 'nasdaq', 's&p 500', 'share price'] },
  { id: 'crypto-markets', label: 'Crypto Markets',       emoji: '🪙', category: 'Markets', keywords: ['bitcoin', 'btc', 'ethereum', 'eth', 'altcoin', 'crypto market', 'coinbase', 'binance', 'crypto rally', 'halving', 'crypto price'] },
  { id: 'real-estate',    label: 'Real Estate',          emoji: '🏠', category: 'Markets', keywords: ['real estate', 'property', 'housing', 'realty', 'dlf', 'godrej properties', 'rent', 'home prices', 'mortgage', 'home loan'] },
  { id: 'commodities',    label: 'Gold & Commodities',   emoji: '🥇', category: 'Markets', keywords: ['gold', 'silver', 'crude oil', 'commodity', 'mcx', 'precious metals', 'copper', 'gold price', 'bullion'] },
  { id: 'banking',        label: 'Banking & Finance',    emoji: '🏦', category: 'Markets', keywords: ['hdfc', 'sbi', 'icici', 'axis bank', 'rbi', 'interest rate', 'loan', 'emi', 'bank', 'banking', 'npa', 'kotak', 'fintech'] },
  { id: 'mutual-funds',   label: 'Mutual Funds & SIP',  emoji: '💰', category: 'Markets', keywords: ['mutual fund', 'sip', 'nav', 'sebi', 'aum', 'equity fund', 'debt fund', 'elss', 'fund manager'] },
  { id: 'ipo',            label: 'IPO & Listings',       emoji: '🔔', category: 'Markets', keywords: ['ipo', 'listing', 'grey market', 'allotment', 'gmp', 'mainboard', 'sme ipo', 'public issue', 'market debut', 'share listing'] },
  { id: 'oil-energy',     label: 'Oil & Energy',         emoji: '⛽', category: 'Markets', keywords: ['oil price', 'opec', 'brent', 'crude', 'petrol', 'diesel', 'natural gas', 'energy', 'fuel', 'lng', 'refinery'] },
  { id: 'personal-fin',   label: 'Personal Finance',     emoji: '💳', category: 'Markets', keywords: ['income tax', 'epf', 'ppf', 'savings', 'tax', 'itr', 'tax deduction', '80c', 'credit card', 'pension'] },
  { id: 'global-economy', label: 'Global Economy',       emoji: '🌐', category: 'Markets', keywords: ['fed', 'federal reserve', 'interest rates', 'recession', 'gdp growth', 'imf', 'world economy', 'jerome powell', 'rate cut', 'rate hike', 'global inflation'] },

  // Business
  { id: 'big-tech',     label: 'Big Tech Companies',     emoji: '💻', category: 'Business', keywords: ['apple', 'google', 'microsoft', 'amazon', 'meta', 'nvidia', 'alphabet', 'tesla', 'intel', 'openai', 'samsung'] },
  { id: 'india-corps',  label: 'Indian Conglomerates',   emoji: '🏭', category: 'Business', keywords: ['tata', 'reliance', 'adani', 'ambani', 'infosys', 'tcs', 'wipro', 'mahindra', 'bajaj', 'birla', 'jio', 'l&t', 'hcl'] },
  { id: 'ma',           label: 'M&A & Deals',            emoji: '🤝', category: 'Business', keywords: ['acquisition', 'merger', 'takeover', 'buyout', 'deal', 'stake', 'acquires', 'm&a', 'acquired', 'consolidation'] },
  { id: 'ecommerce',    label: 'E-commerce & Retail',    emoji: '🛒', category: 'Business', keywords: ['amazon', 'flipkart', 'meesho', 'retail', 'ecommerce', 'e-commerce', 'quick commerce', 'blinkit', 'zepto', 'instamart', 'd2c', 'reliance retail'] },
  { id: 'pharma-biz',   label: 'Pharma & Healthcare',    emoji: '🧬', category: 'Business', keywords: ['sun pharma', 'cipla', 'dr reddy', 'biocon', 'pharma', 'apollo hospitals', 'fortis', 'lupin', 'drugmaker', 'fda'] },
  { id: 'auto',         label: 'Auto Industry',          emoji: '🚗', category: 'Business', keywords: ['maruti', 'hyundai', 'tata motors', 'mahindra', 'hero', 'bajaj auto', 'car sales', 'auto sales', 'two-wheeler', 'suv', 'car launch', 'automaker'] },
  { id: 'aviation',     label: 'Aviation',               emoji: '✈️', category: 'Business', keywords: ['air india', 'indigo', 'spicejet', 'airline', 'aviation', 'airport', 'vistara', 'akasa', 'flight', 'dgca'] },
  { id: 'telecom',      label: 'Telecom',                emoji: '📡', category: 'Business', keywords: ['jio', 'airtel', 'vodafone idea', 'bsnl', '5g', 'telecom', 'spectrum', 'broadband', 'trai', 'tariff hike'] },
  { id: 'media-ott',    label: 'Media & OTT',            emoji: '🎬', category: 'Business', keywords: ['netflix', 'hotstar', 'jiocinema', 'sony', 'zee', 'ott', 'streaming', 'prime video', 'disney', 'box office'] },
  { id: 'manufacturing',label: 'Manufacturing & PLI',    emoji: '🏗️', category: 'Business', keywords: ['manufacturing', 'pli', 'make in india', 'semiconductor', 'factory', 'plant', 'production', 'chip fab', 'foxconn'] },
];

export const INTEREST_CATEGORIES = ['Technology', 'India', 'World', 'Markets', 'Business'] as const;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Stars (1-5) translate to ranking bonus with widening influence:
// 1=2, 2=5, 3=10, 4=18, 5=30. Non-linear so 5★ topics clearly outweigh 1★.
const STAR_WEIGHT: Record<number, number> = { 1: 2, 2: 5, 3: 10, 4: 18, 5: 30 };

export function scoreClusterInterest(
  headline: string,
  summary: string,
  interests: Record<string, number>,
): number {
  const text = (headline + ' ' + summary).toLowerCase();
  let bonus = 0;
  for (const topic of INTEREST_TOPICS) {
    const stars = Math.max(0, Math.min(5, interests[topic.id] ?? 0));
    if (stars === 0) continue;
    // Word-boundary match to avoid "ai" inside "rain", "aim" etc.
    const matched = topic.keywords.some(kw => {
      const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(kw.toLowerCase())}(?:[^a-z0-9]|$)`, 'i');
      return re.test(text);
    });
    if (matched) bonus += STAR_WEIGHT[stars] ?? 0;
  }
  return bonus;
}
