import { NextRequest, NextResponse } from 'next/server';

// Proxy server-side cho addresskit (communes/phường-xã theo tỉnh). Lý do proxy: API gốc
// không trả Access-Control-Allow-Origin nên trình duyệt chặn fetch trực tiếp.
const UPSTREAM = (provinceCode: string) =>
  `https://production.cas.so/address-kit/latest/provinces/${provinceCode}/communes`;
const ONE_YEAR = 31536000; // giây

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

export async function GET(req: NextRequest) {
  const provinceCode = req.nextUrl.searchParams.get('provinceCode')?.trim();
  // Chỉ chấp nhận mã số (addresskit dùng code dạng "01") - chặn path injection.
  if (!provinceCode || !/^\d+$/.test(provinceCode)) {
    return NextResponse.json({ error: 'provinceCode không hợp lệ' }, { status: 400 });
  }
  try {
    const res = await fetch(UPSTREAM(provinceCode), { next: { revalidate: ONE_YEAR } });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const json = await res.json();
    const wards = (json.communes ?? []).map((c: { code: string; name: string }) => ({
      code: c.code,
      name: clean(c.name),
    }));
    return NextResponse.json(
      { wards },
      { headers: { 'Cache-Control': `public, max-age=${ONE_YEAR}, immutable` } },
    );
  } catch {
    return NextResponse.json({ error: 'Không tải được danh sách phường/xã' }, { status: 502 });
  }
}
