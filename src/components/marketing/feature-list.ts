import { BarChart3, CalendarDays, ImageIcon, Layers, ListOrdered, MessagesSquare, ShieldCheck, Users } from 'lucide-react';

export const FEATURES = [
  { icon: CalendarDays, title: 'Visual calendar', body: 'See every scheduled and published post by month, week or day. Drag to reschedule, drop a draft to schedule it.' },
  { icon: Layers, title: 'One post, every channel', body: 'Write once, then tailor the caption and media for Instagram and Facebook. Each version is checked against the platform’s rules.' },
  { icon: ListOrdered, title: 'Posting queue', body: 'Set your weekly posting times once. Add posts to the queue and they fill the next free slot automatically.' },
  { icon: ShieldCheck, title: 'Reliable publishing', body: 'Posts are saved before they’re queued, retried safely when a platform hiccups, and never published twice.' },
  { icon: ImageIcon, title: 'Media library', body: 'Upload images and videos once, reuse them across posts. Files stay private to your workspace.' },
  { icon: Users, title: 'Projects for every brand', body: 'Keep each brand or client in its own project with its own Instagram account and Facebook Page, and invite teammates as Admin, Publisher or Analyst.' },
  { icon: BarChart3, title: 'Honest insights', body: 'Followers, reach and engagement straight from the platforms’ APIs. Unavailable metrics are shown as unavailable, never guessed.' },
  { icon: MessagesSquare, title: 'Comments inbox', body: 'Read and answer comments on your published posts in one place, with saved replies and internal notes.' },
];
