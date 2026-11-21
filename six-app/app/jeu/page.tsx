import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kin Rush',
  description: 'Course de moto-taxi à travers Kinshasa. Un jeu Six by Seven.AI.',
  robots: 'noindex, nofollow',
};

export default function JeuPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-[#14161d]">
      <iframe
        src="/jeu/index.html"
        title="Kin Rush"
        className="flex-1 w-full min-h-0 border-0"
        allow="autoplay; accelerometer; gyroscope; vibration"
        sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-orientation-lock"
      />
    </main>
  );
}
