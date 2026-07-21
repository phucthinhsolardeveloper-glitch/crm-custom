import { NextResponse } from 'next/server';

// Proxy server-side cho addresskit (provinces). Cần proxy vì API gốc không trả
// Access-Control-Allow-Origin -> trình duyệt chặn nếu fetch trực tiếp.
// Mô hình 2 cấp, effectiveDate=latest. Dữ liệu ít đổi -> cache mạnh ở data layer + CDN.
const UPSTREAM = 'https://production.cas.so/address-kit/latest/provinces';
const ONE_YEAR = 31536000; // giây

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

export async function GET() {
  try {
    const res = await fetch(UPSTREAM, { next: { revalidate: ONE_YEAR } });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const json = await res.json();
    const provinces = (json.provinces ?? []).map((p: { code: string; name: string }) => ({
      code: p.code,
      name: clean(p.name),
    }));
    return NextResponse.json(
      { provinces },
      { headers: { 'Cache-Control': `public, max-age=${ONE_YEAR}, immutable` } },
    );
  } catch {
    return NextResponse.json({ error: 'Không tải được danh sách tỉnh/thành' }, { status: 502 });
  }
}
