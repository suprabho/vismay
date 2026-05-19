import { NextResponse } from "next/server";
import { getWalletGeoCountryProfile } from "@/lib/wallet-geo/data";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: codeParam } = await params;
  const code = codeParam.toUpperCase();
  const profile = getWalletGeoCountryProfile(code);
  if (!profile) {
    return NextResponse.json({ error: "not_found", code }, { status: 404 });
  }
  return NextResponse.json(profile, {
    headers: { "cache-control": "s-maxage=3600, stale-while-revalidate=86400" },
  });
}
