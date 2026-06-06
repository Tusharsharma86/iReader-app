// Web port of Android utils/breakingThemes.ts. UI parity — mutes stored in
// localStorage. Web doesn't fire local notifs, so the mute set is purely
// informational here (kept in sync with Android via the same family/theme
// labels). Sync of actual mute state across devices is out of scope.

export interface ThemeRule { name: string; pattern: RegExp; }
export interface ThemeFamily { family: string; icon: string; themes: ThemeRule[]; }

export const WORLD_THEMES: ThemeRule[] = [
  { name: 'Trump & US Politics', pattern: /\b(trump|white house|\bgop\b|republican|democrat|\bcongress\b|\bsenate\b|capitol|\bmaga\b)\b/i },
  { name: 'India Politics', pattern: /\b(\bmodi\b|\bbjp\b|congress party|parliament|lok sabha|rajya sabha|rahul gandhi|kejriwal|mamata|amit shah)\b/i },
  { name: 'Israel & Gaza', pattern: /\b(israel|\bgaza\b|hamas|netanyahu|\bidf\b|palestinian|west bank|hezbollah)\b/i },
  { name: 'Iran', pattern: /\b(\biran\b|tehran|\birgc\b|ayatollah)\b/i },
  { name: 'Russia–Ukraine', pattern: /\b(russia|ukraine|\bputin\b|zelensky|\bkyiv\b|moscow|kremlin)\b/i },
  { name: 'China', pattern: /\b(\bchina\b|beijing|xi jinping|\bccp\b|taiwan)\b/i },
  { name: 'Elections', pattern: /\b(election|\bballot\b|polling booth|campaign trail|by-election|exit poll)\b/i },
  { name: 'Courts & Law', pattern: /\b(supreme court|high court|\bverdict\b|\bruling\b|sentenced|indicted|\bplea\b)\b/i },
  { name: 'Immigration', pattern: /\b(immigration|deportation|migrants?|asylum)\b/i },
  { name: 'Protests & Unrest', pattern: /\b(protests?|\briot|clashes?|\bunrest\b|demonstration)\b/i },
  { name: 'Defence & Military', pattern: /\b(\bmilitary\b|defence ministry|airstrike|\btroops?\b|warship|drone strike)\b/i },
  { name: 'Disasters & Weather', pattern: /\b(earthquake|\bflood|wildfire|hurricane|cyclone|monsoon|landslide)\b/i },
  { name: 'Crime & Police', pattern: /\b(\bmurder\b|shooting|\barrested\b|\bkidnap|\bassault\b)\b/i },
];

