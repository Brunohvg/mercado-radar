import { NextResponse } from "next/server";
import { getMlSession, getTrends } from "@/lib/mercado-livre";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getMlSession();
    const trends = await getTrends({
      accessToken: session.accessToken,
    }).catch(() => []);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      trends: trends.slice(0, 16).map((trend, index) => ({
        keyword: trend.keyword,
        position: index + 1,
      })),
    });
  } catch {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      trends: [],
    });
  }
}
