export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    {
      cartoBasemapsApiKey:
        process.env.CARTO_BASEMAPS_API_KEY?.trim() ?? process.env.CARTO_API_KEY?.trim() ?? '',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
