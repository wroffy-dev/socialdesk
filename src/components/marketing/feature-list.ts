import {
  BarChart3,
  CalendarDays,
  Clock,
  FolderKanban,
  ImageIcon,
  KeyRound,
  Layers,
  ListOrdered,
  MessagesSquare,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Tags,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Platform } from '@/lib/platforms';

export interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
}

/** Short feature cards (home page grid). */
export const FEATURES: Feature[] = [
  { icon: Layers, title: 'One post, every channel', body: 'Write once, then tailor the caption and media for each network. Every version is checked against that platform’s rules before it can be scheduled.' },
  { icon: CalendarDays, title: 'Visual calendar', body: 'See every scheduled and published post by month, week or day. Drag a post to reschedule it, or drop a draft onto a day to schedule it.' },
  { icon: ListOrdered, title: 'Posting queue', body: 'Set your weekly posting times once. Add posts to the queue and they take the next free slot automatically.' },
  { icon: Clock, title: 'Best time to post', body: 'Learn when your audience engages most, from your own published posts, and add those times to your queue in one click.' },
  { icon: MessagesSquare, title: 'Comments inbox', body: 'Read and reply to comments from Instagram, Facebook and YouTube in one place, with saved replies and internal notes.' },
  { icon: BarChart3, title: 'Honest insights', body: 'Followers, reach and engagement straight from the platforms’ APIs. Anything a platform doesn’t provide is shown as unavailable, never guessed.' },
  { icon: FolderKanban, title: 'Projects for every brand', body: 'Keep each brand or client in its own project with its own accounts, so nothing is ever posted to the wrong page.' },
  { icon: ShieldCheck, title: 'Reliable publishing', body: 'Posts are saved before they’re queued, retried safely when a platform hiccups, and never published twice.' },
];

export interface FeatureGroup {
  id: string;
  eyebrow: string;
  title: string;
  intro: string;
  items: Feature[];
}

/** Detailed feature groups (features page). */
export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: 'create',
    eyebrow: 'Create',
    title: 'Write once, fit every network',
    intro: 'One composer for all your channels. Start with a shared caption and media, then fine-tune each network’s version without copying and pasting.',
    items: [
      { icon: Layers, title: 'Per-network versions', body: 'Edit the caption, media and options for each channel separately, or keep them in sync with the base post.' },
      { icon: ShieldCheck, title: 'Checks before you schedule', body: 'Character limits, hashtag limits, media counts, video length and aspect ratios are checked live for each network.' },
      { icon: ImageIcon, title: 'Media library', body: 'Upload images and videos once and reuse them across posts. Files stay private to your workspace.' },
      { icon: Tags, title: 'Tags', body: 'Label posts by campaign, product or content type to find and filter them later.' },
    ],
  },
  {
    id: 'schedule',
    eyebrow: 'Schedule',
    title: 'A calendar and a queue that work together',
    intro: 'Plan visually on the calendar, or let the queue keep a steady rhythm for you. Times always follow your workspace’s timezone.',
    items: [
      { icon: CalendarDays, title: 'Drag-and-drop calendar', body: 'Month, week and day views. Drag to reschedule; drop a draft onto a day to schedule it.' },
      { icon: ListOrdered, title: 'Weekly posting slots', body: 'Choose the days and times you want to post. Queued posts fill the next free slot automatically.' },
      { icon: Clock, title: 'Best time to post', body: 'A weekday × hour heatmap built from your own results, with the top three times ready to add to your queue.' },
      { icon: RefreshCcw, title: 'Publish now or later', body: 'Schedule for a specific moment, add to the queue, or publish immediately and follow its status live.' },
    ],
  },
  {
    id: 'engage',
    eyebrow: 'Engage',
    title: 'Never miss a comment',
    intro: 'Comments on your published posts arrive in one inbox, so your team can answer quickly without opening five apps.',
    items: [
      { icon: MessagesSquare, title: 'Unified comments inbox', body: 'Instagram, Facebook and YouTube comments in one list, synced automatically or on demand.' },
      { icon: Sparkles, title: 'Saved replies', body: 'Keep answers to common questions ready and insert them with a click.' },
      { icon: UserCheck, title: 'Assign and note', body: 'Assign conversations to teammates and leave internal notes that customers never see.' },
      { icon: Sparkles, title: 'First comment', body: 'Post a first comment automatically right after publishing, for hashtags, links or a call to action.' },
    ],
  },
  {
    id: 'analyse',
    eyebrow: 'Analyse',
    title: 'Numbers you can trust',
    intro: 'Insights come straight from each platform’s official API. When a metric isn’t available, SocialDesk says so instead of estimating.',
    items: [
      { icon: BarChart3, title: 'Account and post insights', body: 'Followers, reach, impressions and engagement per channel and per post, synced every few hours.' },
      { icon: Clock, title: 'Timing insights', body: 'Engagement is compared against each channel’s typical post, so big and small accounts are judged fairly.' },
      { icon: BarChart3, title: 'CSV export', body: 'Export your numbers for reports and client decks (on plans that include it).' },
    ],
  },
  {
    id: 'team',
    eyebrow: 'Teams & agencies',
    title: 'Built for teams and client work',
    intro: 'Run every brand from one workspace without mixing them up, and give each teammate exactly the access they need.',
    items: [
      { icon: FolderKanban, title: 'Projects', body: 'One project per brand or client, each with its own Instagram, Facebook, X, LinkedIn and YouTube account.' },
      { icon: Users, title: 'Roles', body: 'Owner, Admin, Publisher and Analyst roles, so interns can draft and clients can only view results.' },
      { icon: ShieldCheck, title: 'Audit log', body: 'See who connected a channel, changed a setting or published a post, and when.' },
      { icon: KeyRound, title: 'Secure by default', body: 'Channel tokens are encrypted at rest and every workspace’s data is kept separate.' },
    ],
  },
];

