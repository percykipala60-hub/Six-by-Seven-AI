import type { Metadata } from 'next';
import { Reglages } from './Reglages';

export const metadata: Metadata = { title: 'Réglages' };

export default function ReglagesPage() {
  return <Reglages />;
}
