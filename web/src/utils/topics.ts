import type { TopicKey } from '../types';

export const TOPIC_SUBTOPICS: Record<TopicKey, string[]> = {
  'myspace': [],
  'breaking': ['India','World','Politics','Economy','Conflict','Tech','Environment','Health','Crime','Disaster','Sports','Entertainment'],
  'technology': ['AI & ML','Mobile','Cybersecurity','Space','Tech Startups','Science','Social Media','Crypto & Web3','EVs','Gaming','Cloud & SaaS','Semiconductors','Robotics'],
  'india-politics': ['BJP','Congress','AAP','Elections','Courts & Law','Defence','India Economy','Agriculture','Education','Society','State Politics','Foreign Policy','Sports','Entertainment'],
  'geopolitics': ['Iran','Trump & USA','Ukraine','Russia','China','Middle East','Israel & Gaza','Pakistan','NATO','EU & Europe','Africa','Climate Diplomacy','Oil & Energy'],
  'markets': ['Stocks','Crypto','Gold','Oil','Forex','Fed','RBI','IPO','Bonds','Commodities','Sensex & Nifty','Global Markets'],
  'business': ['Startups','M&A','Earnings','Energy','Banking & Fintech','Retail & E-commerce','Real Estate','Aviation','Manufacturing','Pharma','Telecom','Auto'],
};

const SUBTOPIC_KEYWORDS: Record<string, string[]> = {
  'India':['india','indian','new delhi','mumbai','delhi','bangalore','chennai'],
  'World':['world','global','international','foreign','overseas'],
  'Politics':['politics','political','government','parliament','senate','election','vote'],
  'Economy':['economy','economic','gdp','inflation','recession','growth','fiscal'],
  'Conflict':['war','conflict','attack','strike','military','troops','bomb','killed','missile','airstrike','ceasefire'],
  'Tech':['tech','technology','ai ','artificial intelligence','digital','cyber','software'],
  'Environment':['climate','environment','carbon','emissions','pollution','wildfire','flood','earthquake','cyclone'],
  'Health':['health','hospital','disease','virus','vaccine','covid','cancer','who ','pandemic','outbreak'],
  'Crime':['crime','murder','arrest','police','convicted','fraud','corruption','scam'],
  'Disaster':['earthquake','flood','cyclone','tsunami','disaster','landslide','explosion','fire broke'],
  'AI & ML':['artificial intelligence',' ai ','machine learning','gpt','llm','chatgpt','openai','gemini','claude','deepmind','neural network','generative'],
  'Mobile':['iphone','android','smartphone','apple ','samsung','pixel ','oneplus','mobile phone','ios ','vivo','oppo','xiaomi'],
  'Cybersecurity':['cybersecurity','hack','breach','malware','ransomware','vulnerability','phishing','data leak','zero-day'],
  'Space':['space','nasa','spacex','rocket','satellite','mars','moon','launch','isro','orbit','astronomy','telescope'],
  'Tech Startups':['startup funding','venture capital','seed round','series a','series b','unicorn','valuation'],
  'Science':['research','study finds','discovery','scientists','biology','physics','quantum','experiment','gene'],
  'Social Media':['twitter','x.com','facebook','instagram','tiktok','meta ','youtube','social media','threads','linkedin','snapchat'],
  'Crypto & Web3':['crypto','bitcoin','ethereum','blockchain','nft','defi','web3','binance','coinbase','solana','token'],
  'EVs':['electric vehicle','ev ','tesla','rivian','lucid','charging station','battery range','tata ev'],
  'Gaming':['gaming','playstation','xbox','nintendo','game release','esports','video game','steam '],
  'Cloud & SaaS':['cloud','aws','azure','google cloud','saas','software-as-a-service','kubernetes','data center'],
  'Semiconductors':['semiconductor','chip','nvidia','amd','intel ','tsmc','microchip','wafer','fab'],
  'Robotics':['robot','robotics','automation','autonomous','drone','humanoid','boston dynamics'],
  'BJP':['bjp','bharatiya janata','narendra modi','amit shah','yogi adityanath','nda '],
  'Congress':['congress','rahul gandhi','sonia gandhi','mallikarjun kharge','india alliance','inc '],
  'AAP':['aap ','aam aadmi','arvind kejriwal','manish sisodia','delhi government'],
  'Elections':['election','bypoll','voter','constituency','ballot','exit poll','election commission'],
  'Courts & Law':['supreme court','high court','judiciary','verdict','cbi ','ed ','fir ','bail'],
  'Defence':['indian army','air force','navy','drdo','pakistan','lac ','border','surgical strike'],
  'India Economy':['rbi','budget india','gst','tax india','rupee falls','fiscal deficit','sebi','inflation india'],
  'Agriculture':['farmer','agriculture','crop','msp','kisan','rainfall','harvest','irrigation'],
  'Education':['iit','neet','jee ','university','school','ugc','education policy'],
  'Society':['women','caste','religion','protest','reservation','mob','communal','minority'],
  'State Politics':['uttar pradesh','maharashtra','rajasthan','tamil nadu','bengal','kerala','gujarat','bihar','punjab','haryana','cm '],
  'Foreign Policy':['india-us','india-china','india-russia','india-pak','quad','g20','pm modi visit','external affairs'],
  'Iran':['iran','tehran','iranian','khamenei','nuclear deal','irgc','sanctions iran'],
  'Trump & USA':['trump','donald trump','maga','tariff','white house','biden','harris','congress us','us president'],
  'Ukraine':['ukraine','zelensky','kyiv','kharkiv','odessa','kherson','zaporizhzhia'],
  'Russia':['russia','putin','moscow','kremlin','russian forces','wagner'],
  'China':['china','beijing','chinese','xi jinping','taiwan','pla ','south china sea','hong kong'],
  'Middle East':['middle east','saudi arabia','qatar','dubai','uae','bahrain','oman','yemen'],
  'Israel & Gaza':['israel','israeli','netanyahu','idf','tel aviv','west bank','gaza','hamas','hezbollah'],
  'Pakistan':['pakistan','islamabad','imran khan','nawaz sharif','isi ','karachi','lahore'],
  'NATO':['nato','north atlantic','alliance defence','article 5'],
  'EU & Europe':['european union','eu ','brussels','macron','scholz','ursula','germany','france','uk government'],
  'Africa':['africa','nigeria','kenya','ethiopia','south africa','coup africa','sahel'],
  'Climate Diplomacy':['cop ','climate summit','paris agreement','unfccc','net zero','carbon neutral'],
  'Oil & Energy':['oil price','opec','crude oil','petroleum','barrel','lng','natural gas price'],
  'Stocks':['stocks','shares','equity','dow jones','nasdaq','s&p 500','wall street','stock market'],
  'Crypto':['bitcoin','ethereum','crypto market','altcoin','binance','coinbase','btc ','eth '],
  'Gold':['gold price','silver','precious metal','bullion','mcx gold'],
  'Oil':['crude oil','brent','wti','oil futures','opec cut'],
  'Forex':['forex','rupee vs','dollar index','currency exchange','exchange rate','usd/inr'],
  'Fed':['federal reserve','fed rate','jerome powell','fomc','rate cut','rate hike'],
  'RBI':['rbi','reserve bank of india','monetary policy','repo rate','shaktikanta das'],
  'IPO':['ipo','initial public offering','listing','grey market premium','gmp'],
  'Bonds':['bond yield','treasury','g-sec','debt market','10-year yield'],
  'Commodities':['commodity','copper','zinc','aluminium','wheat price','cotton'],
  'Sensex & Nifty':['sensex','nifty','bse','nse ','nifty50','indian stock','dalal street'],
  'Global Markets':['global market','asian market','european market','ftse','nikkei','hang seng','dax'],
  'Startups':['startup','funded','series a','series b','seed funding','unicorn','inc42','venture'],
  'M&A':['merger','acquisition','takeover','buyout','acquires','deal signed','strategic buy'],
  'Earnings':['earnings','revenue','quarterly result','profit','loss reported','q1 ','q2 ','q3 ','q4 '],
  'Energy':['solar','renewable energy','wind power','electricity','adani green','ntpc','power plant'],
  'Banking & Fintech':['bank','npa','bad loan','credit card','fintech','nbfc','upi ','paytm','razorpay'],
  'Retail & E-commerce':['retail','e-commerce','amazon','flipkart','consumer demand','meesho','zomato','swiggy'],
  'Real Estate':['real estate','property market','housing','realty','builder','dlf','godrej property'],
  'Aviation':['airline','indigo','air india','flight','aviation','airport','spicejet'],
  'Manufacturing':['manufacturing','production','factory','pmi ','make in india','export order','plant'],
  'Pharma':['pharma','drug','fda ','clinical trial','medicine','sun pharma','cipla','biocon'],
  'Telecom':['telecom','jio','airtel','vi ','vodafone','5g','spectrum','tariff hike'],
  'Auto':['automobile','car sales','maruti','tata motors','hyundai','ev sales','two-wheeler'],
};

