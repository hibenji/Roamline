import type { Metadata } from 'next';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Roamline — Your private location atlas',
  description:
    'Explore your Google Maps Timeline JSON export as a 3D globe, replay, and heatmap. Your location history stays in your browser.',
  keywords: [
    'Google Maps JSON export',
    'Google Maps Timeline export',
    'location history map',
    'travel timeline',
    '3D globe',
  ],
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
