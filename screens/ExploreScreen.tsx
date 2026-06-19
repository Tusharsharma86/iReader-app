import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, Image, Pressable, TextInput,
  StyleSheet, Dimensions, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { getArticleColor } from '../utils/colors';
import { trackArticleOpen } from '../utils/personalization';
import { ExploreStackParamList } from '../types/navigation';

const API_BASE = 'https://ireader.onrender.com/api/news';
const { width: SCREEN_W } = Dimensions.get('window');
const CONTENT_W = Math.min(SCREEN_W - 32, 448);
const TILE_W = (CONTENT_W - 10) / 2;
const CHIP_W = (CONTENT_W - 20) / 3;

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeedItem {
  type?: string;
  headline?: string;
  clusterLabel?: string;
  summary?: string;
  imageUrl?: string;
  publishedAt?: string;
  articles?: { headline: string; imageUrl?: string; summary?: string; publishedAt?: string; id?: string; sources?: { name: string; url: string }[] }[];
  sources?: { name: string; url: string; imageUrl?: string; publishedAt?: string }[];
  sourceCount?: number;
}

interface EntityCard {
  name: string;
  count: number;
  imageUrl?: string;
}

interface SourceCard {
  name: string;
  domain: string;
  count: number;
}

interface GroupedSearch {
  stories: FeedItem[];
  companies: EntityCard[];
  people: EntityCard[];
  places: EntityCard[];
}

// ── Entity classification ─────────────────────────────────────────────────────

const ENTITY_SKIP = new Set([
  'The','This','That','In','On','At','To','For','Of','And','Or','But','As','Is','Are',
  'Was','Were','Be','Been','By','From','With','It','Its','A','An','He','She','We',
  'They','You','I','My','His','Her','Their','Our','Your','New','Now','No','Not',
  'All','Some','Just','More','Most','After','Before','Over','Under','Since','When',
  'Where','How','Why','What','Who','Which','Here','There','Then','Than','If','So',
  'Explained','Analysis','Opinion','Watch','Read','Know','Top','Must','Also',
  'See','Get','Full','List','Check','View','Meet','Live','Update','Updates',
  'Key','Big','Major','High','Low','Look','Back','Find','Breaking',
  'Says','Said','Gets','Joins','Makes','Takes','Gives','Shows','Comes','Goes',
  'Warns','Claims','Asks','Calls','Wants','Plans','Moves','Rises','Falls',
  'Report','Reports','Sources','Source','Latest','Will','May','Can','Has','Had',
  'Set','Hits','Wins','Loses','Leads','Signs','Holds','Faces','Sees','Puts',
  'Govt','Gov','Bank','Law','Act','Deal','Talk','Plan','Move','Rise','Fall',
  'Drop','Aid','War','Tax','Fund','Bill','Vote','Poll','Case','Rule','Court',
  'Party','State','Centre','Center','Union','Group','Team','Board','Council',
  'January','February','March','April','May','June','July','August','September',
  'October','November','December','Jan','Feb','Mar','Apr','Jun','Jul','Aug','Sep',
  'Oct','Nov','Dec',
  'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday',
  'India','Indian','Pakistan','Pakistani','China','Chinese','Russia','Russian',
  'American','British','European','Asian','Global','International','National',
]);

const COMPANY_NAMES = new Set([
  'Apple','Google','Alphabet','Microsoft','Amazon','Meta','Netflix','Tesla','Nvidia',
  'AMD','Intel','Qualcomm','Broadcom','TSMC','Samsung','Huawei','Xiaomi',
  'OpenAI','Anthropic','DeepSeek','Mistral','Gemini',
  'TikTok','ByteDance','Snapchat','Twitter','Reddit','Pinterest','LinkedIn',
  'Uber','Lyft','Airbnb','DoorDash','Stripe','Coinbase','Binance','PayPal','Visa','Mastercard',
  'Spotify','Disney','Warner','Paramount',
  'Oracle','Salesforce','Adobe','SAP','IBM','Cisco','Dell','HP','Zoom','Slack','Dropbox',
  'JPMorgan','Goldman','BlackRock','Berkshire',
  'Reliance','Tata','Infosys','Wipro','TCS','HCL','Flipkart','Paytm','Zomato','Swiggy','Ola',
  'Adani','Bajaj','Mahindra','Maruti','HDFC','ICICI','Axis','Kotak','SBI',
  'Toyota','BMW','Mercedes','Volkswagen','Ford','GM','Hyundai','Rivian','Lucid',
  'SpaceX','Boeing','Airbus','Lockheed','Raytheon',
  'Alibaba','Baidu','Tencent',
  'Pfizer','Moderna','AstraZeneca','Novartis',
  'ExxonMobil','Shell','Chevron','BP','Aramco','ONGC',
  'Block','Robinhood','Plaid','Klarna',
]);