export const TECH_THEMES: ThemeRule[] = [
  { name: 'AI Agents', pattern: /\b(ai agents?|agentic|autonomous agents?)\b/i },
  { name: 'New AI Models', pattern: /\b(gpt-?\d|large language model|\bllm\b|foundation model|open-?weight|new ai model|model release|llama \d|claude \d|mistral|deepseek|\bqwen\b|reasoning model)\b/i },
  { name: 'Chips & Semiconductors', pattern: /\b(semiconductor|chipmaker|\bchips?\b|wafer|foundry|\beuv\b|nanometer|\bfabs?\b)\b/i },
  { name: 'Quantum Computing', pattern: /\b(quantum comput|\bqubits?\b|quantum processor|quantum supremacy)\b/i },
  { name: 'Robotics', pattern: /\b(\brobots?\b|robotics|humanoid|boston dynamics)\b/i },
  { name: 'AR / VR', pattern: /\b(augmented reality|virtual reality|mixed reality|vr headset|ar glasses|metaverse|quest \d|smart glasses)\b/i },
  { name: 'Cybersecurity', pattern: /\b(ransomware|data breach|malware|zero-day|vulnerabilit|hacked|cyberattack|phishing|spyware)\b/i },
  { name: 'Crypto & Web3', pattern: /\b(crypto|bitcoin|ethereum|blockchain|stablecoin|web3|\bnft\b)\b/i },
  { name: 'EVs & Autonomy', pattern: /\b(electric vehicle|\bevs?\b|self-driving|robotaxi|autonomous vehicle|ev charging)\b/i },
  { name: 'Space', pattern: /\b(spacex|\bnasa\b|rocket launch|satellite|starship|blue origin)\b/i },
  { name: 'Layoffs & Hiring', pattern: /\b(layoffs?|job cuts?|\bfired\b|hiring freeze|restructuring|workforce reduction)\b/i },
  { name: 'Antitrust & Regulation', pattern: /\b(antitrust|monopoly|\bftc\b|\bdoj\b|regulat|\beu fine|lawsuit|\bsued\b|probe)\b/i },
  { name: 'Privacy & Data', pattern: /\b(privacy|data protection|surveillance|tracking|\bgdpr\b|age verification)\b/i },
  { name: 'Social Media', pattern: /\b(social media|content moderation|misinformation|deepfakes?|going viral)\b/i },
  { name: 'Gaming', pattern: /\b(video game|game pass|\bconsole\b|esports)\b/i },
  { name: 'Streaming & Media', pattern: /\b(streaming|subscribers?|box office|original series)\b/i },
  { name: 'Fintech & Payments', pattern: /\b(fintech|\bpayments?\b|digital wallet|\bupi\b|neobank)\b/i },
  { name: 'Health & Biotech', pattern: /\b(biotech|health tech|\bdrug\b|\bfda\b|clinical trial|genom)\b/i },
  { name: 'Climate & Energy', pattern: /\b(climate tech|renewable|solar power|\bbattery\b|nuclear|carbon)\b/i },
];

export const BIZ_THEMES: ThemeRule[] = [
  { name: 'Earnings', pattern: /\b(earnings|quarterly results|q[1-4] (results|profit)|net profit|profit (jump|rise|fall|down|up)|guidance)\b/i },
  { name: 'IPOs & Listings', pattern: /\b(\bipo\b|listing|market debut|goes public|drhp|grey market premium|\bgmp\b)\b/i },
  { name: 'Banking & Rates', pattern: /\b(\bbank\b|\brbi\b|\bfed\b|interest rate|\bloans?\b|deposit|\bnpa\b|repo rate)\b/i },
  { name: 'Mergers & Deals', pattern: /\b(acquir|acquisition|merger|takeover|buyout|\bstake\b|block deal)\b/i },
  { name: 'Startups & Funding', pattern: /\b(startup|\bfunding\b|raises? \$|series [a-e]\b|valuation|venture capital|\bvc\b)\b/i },
  { name: 'Oil & Energy', pattern: /\b(crude|oil price|\bopec\b|natural gas|\bpetrol\b|diesel)\b/i },
  { name: 'Gold & Commodities', pattern: /\b(\bgold\b|\bsilver\b|commodit|bullion)\b/i },
  { name: 'Real Estate', pattern: /\b(real estate|\bproperty\b|housing|realty|homebuilder)\b/i },
  { name: 'Auto & EVs', pattern: /\b(auto sales|carmaker|vehicle sales|automaker)\b/i },
  { name: 'Pharma & Healthcare', pattern: /\b(pharma|drugmaker|\busfda\b|healthcare|\bvaccine\b)\b/i },
  { name: 'Aviation', pattern: /\b(airline|aviation|\bairport\b|aircraft|boeing|airbus|indigo)\b/i },
  { name: 'Inflation & Economy', pattern: /\b(inflation|\bgdp\b|recession|unemployment|jobs report)\b/i },
  { name: 'Tariffs & Trade', pattern: /\b(tariffs?|trade war|import duty|\bwto\b)\b/i },
  { name: 'Currency & Rupee', pattern: /\b(\brupee\b|dollar index|\bforex\b|exchange rate)\b/i },
  { name: 'Tax & Policy', pattern: /\b(\btax\b|\bgst\b|\bbudget\b|fiscal|\bsebi\b)\b/i },
  { name: 'Dividends & Buybacks', pattern: /\b(dividend|buyback|bonus (issue|share)|stock split)\b/i },
];