export function storyMatchesSubTopic(headline: string, summary: string, subTopic: string): boolean {
  const text = (headline + ' ' + (summary ?? '')).toLowerCase();
  const keywords = SUBTOPIC_KEYWORDS[subTopic];
  if (!keywords) return false;
  return keywords.some(kw => text.includes(kw));
}

const CATEGORY_DETECT: Array<{ key: TopicKey; keywords: string[] }> = [
  { key: 'technology', keywords: ['nvidia','apple','google','microsoft','openai','ai model','chatgpt','iphone','android','startup','cyber','software','tech company','5g','chip','gpu','amazon','spacex','tesla'] },
  { key: 'markets', keywords: ['sensex','nifty','stock market','shares','rupee','ipo','equity','bitcoin','gold price','crude oil','fed rate','repo rate','sebi','dow jones','nasdaq'] },
  { key: 'india-politics', keywords: ['modi','bjp','congress','parliament','lok sabha','rajya sabha','kejriwal','rahul gandhi','amit shah','delhi cm','election commission','supreme court india','rbi','sebi india'] },
  { key: 'geopolitics', keywords: ['ukraine','russia','putin','nato','iran','israel','gaza','trump','white house','ceasefire','sanctions','china military','taiwan','un security','war in','airstrike','pentagon','kremlin'] },
  { key: 'business', keywords: ['revenue','profit','acquisition','merger','ceo','quarterly results','earnings','funding round','valuation','unicorn','venture capital','layoffs','q1','q2','q3','q4'] },
];

export function detectStoryCategory(headline: string, summary: string): TopicKey | null {
  const text = (headline + ' ' + (summary ?? '')).toLowerCase();
  let bestKey: TopicKey | null = null;
  let bestScore = 0;
  for (const { key, keywords } of CATEGORY_DETECT) {
    const score = keywords.filter(kw => text.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestKey = key; }
  }
  return bestScore > 0 ? bestKey : null;
}