const KNOWN_PEOPLE = new Set([
  'Musk','Altman','Zuckerberg','Bezos','Cook','Pichai','Nadella','Huang','Gates','Buffett',
  'Page','Brin','Dorsey','Amodei','Hassabis','Karpathy','Sutskever',
  'Modi','Gandhi','Shah','Kejriwal','Fadnavis','Shinde','Yogi',
  'Ambani','Adani','Sitharaman',
  'Trump','Biden','Harris','Obama','Clinton','Zelensky','Putin','Xi','Macron','Sunak','Starmer',
  'Netanyahu','Khamenei','Erdogan','Scholz','Meloni',
  'Elon Musk','Sam Altman','Tim Cook','Sundar Pichai','Satya Nadella','Jensen Huang',
  'Mark Zuckerberg','Jeff Bezos','Bill Gates','Warren Buffett',
  'Narendra Modi','Rahul Gandhi','Amit Shah','Arvind Kejriwal',
  'Mukesh Ambani','Gautam Adani','Nirmala Sitharaman',
  'Donald Trump','Joe Biden','Kamala Harris','Vladimir Putin','Xi Jinping',
  'Emmanuel Macron','Rishi Sunak','Keir Starmer','Volodymyr Zelensky','Benjamin Netanyahu',
]);

const KNOWN_PLACES = new Set([
  'China','Russia','Ukraine','Pakistan','Israel','Gaza','Iran','Iraq','Turkey','Syria',
  'France','Germany','Britain','Italy','Japan','Korea','Taiwan','Singapore',
  'Australia','Canada','Brazil','Mexico','Argentina',
  'Saudi','UAE','Qatar','Egypt','Nigeria','Ethiopia','Libya','Sudan',
  'Delhi','Mumbai','Pune','Bangalore','Chennai','Hyderabad','Kolkata','Ahmedabad',
  'Kashmir','Punjab','Gujarat','Maharashtra','Kerala','Assam','Bengal',
  'Washington','London','Beijing','Moscow','Tokyo','Berlin','Paris',
  'Dubai','Seoul','Tehran','Riyadh','Kyiv','Ankara','Islamabad',
  'Europe','Asia','Africa','Middle East','South Asia','Southeast Asia',
]);

function classifyEntity(entity: string): 'company' | 'person' | 'place' | 'topic' {
  if (COMPANY_NAMES.has(entity)) return 'company';
  if (KNOWN_PLACES.has(entity)) return 'place';
  if (KNOWN_PEOPLE.has(entity)) return 'person';
  const words = entity.split(' ');
  if (
    words.length === 2 &&
    words.every(w => /^[A-Z][a-z]{2,}$/.test(w)) &&
    !ENTITY_SKIP.has(words[0]) && !ENTITY_SKIP.has(words[1])
  ) return 'person';
  return 'topic';
}

function extractEntityCounts(headlines: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  const re = /\b([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,})*)\b/g;
  for (const h of headlines) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(h)) !== null) {
      const e = m[1].trim();
      if (e.split(' ').length > 3 || ENTITY_SKIP.has(e) || e.length < 3) continue;
      counts.set(e, (counts.get(e) ?? 0) + 1);
    }
  }
  return counts;
}

function scoreItem(it: FeedItem): number {
  const src = it.sourceCount ?? it.articles?.length ?? 1;
  const hrs = it.publishedAt ? (Date.now() - new Date(it.publishedAt).getTime()) / 3_600_000 : 24;
  const fresh = hrs < 1 ? 2.0 : hrs < 3 ? 1.5 : hrs < 6 ? 1.2 : hrs < 12 ? 1.0 : 0.7;
  return src * fresh;
}

