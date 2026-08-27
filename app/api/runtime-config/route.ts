export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN?.trim() ?? '' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