export const COMPANY_THEMES: ThemeRule[] = [
  { name: 'Apple', pattern: /\b(apple|iphone|ipad|macbook|macos|\bios\b|siri|app store|airpods|vision pro|tim cook|cupertino)\b/i },
  { name: 'Google', pattern: /\b(google|alphabet|android|pixel|chrome|deepmind|gemini|gemma|waymo|sundar pichai)\b/i },
  { name: 'Meta', pattern: /\b(\bmeta\b|facebook|instagram|whatsapp|zuckerberg|threads|reality labs|oculus)\b/i },
  { name: 'Microsoft', pattern: /\b(microsoft|windows \d|azure|copilot|\bxbox\b|satya nadella)\b/i },
  { name: 'Nvidia', pattern: /\b(nvidia|jensen huang|\bcuda\b|geforce|blackwell)\b/i },
  { name: 'OpenAI', pattern: /\b(openai|chatgpt|sam altman)\b/i },
  { name: 'Amazon', pattern: /\b(amazon|\baws\b|alexa|jeff bezos|prime video)\b/i },
  { name: 'Tesla', pattern: /\b(tesla|elon musk|cybertruck|full self-driving)\b/i },
  { name: 'Samsung', pattern: /\b(samsung|galaxy s\d|galaxy z|galaxy fold)\b/i },
  { name: 'Anthropic', pattern: /\b(anthropic|\bclaude\b)\b/i },
  { name: 'xAI', pattern: /\b(\bxai\b|\bgrok\b)\b/i },
  { name: 'Intel', pattern: /\b(\bintel\b|core ultra|\bxeon\b)\b/i },
  { name: 'AMD', pattern: /\b(\bamd\b|ryzen|radeon|lisa su)\b/i },
  { name: 'TSMC', pattern: /\b(\btsmc\b|taiwan semiconductor)\b/i },
  { name: 'Qualcomm', pattern: /\b(qualcomm|snapdragon)\b/i },
  { name: 'Netflix', pattern: /\b(netflix)\b/i },
  { name: 'Spotify', pattern: /\b(spotify)\b/i },
  { name: 'TikTok', pattern: /\b(tiktok|bytedance)\b/i },
  { name: 'Reddit', pattern: /\b(reddit)\b/i },
  { name: 'Oracle', pattern: /\b(\boracle\b)\b/i },
  { name: 'Salesforce', pattern: /\b(salesforce)\b/i },
  { name: 'Adobe', pattern: /\b(\badobe\b)\b/i },
  { name: 'IBM', pattern: /\b(\bibm\b)\b/i },
  { name: 'Sony', pattern: /\b(\bsony\b|playstation)\b/i },
  { name: 'Nintendo', pattern: /\b(nintendo|switch 2)\b/i },
];

export const THEME_FAMILIES: ThemeFamily[] = [
  { family: 'World & Politics', icon: '🌍', themes: WORLD_THEMES },
  { family: 'Tech',             icon: '💻', themes: TECH_THEMES },
  { family: 'Business',         icon: '💼', themes: BIZ_THEMES },
  { family: 'Companies',        icon: '🏢', themes: COMPANY_THEMES },
];

export const ALL_BREAKING_THEMES: ThemeRule[] = THEME_FAMILIES.flatMap(f => f.themes);

const STORAGE_KEY = 'ireader_breaking_theme_mutes_v1';

export function loadBreakingThemeMutes(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

export function saveBreakingThemeMutes(muted: Set<string>): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(muted))); } catch { /* ignore */ }
}

export function setBreakingThemeMuted(name: string, muted: boolean): Set<string> {
  const next = loadBreakingThemeMutes();
  if (muted) next.add(name); else next.delete(name);
  saveBreakingThemeMutes(next);
  return next;
}