function relTime(ts?: string): string {
  if (!ts) return '';
  const h = (Date.now() - new Date(ts).getTime()) / 3_600_000;
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function isHindi(text: string): boolean {
  return /[ऀ-ॿ]/.test(text);
}

function dedup(items: FeedItem[], limit: number): FeedItem[] {
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  for (const it of items) {
    const k = (it.clusterLabel || it.headline || '').slice(0, 40);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

// ── Topic config ──────────────────────────────────────────────────────────────

const TOPICS = [
  { label: 'Breaking',  color: '#FF453A', bg: 'rgba(255,69,58,0.15)',   tag: 'breaking'       },
  { label: 'Tech',      color: '#0A84FF', bg: 'rgba(10,132,255,0.15)',  tag: 'technology'     },
  { label: 'India',     color: '#FF9F0A', bg: 'rgba(255,159,10,0.15)',  tag: 'india-politics' },
  { label: 'World',     color: '#30D158', bg: 'rgba(48,209,88,0.15)',   tag: 'geopolitics'    },
  { label: 'Markets',   color: '#64D2FF', bg: 'rgba(100,210,255,0.15)', tag: 'markets'        },
  { label: 'Business',  color: '#BF5AF2', bg: 'rgba(191,90,242,0.15)', tag: 'business'       },
];

const TOPIC_ICONS: Record<string, keyof typeof Ionicons['glyphMap']> = {
  'breaking':       'flash',
  'technology':     'laptop-outline',
  'india-politics': 'flag-outline',
  'geopolitics':    'globe-outline',
  'markets':        'trending-up-outline',
  'business':       'briefcase-outline',
};

const COMPANY_BGS = ['#0F2D52','#1A1052','#0F3860','#1A1548'];
const PEOPLE_BGS  = ['#4A2000','#5A1500','#3A2800','#4A1A10'];
const PLACE_BGS   = ['#004A20','#003A30','#0A3A10','#004030'];
const EMERGE_BGS  = ['#003A50','#004060','#002A50','#003848'];

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <View style={s.sectionLabel}>
      <Text style={s.sectionDot}>●</Text>
      <Text style={s.sectionText}>{text}</Text>
    </View>
  );
}

// ── Vertical story card ───────────────────────────────────────────────────────

function VerticalStoryCard({ item, onPress, badge }: {
  item: FeedItem;
  onPress: () => void;
  badge?: { text: string; color: string };
}) {
  const label = item.clusterLabel || item.headline || item.articles?.[0]?.headline || '';
  const imgUrl = item.imageUrl || item.articles?.[0]?.imageUrl;
  const srcName = item.sources?.[0]?.name || item.articles?.[0]?.sources?.[0]?.name || '';
  const srcCount = item.sourceCount ?? item.articles?.length ?? 1;
  const accent = getArticleColor(label);
  const ts = relTime(item.publishedAt || item.articles?.[0]?.publishedAt);

  return (
    <Pressable onPress={onPress} style={[s.vCard, { backgroundColor: accent }]}>
      {imgUrl ? (
        <Image source={{ uri: imgUrl }} style={s.vCardImg} resizeMode="cover" />
      ) : null}
      <View style={s.vCardGradient} />

      {badge && (
        <View style={[s.vCardBadge, { backgroundColor: badge.color }]}>
          <Text style={s.vCardBadgeText}>{badge.text}</Text>
        </View>
      )}

      {srcCount > 1 && (
        <View style={s.vCardSrcBadge}>
          <Text style={s.vCardSrcBadgeText}>{srcCount} sources</Text>
        </View>
      )}

      <View style={s.vCardBottom}>
        {(srcName || ts) ? (
          <View style={s.vCardMeta}>
            {srcName ? <Text style={s.vCardSrcName}>{srcName}</Text> : null}
            {ts ? <Text style={s.vCardTs}>· {ts}</Text> : null}
          </View>
        ) : null}
        <Text style={s.vCardHeadline} numberOfLines={3}>{label}</Text>
      </View>
    </Pressable>
  );
}

// ── Entity tile ───────────────────────────────────────────────────────────────

function EntityTile({ entity, accent, bgColor, onTap }: {
  entity: EntityCard;
  accent: string;
  bgColor: string;
  onTap: (name: string) => void;
}) {
  return (
    <Pressable onPress={() => onTap(entity.name)} style={[s.entityTile, { backgroundColor: bgColor, width: TILE_W }]}>
      {entity.imageUrl ? (
        <Image source={{ uri: entity.imageUrl }} style={s.entityTileImg} resizeMode="cover" />
      ) : null}
      <View style={s.entityTileOverlay} />
      <View style={s.entityTileBody}>
        <Text style={[s.entityTileCount, { color: accent }]}>{entity.count} {entity.count === 1 ? 'story' : 'stories'}</Text>
        <Text style={s.entityTileName} numberOfLines={2}>{entity.name}</Text>
      </View>
    </Pressable>
  );
}

// ── Source chip ───────────────────────────────────────────────────────────────

function SourceChip({ src, onTap }: { src: SourceCard; onTap: (name: string) => void }) {
  const faviconUri = src.domain ? `https://www.google.com/s2/favicons?domain=${src.domain}&sz=32` : null;
  return (
    <Pressable onPress={() => onTap(src.name)} style={[s.sourceChip, { width: CHIP_W }]}>
      {faviconUri ? (
        <Image source={{ uri: faviconUri }} style={s.sourceFavicon} />
      ) : (
        <View style={s.sourceFaviconPlaceholder} />
      )}
      <Text style={s.sourceName} numberOfLines={2}>{src.name}</Text>
      <Text style={s.sourceCount}>{src.count}</Text>
    </Pressable>
  );
}

// ── Search story card ─────────────────────────────────────────────────────────

function SearchStoryCard({ item, onPress }: { item: FeedItem; onPress: () => void }) {
  const label = item.clusterLabel || item.headline || item.articles?.[0]?.headline || '';
  const imgUrl = item.imageUrl || item.articles?.[0]?.imageUrl;
  const srcName = item.sources?.[0]?.name || item.articles?.[0]?.sources?.[0]?.name || '';
  const srcCount = item.sourceCount ?? item.articles?.length ?? 1;
  const accent = getArticleColor(label);

  return (
    <Pressable onPress={onPress} style={s.searchCard}>
      <View style={[s.searchCardThumb, { backgroundColor: accent }]}>
        {imgUrl ? <Image source={{ uri: imgUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" /> : null}
      </View>
      <View style={s.searchCardBody}>
        <Text style={s.searchCardMeta}>{srcName}{srcCount > 1 ? ` · ${srcCount} sources` : ''}</Text>
        <Text style={s.searchCardHeadline} numberOfLines={2}>{label}</Text>
      </View>
    </Pressable>
  );
}

// ── Skeleton placeholders ─────────────────────────────────────────────────────

function SkeletonBox({ height, style }: { height: number; style?: object }) {
  return <View style={[{ height, borderRadius: 16, backgroundColor: '#141414' }, style]} />;
}

// ── Main Screen ───────────────────────────────────────────────────────────────

type Nav = NativeStackNavigationProp<ExploreStackParamList>;

export default function ExploreScreen() {
  const navigation = useNavigation<Nav>();

  const [trendingStories, setTrendingStories] = useState<FeedItem[]>([]);
  const [deepDives, setDeepDives] = useState<FeedItem[]>([]);
  const [companies, setCompanies] = useState<EntityCard[]>([]);
  const [people, setPeople] = useState<EntityCard[]>([]);
  const [places, setPlaces] = useState<EntityCard[]>([]);
  const [emergingTopics, setEmergingTopics] = useState<EntityCard[]>([]);
  const [sources, setSources] = useState<SourceCard[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GroupedSearch>({ stories: [], companies: [], people: [], places: [] });

  const allItemsRef = useRef<FeedItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const FEED_TOPICS = ['breaking', 'india-politics', 'technology', 'geopolitics', 'markets', 'business'];

    Promise.allSettled(
      FEED_TOPICS.map(t =>
        fetch(`${API_BASE}/feed?topic=${t}`).then(r => r.json())
          .then((d: { feed?: FeedItem[] }) => ({ topic: t, items: (d?.feed ?? []) as FeedItem[] }))
      )
    ).then(results => {
      if (cancelled) return;

      const allItems: FeedItem[] = results.flatMap(r => r.status === 'fulfilled' ? r.value.items : []);
      allItemsRef.current = allItems;

      const noHindi = (it: FeedItem) => {
        const h = it.clusterLabel || it.headline || it.articles?.[0]?.headline || '';
        return !isHindi(h);
      };
      const trending = dedup(
        [...allItems].filter(noHindi).sort((a, b) => scoreItem(b) - scoreItem(a)),
        20
      );
      const ddItems = dedup(
        [...allItems].filter(noHindi).filter(it => (it.sourceCount ?? it.articles?.length ?? 1) >= 3)
          .sort((a, b) => scoreItem(b) - scoreItem(a)),
        12
      );

      const allHeadlines = allItems.map(it => it.clusterLabel || it.headline || it.articles?.[0]?.headline || '').filter(Boolean);
      const entityCounts = extractEntityCounts(allHeadlines);

      const entityImages = new Map<string, string>();
      for (const [entity] of entityCounts.entries()) {
        const low = entity.toLowerCase();
        const match = allItems.find(it => {
          const t = [it.clusterLabel, it.headline, ...(it.articles ?? []).map(a => a.headline)].join(' ').toLowerCase();
          return t.includes(low) && (it.imageUrl || it.articles?.[0]?.imageUrl);
        });
        const img = match?.imageUrl || match?.articles?.[0]?.imageUrl;
        if (img) entityImages.set(entity, img);
      }

      const entityTopicSets = new Map<string, Set<string>>();
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const { topic, items } = r.value;
        const headlines = items.map((it: FeedItem) => it.clusterLabel || it.headline || '').filter(Boolean);
        for (const [entity] of extractEntityCounts(headlines).entries()) {
          if (!entityTopicSets.has(entity)) entityTopicSets.set(entity, new Set());
          entityTopicSets.get(entity)!.add(topic);
        }
      }

      const compList: EntityCard[] = [];
      const personList: EntityCard[] = [];
      const placeList: EntityCard[] = [];

      for (const [name, count] of entityCounts.entries()) {
        if (count < 2) continue;
        const ec: EntityCard = { name, count, imageUrl: entityImages.get(name) };
        const type = classifyEntity(name);
        if (type === 'company') compList.push(ec);
        else if (type === 'person') personList.push(ec);
        else if (type === 'place') placeList.push(ec);
      }
      compList.sort((a, b) => b.count - a.count);
      personList.sort((a, b) => b.count - a.count);
      placeList.sort((a, b) => b.count - a.count);

      const emerging: EntityCard[] = [...entityTopicSets.entries()]
        .filter(([, s]) => s.size >= 2)
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, 16)
        .map(([name, s]) => ({ name, count: s.size, imageUrl: entityImages.get(name) }));

      const srcMap = new Map<string, { domain: string; count: number }>();
      for (const it of allItems) {
        const srcs = [...(it.sources ?? []), ...(it.articles ?? []).flatMap(a => a.sources ?? [])];
        for (const src of srcs) {
          if (!src.name) continue;
          if (!srcMap.has(src.name)) {
            let domain = '';
            try { domain = new URL(src.url ?? '').hostname.replace(/^www\./, ''); } catch {}
            srcMap.set(src.name, { domain, count: 0 });
          }
          srcMap.get(src.name)!.count++;
        }
      }
      const srcList: SourceCard[] = [...srcMap.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 18)
        .map(([name, { domain, count }]) => ({ name, domain, count }));

      setTrendingStories(trending);
      setDeepDives(ddItems);
      setCompanies(compList.slice(0, 24));
      setPeople(personList.slice(0, 24));
      setPlaces(placeList.slice(0, 20));
      setEmergingTopics(emerging);
      setSources(srcList);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const doSearch = useCallback((q: string) => {
    setSearchQuery(q);
    const kw = q.toLowerCase();
    const storyMatches = dedup(
      allItemsRef.current.filter(it => {
        const srcNames = [
          ...(it.sources ?? []).map(s => s.name),
          ...(it.articles ?? []).flatMap(a => (a.sources ?? []).map(s => s.name)),
        ];
        const text = [it.clusterLabel, it.headline, it.summary, ...(it.articles ?? []).map(a => a.headline), ...srcNames].join(' ').toLowerCase();
        return text.includes(kw);
      }),
      20
    );
    const compMatches = companies.filter(c => c.name.toLowerCase().includes(kw));
    const personMatches = people.filter(p => p.name.toLowerCase().includes(kw));
    const placeMatches = places.filter(p => p.name.toLowerCase().includes(kw));
    setSearchResults({ stories: storyMatches, companies: compMatches, people: personMatches, places: placeMatches });
  }, [companies, people, places]);

  const triggerSearch = useCallback((term: string) => {
    setSearchText(term);
    doSearch(term);
  }, [doSearch]);

  const openArticle = useCallback((item: FeedItem) => {
    const articleWithId = item.articles?.find(a => a.id);
    const firstArticle = item.articles?.[0];
    const primary = articleWithId ?? firstArticle;
    const headline = primary?.headline ?? item.headline ?? item.clusterLabel ?? '';
    const allSources = (primary?.sources?.length ? primary.sources : item.sources) ?? [];
    const url = allSources[0]?.url ?? '';
    if (!headline) return;
    trackArticleOpen({ headline, id: '', summary: '', publishedAt: '', imageUrl: '', sources: [] } as never);
    navigation.navigate('Article', {
      id: (primary as { id?: string })?.id ?? '',
      url,
      image: primary?.imageUrl ?? item.imageUrl ?? '',
      headline,
      summary: primary?.summary ?? item.summary ?? '',
      source: allSources[0]?.name ?? '',
      publishedAt: primary?.publishedAt ?? item.publishedAt ?? '',
      dominantColor: getArticleColor(headline),
      sources: JSON.stringify(allSources),
    });
  }, [navigation]);

  const openTopic = useCallback((tag: string) => {
    navigation.navigate('TopicFeed', { tag });
  }, [navigation]);

  const clearSearch = () => {
    setSearchText('');
    setSearchQuery('');
    setSearchResults({ stories: [], companies: [], people: [], places: [] });
  };

  type Section =
    | { key: 'trending' }
    | { key: 'deepDives' }
    | { key: 'companies' }
    | { key: 'people' }
    | { key: 'places' }
    | { key: 'topics' }
    | { key: 'sources' }
    | { key: 'emerging' }
    | { key: 'searchResults' };

  const sections = useMemo<Section[]>(() => {
    if (searchQuery !== '') return [{ key: 'searchResults' }];
    const out: Section[] = [{ key: 'trending' }];
    if (loading || deepDives.length > 0) out.push({ key: 'deepDives' });
    if (loading || companies.length > 0) out.push({ key: 'companies' });
    if (loading || people.length > 0) out.push({ key: 'people' });
    if (loading || places.length > 0) out.push({ key: 'places' });
    out.push({ key: 'topics' });
    if (loading || sources.length > 0) out.push({ key: 'sources' });
    if (loading || emergingTopics.length > 0) out.push({ key: 'emerging' });
    return out;
  }, [searchQuery, loading, deepDives.length, companies.length, people.length, places.length, sources.length, emergingTopics.length]);

  const hasSearchResults = searchResults.stories.length > 0 || searchResults.companies.length > 0 ||
    searchResults.people.length > 0 || searchResults.places.length > 0;

  const renderSection = useCallback(({ item }: { item: Section }) => {
    if (item.key === 'searchResults') {
      if (!hasSearchResults) return <Text style={s.emptyText}>No results for "{searchQuery}"</Text>;
      return (
        <View>
          {searchResults.stories.length > 0 && (
            <View style={s.section}>
              <SectionLabel text="Stories" />
              {searchResults.stories.map((story, i) => (
                <SearchStoryCard key={i} item={story} onPress={() => openArticle(story)} />
              ))}
            </View>
          )}
          {searchResults.companies.length > 0 && (
            <View style={s.section}>
              <SectionLabel text="Companies" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {searchResults.companies.map((c, i) => (
                  <Pressable key={i} onPress={() => triggerSearch(c.name)} style={s.searchChip}>
                    <Text style={s.searchChipText}>{c.name}</Text>
                    <View style={[s.searchChipBadge, { backgroundColor: '#0A84FF18' }]}>
                      <Text style={[s.searchChipCount, { color: '#0A84FF' }]}>{c.count}</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
          {searchResults.people.length > 0 && (
            <View style={s.section}>
              <SectionLabel text="People" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {searchResults.people.map((p, i) => (
                  <Pressable key={i} onPress={() => triggerSearch(p.name)} style={s.searchChip}>
                    <Text style={s.searchChipText}>{p.name}</Text>
                    <View style={[s.searchChipBadge, { backgroundColor: '#FF9F0A18' }]}>
                      <Text style={[s.searchChipCount, { color: '#FF9F0A' }]}>{p.count}</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
          {searchResults.places.length > 0 && (
            <View style={s.section}>
              <SectionLabel text="Places" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {searchResults.places.map((p, i) => (
                  <Pressable key={i} onPress={() => triggerSearch(p.name)} style={s.searchChip}>
                    <Text style={s.searchChipText}>{p.name}</Text>
                    <View style={[s.searchChipBadge, { backgroundColor: '#30D15818' }]}>
                      <Text style={[s.searchChipCount, { color: '#30D158' }]}>{p.count}</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      );
    }
    if (item.key === 'trending') return (
      <View style={s.section}>
        <SectionLabel text="Trending Stories" />
        {loading ? (
          <><SkeletonBox height={200} style={{ marginBottom: 10 }} /><SkeletonBox height={200} style={{ marginBottom: 10 }} /></>
        ) : trendingStories.slice(0, 6).map((story, i) => (
          <VerticalStoryCard key={i} item={story} onPress={() => openArticle(story)} />
        ))}
      </View>
    );
    if (item.key === 'deepDives') return (
      <View style={s.section}>
        <SectionLabel text="AI Deep Dives" />
        {loading ? (
          <><SkeletonBox height={200} style={{ marginBottom: 10 }} /><SkeletonBox height={200} style={{ marginBottom: 10 }} /></>
        ) : deepDives.slice(0, 4).map((story, i) => (
          <VerticalStoryCard key={i} item={story} onPress={() => openArticle(story)} badge={{ text: '✦ DEEP DIVE', color: '#7C3AED' }} />
        ))}
      </View>
    );
    if (item.key === 'companies') return (
      <View style={s.section}>
        <SectionLabel text="Companies" />
        {loading ? <View style={s.grid2}>{[0,1,2,3].map(i => <SkeletonBox key={i} height={96} style={{ width: TILE_W }} />)}</View> : (
          <View style={s.grid2}>
            {companies.slice(0, 8).map((c, i) => <EntityTile key={i} entity={c} accent="#0A84FF" bgColor={COMPANY_BGS[i % 4]} onTap={triggerSearch} />)}
          </View>
        )}
      </View>
    );
    if (item.key === 'people') return (
      <View style={s.section}>
        <SectionLabel text="People" />
        {loading ? <View style={s.grid2}>{[0,1,2,3].map(i => <SkeletonBox key={i} height={96} style={{ width: TILE_W }} />)}</View> : (
          <View style={s.grid2}>
            {people.slice(0, 8).map((p, i) => <EntityTile key={i} entity={p} accent="#FF9F0A" bgColor={PEOPLE_BGS[i % 4]} onTap={triggerSearch} />)}
          </View>
        )}
      </View>
    );
    if (item.key === 'places') return (
      <View style={s.section}>
        <SectionLabel text="Places" />
        {loading ? <View style={s.grid2}>{[0,1,2,3].map(i => <SkeletonBox key={i} height={96} style={{ width: TILE_W }} />)}</View> : (
          <View style={s.grid2}>
            {places.slice(0, 8).map((p, i) => <EntityTile key={i} entity={p} accent="#30D158" bgColor={PLACE_BGS[i % 4]} onTap={triggerSearch} />)}
          </View>
        )}
      </View>
    );
    if (item.key === 'topics') return (
      <View style={s.section}>
        <SectionLabel text="Browse Topics" />
        <View style={s.grid2}>
          {TOPICS.map(t => (
            <Pressable key={t.tag} onPress={() => openTopic(t.tag)} style={[s.topicTile, { width: TILE_W }]}>
              <View style={[s.topicIcon, { backgroundColor: t.bg }]}>
                <Ionicons name={TOPIC_ICONS[t.tag] ?? 'newspaper-outline'} size={18} color={t.color} />
              </View>
              <Text style={s.topicLabel}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
    if (item.key === 'sources') return (
      <View style={s.section}>
        <SectionLabel text="Source Explorer" />
        {loading ? <View style={s.grid3}>{[0,1,2,3,4,5].map(i => <SkeletonBox key={i} height={88} style={{ width: CHIP_W }} />)}</View> : (
          <View style={s.grid3}>
            {sources.slice(0, 9).map((src, i) => <SourceChip key={i} src={src} onTap={triggerSearch} />)}
          </View>
        )}
      </View>
    );
    if (item.key === 'emerging') return (
      <View style={s.section}>
        <SectionLabel text="Emerging Topics" />
        {loading ? <View style={s.grid2}>{[0,1,2,3].map(i => <SkeletonBox key={i} height={96} style={{ width: TILE_W }} />)}</View> : (
          <View style={s.grid2}>
            {emergingTopics.slice(0, 8).map((t, i) => <EntityTile key={i} entity={t} accent="#64D2FF" bgColor={EMERGE_BGS[i % 4]} onTap={triggerSearch} />)}
          </View>
        )}
      </View>
    );
    return null;
  }, [loading, trendingStories, deepDives, companies, people, places, sources, emergingTopics,
      searchQuery, searchResults, hasSearchResults, openArticle, openTopic, triggerSearch]);

  const ListHeader = useMemo(() => (
    <View style={s.header}>
      <Text style={s.title}>Explore</Text>
      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={15} color="#444" />
        <TextInput
          style={s.searchInput}
          placeholder="Search stories, companies, people…"
          placeholderTextColor="#444"
          value={searchText}
          onChangeText={setSearchText}
          onSubmitEditing={() => { const q = searchText.trim(); if (q) doSearch(q); else clearSearch(); }}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchText.length > 0 && (
          <Pressable onPress={clearSearch} hitSlop={8}>
            <Ionicons name="close" size={16} color="#555" />
          </Pressable>
        )}
      </View>
    </View>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [searchText]);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <FlatList
        data={sections}
        keyExtractor={item => item.key}
        renderItem={renderSection}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        windowSize={5}
        removeClippedSubviews={true}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 110 },
  header: { paddingTop: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginTop: 8, marginBottom: 14 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#111', borderWidth: 1, borderColor: '#1E1E1E',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 20,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#ccc' },

  section: { marginBottom: 28 },
  emptyText: { color: '#444', fontSize: 13, textAlign: 'center', paddingVertical: 32 },

  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionDot: { color: '#4A90D9', fontSize: 11 },
  sectionText: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#555', textTransform: 'uppercase' },

  // Vertical story card
  vCard: { width: '100%', height: 200, borderRadius: 16, overflow: 'hidden', marginBottom: 10 },
  vCardImg: { ...StyleSheet.absoluteFillObject },
  vCardGradient: {
    ...StyleSheet.absoluteFillObject,
    // Simulate gradient with opacity layers
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  vCardBadge: { position: 'absolute', top: 10, left: 10, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  vCardBadgeText: { fontSize: 8.5, fontWeight: '800', color: '#fff', letterSpacing: 0.8 },
  vCardSrcBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  vCardSrcBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  vCardBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 14 },
  vCardMeta: { flexDirection: 'row', gap: 5, alignItems: 'center', marginBottom: 6 },
  vCardSrcName: { fontSize: 9.5, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 },
  vCardTs: { fontSize: 9, color: 'rgba(255,255,255,0.3)' },
  vCardHeadline: { fontSize: 15, fontWeight: '800', color: '#fff', lineHeight: 20, letterSpacing: -0.2 },

  // Entity tile
  entityTile: { height: 96, borderRadius: 14, overflow: 'hidden', marginBottom: 10 },
  entityTileImg: { ...StyleSheet.absoluteFillObject },
  entityTileOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  entityTileBody: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12 },
  entityTileCount: { fontSize: 8.5, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 },
  entityTileName: { fontSize: 14, fontWeight: '800', color: '#fff', lineHeight: 17 },

  // Source chip
  sourceChip: {
    height: 88, borderRadius: 12, backgroundColor: '#0E0E0E',
    borderWidth: 1, borderColor: '#1A1A1A',
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, paddingHorizontal: 8, marginBottom: 10,
  },
  sourceFavicon: { width: 24, height: 24, borderRadius: 6, marginBottom: 6 },
  sourceFaviconPlaceholder: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#222', marginBottom: 6 },
  sourceName: { fontSize: 9.5, fontWeight: '700', color: '#999', textAlign: 'center', lineHeight: 13 },
  sourceCount: { fontSize: 8.5, color: '#444', fontWeight: '600', marginTop: 2 },

  // Search card
  searchCard: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    backgroundColor: '#0E0E0E', borderWidth: 1, borderColor: '#1A1A1A',
    borderRadius: 12, padding: 10, marginBottom: 8,
  },
  searchCardThumb: { width: 56, height: 56, borderRadius: 8, overflow: 'hidden', flexShrink: 0 },
  searchCardBody: { flex: 1, minWidth: 0 },
  searchCardMeta: { fontSize: 9.5, color: '#555', fontWeight: '600', marginBottom: 3 },
  searchCardHeadline: { fontSize: 12.5, fontWeight: '700', color: '#eee', lineHeight: 17 },

  // Search result chips
  searchChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#111', borderWidth: 1, borderColor: '#1E1E1E',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginRight: 8,
  },
  searchChipText: { fontSize: 13, fontWeight: '700', color: '#ddd' },
  searchChipBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  searchChipCount: { fontSize: 9, fontWeight: '700' },

  // Topic tile
  topicTile: {
    height: 64, borderRadius: 14, backgroundColor: '#0E0E0E',
    borderWidth: 1, borderColor: '#1A1A1A',
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, marginBottom: 10,
  },
  topicIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  topicLabel: { fontSize: 13.5, fontWeight: '700', color: '#eee' },

  // Grids
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  grid3: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