/** Instagram-specific capabilities (home page highlight). */
export const INSTAGRAM_FEATURES = [
  'Feed photos and carousels (up to 10 items)',
  'Reels with a cover frame and “also share to feed”',
  'Stories with an image or video',
  'Invite up to 3 collaborators',
  'Tag people on photos and Reels',
  'Automatic first comment',
];

export interface PlatformRow {
  label: string;
  values: Record<Platform, string | boolean>;
}

/** What each network supports today (features page table). */
export const PLATFORM_MATRIX: PlatformRow[] = [
  {
    label: 'Publish',
    values: {
      INSTAGRAM: 'Photos, carousels, Reels, Stories',
      FACEBOOK: 'Page posts with text, links, photos or video',
      X: 'Text, up to 4 images, a GIF or a video',
      LINKEDIN: 'Profiles and pages: text, images, video',
      YOUTUBE: 'Videos and Shorts',
    },
  },
  { label: 'Schedule & queue', values: { INSTAGRAM: true, FACEBOOK: true, X: true, LINKEDIN: true, YOUTUBE: true } },
  { label: 'First comment', values: { INSTAGRAM: true, FACEBOOK: true, X: 'Posted as a reply', LINKEDIN: true, YOUTUBE: true } },
  { label: 'Comments inbox', values: { INSTAGRAM: true, FACEBOOK: true, X: false, LINKEDIN: false, YOUTUBE: true } },
  { label: 'Insights', values: { INSTAGRAM: true, FACEBOOK: true, X: 'Needs a paid X API tier', LINKEDIN: 'Pages only', YOUTUBE: true } },
];

export const STORY = [
  {
    eyebrow: 'Create',
    title: 'Start with an idea',
    body: 'Write your post once in a single composer, add images or video from your media library, then fine-tune each network’s version.',
    points: ['Per-network captions and media', 'Live checks against each platform’s rules', 'Reuse media across posts'],
  },
  {
    eyebrow: 'Plan',
    title: 'Give it a time slot',
    body: 'Drag posts around a visual calendar, or drop them into your weekly queue and let them take the next free slot.',
    points: ['Month, week and day views', 'Weekly posting slots per workspace', 'Best-time suggestions from your own results'],
  },
  {
    eyebrow: 'Publish',
    title: 'Send it everywhere, once',
    body: 'At the right moment SocialDesk publishes to Instagram, Facebook, X, LinkedIn and YouTube through their official APIs, and posts your first comment.',
    points: ['Safe retries, never a duplicate', 'Reels, Stories, carousels and Shorts', 'Clear status and reasons if something needs you'],
  },
  {
    eyebrow: 'Engage',
    title: 'Keep the conversation going',
    body: 'Comments from Instagram, Facebook and YouTube land in one inbox, so your team can reply quickly and consistently.',
    points: ['Saved replies for common questions', 'Assign conversations to teammates', 'Internal notes your audience never sees'],
  },
  {
    eyebrow: 'Learn',
    title: 'See what works, do more of it',
    body: 'Insights straight from each platform show which posts and which times perform best, so next month’s plan is better than this one.',
    points: ['Account and post metrics', 'Weekday × hour heatmap', 'CSV export for client reports'],
  },
];

export const TRUST_POINTS = [
  { icon: KeyRound, title: 'Official APIs only', body: 'We connect through each platform’s official sign-in and API. No password sharing, no scraping, no browser bots.' },
  { icon: ShieldCheck, title: 'Never posted twice', body: 'Every publish is tracked and checked. If a network times out, we verify before retrying, so followers never see duplicates.' },
  { icon: KeyRound, title: 'Encrypted tokens', body: 'Access tokens are encrypted at rest and refreshed automatically. Disconnecting a channel deletes its token.' },
  { icon: BarChart3, title: 'No made-up numbers', body: 'If a platform doesn’t provide a metric, you’ll see “unavailable”, not an estimate.' },
];

export const FAQS = [
  {
    q: 'Which social networks can I use?',
    a: 'Instagram professional accounts (Business or Creator), Facebook Pages, X, LinkedIn profiles and company pages, and YouTube channels. Threads, Bluesky and Pinterest are planned next.',
  },
  {
    q: 'Do I need an Instagram Business account?',
    a: 'Yes. Instagram only allows publishing through its API for professional accounts (Business or Creator) that are linked to a Facebook Page. Switching is free in the Instagram app.',
  },
  {
    q: 'Can I post Reels and Stories?',
    a: 'Yes. You can publish feed photos, carousels, Reels (with a cover frame and “also share to feed”) and Stories. Posts and Reels can also invite collaborators and tag people.',
  },
  {
    q: 'Is it safe to connect my accounts?',
    a: 'You sign in on the platform’s own page and we never see your password. Access tokens are encrypted, and you can disconnect a channel at any time, which deletes its token.',
  },
  {
    q: 'I manage several clients. How does that work?',
    a: 'Create one project per client. Each project has its own accounts, so posts can’t go to the wrong brand. Invite teammates with the role they need: Admin, Publisher or Analyst.',
  },
  {
    q: 'How does “best time to post” work?',
    a: 'Once you have a few published posts with metrics, SocialDesk compares each post’s engagement with your typical post and shows which weekday and hour perform best in your timezone. It never guesses with too little data.',
  },
  {
    q: 'What happens if a post fails?',
    a: 'Temporary problems are retried automatically. If something needs your attention, like a reconnect or a media issue, the post is marked clearly and you’re notified, with the reason in plain language.',
  },
  {
    q: 'Can I cancel any time?',
    a: 'Yes. Plans are monthly with no lock-in, and you can move back to the Free plan whenever you like.',
  },
];
