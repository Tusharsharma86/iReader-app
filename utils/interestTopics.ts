export interface InterestTopic {
  id: string;
  label: string;
  emoji: string;
  category: string;
  keywords: string[];
}

export const INTEREST_TOPICS: InterestTopic[] = [
  // Technology
  { id: 'ai-ml',        label: 'AI & Machine Learning', emoji: '🤖', category: 'Technology', keywords: ['ai', 'artificial intelligence', 'machine learning', 'llm', 'openai', 'gemini', 'claude', 'chatgpt', 'deep learning', 'neural'] },
  { id: 'smartphones',  label: 'Smartphones & Gadgets',  emoji: '📱', category: 'Technology', keywords: ['iphone', 'android', 'samsung', 'pixel', 'oneplus', 'smartphone', 'gadget', 'xiaomi', 'realme', 'vivo'] },
  { id: 'cybersecurity',label: 'Cybersecurity',          emoji: '🔐', category: 'Technology', keywords: ['hack', 'cyber', 'breach', 'ransomware', 'malware', 'phishing', 'security', 'vulnerability', 'exploit'] },
  { id: 'space',        label: 'Space & Astronomy',      emoji: '🚀', category: 'Technology', keywords: ['nasa', 'spacex', 'isro', 'rocket', 'satellite', 'mars', 'moon', 'asteroid', 'space', 'cosmos'] },
  { id: 'ev',           label: 'Electric Vehicles',      emoji: '⚡', category: 'Technology', keywords: ['tesla', 'electric vehicle', 'ev', 'battery', 'charging', 'ola electric', 'tata nexon ev'] },
  { id: 'startups',     label: 'Startups & VC',          emoji: '🦄', category: 'Technology', keywords: ['startup', 'funding', 'series a', 'series b', 'unicorn', 'venture', 'founder', 'seed round'] },
  { id: 'crypto',       label: 'Blockchain & Crypto',    emoji: '₿',  category: 'Technology', keywords: ['bitcoin', 'ethereum', 'crypto', 'blockchain', 'defi', 'nft', 'web3', 'solana', 'binance'] },
  { id: 'gaming',       label: 'Gaming',                 emoji: '🎮', category: 'Technology', keywords: ['game', 'gaming', 'xbox', 'playstation', 'nintendo', 'esports', 'steam', 'fortnite', 'gta'] },
  { id: 'social-media', label: 'Social Media',           emoji: '📣', category: 'Technology', keywords: ['twitter', 'x.com', 'instagram', 'tiktok', 'facebook', 'meta', 'youtube', 'linkedin', 'snapchat'] },
  { id: 'cloud',        label: 'Cloud Computing',        emoji: '☁️', category: 'Technology', keywords: ['aws', 'azure', 'google cloud', 'cloud', 'saas', 'infrastructure', 'kubernetes', 'devops', 'server'] },

  // India
  { id: 'india-politics', label: 'Indian Politics',      emoji: '🇮🇳', category: 'India', keywords: ['modi', 'bjp', 'congress', 'parliament', 'lok sabha', 'rajya sabha', 'election', 'chief minister', 'minister'] },
  { id: 'india-economy',  label: 'Indian Economy',       emoji: '📊', category: 'India', keywords: ['gdp', 'rbi', 'inflation', 'rupee', 'budget', 'fiscal deficit', 'economy india', 'imf india'] },
  { id: 'india-startups', label: 'Indian Startups',      emoji: '🏢', category: 'India', keywords: ['zomato', 'swiggy', 'flipkart', 'ola', 'paytm', 'byju', 'razorpay', 'meesho', 'zepto', 'blinkit'] },
  { id: 'defence',        label: 'Defence & Military',   emoji: '🪖', category: 'India', keywords: ['army', 'defence', 'missile', 'air force', 'navy', 'border', 'military', 'drdo', 'loc', 'surgical strike'] },
  { id: 'infrastructure', label: 'Infrastructure',       emoji: '🏗️', category: 'India', keywords: ['highway', 'railway', 'metro', 'airport', 'port', 'infrastructure', 'expressway', 'vande bharat'] },
  { id: 'india-health',   label: 'Health & Pharma',      emoji: '💊', category: 'India', keywords: ['hospital', 'vaccine', 'health', 'pharma', 'drug', 'medicine', 'disease', 'aiims', 'epidemic'] },
  { id: 'india-edu',      label: 'Education',            emoji: '🎓', category: 'India', keywords: ['iit', 'iim', 'neet', 'jee', 'school', 'university', 'education', 'upsc', 'cbse', 'board exam'] },
  { id: 'mumbai',         label: 'Mumbai & Maharashtra', emoji: '🌆', category: 'India', keywords: ['mumbai', 'maharashtra', 'bmc', 'thackeray', 'shiv sena', 'pune', 'nagpur'] },
  { id: 'delhi',          label: 'Delhi & NCR',          emoji: '🏛️', category: 'India', keywords: ['delhi', 'ncr', 'kejriwal', 'aap', 'noida', 'gurgaon', 'faridabad', 'mcd'] },
  { id: 'judiciary',      label: 'Judiciary & Law',      emoji: '⚖️', category: 'India', keywords: ['supreme court', 'high court', 'cbi', 'ed', 'judiciary', 'verdict', 'bail', 'arrest', 'fir'] },

  // World
  { id: 'us-politics',    label: 'US Politics',          emoji: '🇺🇸', category: 'World', keywords: ['trump', 'biden', 'harris', 'congress', 'senate', 'white house', 'democrat', 'republican', 'washington'] },
  { id: 'middle-east',    label: 'Middle East',          emoji: '🕌', category: 'World', keywords: ['israel', 'palestine', 'gaza', 'iran', 'saudi', 'lebanon', 'hamas', 'hezbollah', 'netanyahu'] },
  { id: 'russia-ukraine', label: 'Russia-Ukraine',       emoji: '🌍', category: 'World', keywords: ['russia', 'ukraine', 'putin', 'zelensky', 'nato', 'kyiv', 'moscow', 'war ukraine', 'frontline'] },
  { id: 'china',          label: 'China & Taiwan',       emoji: '🇨🇳', category: 'World', keywords: ['china', 'xi jinping', 'taiwan', 'beijing', 'pla', 'hong kong', 'ccp', 'strait'] },
  { id: 'uk-europe',      label: 'UK & Europe',          emoji: '🇬🇧', category: 'World', keywords: ['uk', 'britain', 'eu', 'europe', 'sunak', 'macron', 'germany', 'france', 'london', 'brussels'] },
  { id: 'climate',        label: 'Climate & Environment',emoji: '🌱', category: 'World', keywords: ['climate', 'carbon', 'emission', 'global warming', 'cop', 'green energy', 'renewable', 'solar', 'forest'] },
  { id: 'trade',          label: 'International Trade',  emoji: '🤝', category: 'World', keywords: ['tariff', 'trade war', 'import', 'export', 'wto', 'sanctions', 'trade deal', 'customs'] },
  { id: 'africa',         label: 'Africa',               emoji: '🌍', category: 'World', keywords: ['africa', 'nigeria', 'kenya', 'ethiopia', 'south africa', 'ghana', 'egypt', 'sudan'] },
  { id: 'southeast-asia', label: 'Southeast Asia',       emoji: '🌏', category: 'World', keywords: ['myanmar', 'bangladesh', 'sri lanka', 'pakistan', 'nepal', 'thailand', 'vietnam', 'indonesia', 'philippines'] },
  { id: 'diplomacy',      label: 'Diplomacy & UN',       emoji: '🕊️', category: 'World', keywords: ['united nations', 'g7', 'g20', 'imf summit', 'diplomacy', 'treaty', 'summit', 'bilateral'] },

  // Markets
  { id: 'stock-markets',  label: 'Stock Markets',        emoji: '📈', category: 'Markets', keywords: ['sensex', 'nifty', 'bse', 'nse', 'stock', 'shares', 'rally', 'market crash', 'bulls', 'bears', 'trading'] },
  { id: 'crypto-markets', label: 'Crypto Markets',       emoji: '🪙', category: 'Markets', keywords: ['bitcoin price', 'btc', 'eth', 'altcoin', 'crypto market', 'coinbase', 'binance', 'crypto rally'] },
  { id: 'real-estate',    label: 'Real Estate',          emoji: '🏠', category: 'Markets', keywords: ['real estate', 'property', 'housing', 'realty', 'dlf', 'godrej property', 'rent', 'home prices'] },
  { id: 'commodities',    label: 'Gold & Commodities',   emoji: '🥇', category: 'Markets', keywords: ['gold', 'silver', 'crude oil', 'commodity', 'mcx', 'precious metals', 'copper', 'gold price'] },
  { id: 'banking',        label: 'Banking & Finance',    emoji: '🏦', category: 'Markets', keywords: ['hdfc', 'sbi', 'icici', 'axis bank', 'rbi policy', 'interest rate', 'loan', 'emi', 'banking'] },
  { id: 'mutual-funds',   label: 'Mutual Funds & SIP',  emoji: '💰', category: 'Markets', keywords: ['mutual fund', 'sip', 'nav', 'sebi', 'aum', 'equity fund', 'debt fund', 'elss'] },
  { id: 'ipo',            label: 'IPO & Listings',       emoji: '🔔', category: 'Markets', keywords: ['ipo', 'listing', 'grey market', 'allotment', 'gmp', 'mainboard', 'sme ipo', 'public issue'] },
  { id: 'oil-energy',     label: 'Oil & Energy',         emoji: '⛽', category: 'Markets', keywords: ['oil price', 'opec', 'brent crude', 'petrol price', 'natural gas', 'energy stocks', 'fuel'] },
  { id: 'personal-fin',   label: 'Personal Finance',     emoji: '💳', category: 'Markets', keywords: ['income tax', 'epf', 'ppf', 'fd', 'savings', 'tax planning', 'gst', 'itr filing'] },
  { id: 'global-economy', label: 'Global Economy',       emoji: '🌐', category: 'Markets', keywords: ['fed', 'interest rates', 'global inflation', 'recession', 'gdp growth', 'imf forecast', 'world economy'] },

  // Business
  { id: 'big-tech',     label: 'Big Tech Companies',     emoji: '💻', category: 'Business', keywords: ['apple', 'google', 'microsoft', 'amazon', 'meta', 'nvidia', 'alphabet', 'openai valuation'] },
  { id: 'india-corps',  label: 'Indian Conglomerates',   emoji: '🏭', category: 'Business', keywords: ['tata', 'reliance', 'adani', 'ambani', 'infosys', 'wipro', 'mahindra', 'bajaj', 'godrej'] },
  { id: 'ma',           label: 'M&A & Deals',            emoji: '🤝', category: 'Business', keywords: ['acquisition', 'merger', 'takeover', 'buyout', 'deal signed', 'stake acquisition', 'investment round'] },
  { id: 'ecommerce',    label: 'E-commerce & Retail',    emoji: '🛒', category: 'Business', keywords: ['amazon india', 'flipkart', 'meesho', 'retail', 'ecommerce', 'quick commerce', 'blinkit', 'zepto', 'swiggy instamart'] },
  { id: 'pharma-biz',   label: 'Pharma & Healthcare',    emoji: '🧬', category: 'Business', keywords: ['sun pharma', 'cipla', 'dr reddy', 'biocon', 'pharma earnings', 'apollo hospitals', 'fortis'] },
  { id: 'auto',         label: 'Auto Industry',          emoji: '🚗', category: 'Business', keywords: ['maruti', 'hyundai', 'tata motors', 'mahindra auto', 'hero', 'bajaj auto', 'auto sales', 'car launch'] },
  { id: 'aviation',     label: 'Aviation',               emoji: '✈️', category: 'Business', keywords: ['air india', 'indigo', 'spicejet', 'airlines', 'aviation', 'airport expansion', 'flight cancellation'] },
  { id: 'telecom',      label: 'Telecom',                emoji: '📡', category: 'Business', keywords: ['jio', 'airtel', 'vi', 'bsnl', '5g rollout', 'telecom', 'spectrum auction', 'broadband'] },
  { id: 'media-ott',    label: 'Media & OTT',            emoji: '🎬', category: 'Business', keywords: ['netflix', 'hotstar', 'jiocinema', 'sony', 'zee', 'media', 'streaming', 'ott platform'] },
  { id: 'manufacturing',label: 'Manufacturing & PLI',    emoji: '🏗️', category: 'Business', keywords: ['manufacturing', 'pli scheme', 'make in india', 'semiconductor', 'factory', 'plant expansion'] },
];

export const INTEREST_CATEGORIES = ['Technology', 'India', 'World', 'Markets', 'Business'] as const;

export function scoreClusterInterest(headline: string, summary: string, interests: Record<string, number>): number {
  const text = (headline + ' ' + summary).toLowerCase();
  let bonus = 0;
  for (const topic of INTEREST_TOPICS) {
    const stars = interests[topic.id] ?? 0;
    if (stars === 0) continue;
    const matched = topic.keywords.some(kw => text.includes(kw.toLowerCase()));
    if (matched) bonus += stars * 3;
  }
  return bonus;
}
