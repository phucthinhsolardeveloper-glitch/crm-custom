import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient, Prisma, UserRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { SystemSettingsService, SETTING_KEYS } from '../system-settings/system-settings.service';

const DEFAULT_CALL_PROMPT = `Bạn là trợ lý CRM phân tích cuộc gọi. Hãy tóm tắt nội dung cuộc gọi bằng tiếng Việt: điểm chính, nhu cầu khách hàng, hành động tiếp theo.`;

const DEFAULT_CUSTOMER_PROMPT = `Bạn là trợ lý CRM phân tích khách hàng. Dựa trên dữ liệu, hãy đánh giá mức độ tiềm năng, hành vi mua, rủi ro mất KH, và đề xuất hành động tiếp theo.`;

/** Fixed wrapper to always extract short + detail + rating from AI output. Length depends on admin prompt. */
const CUSTOMER_OUTPUT_WRAPPER = `

QUAN TRỌNG: Trả lời ĐÚNG format JSON sau (không markdown, không backtick):
{"short":"tóm tắt ngắn","detail":"phân tích chi tiết","rating":3}
Trong đó rating là số nguyên từ 1-5 đánh giá mức độ tiềm năng tổng thể của khách hàng (1=rất thấp, 5=rất cao).`;

/**
 * Wrapper ép GPT trả JSON schema cho bento UI v2.
 * - Đặt SAU prompt admin (SETTINGS.AI_CALL_ANALYSIS_PROMPT) + transcript.
 * - Backward compat: tags + detail luôn còn (UI cũ render OK nếu thiếu fields mới).
 * - response_format: { type: 'json_object' } ở callAI() là layer enforce JSON từ model side.
 * - Schema cố định ở code vì frontend bento parse theo path cụ thể (customer.need...).
 *   Business rules chấm điểm → admin viết trong prompt Settings, không hard-code ở đây.
 */
const CALL_ANALYSIS_V2_WRAPPER = `

QUAN TRỌNG: Trả lời ĐÚNG format JSON sau (KHÔNG markdown wrapper, KHÔNG backtick, KHÔNG text giải thích trước/sau).
Nếu phân tích phía trên có viết theo markdown sections, hãy MAP nội dung vào các field JSON dưới đây tương ứng.

{
  "score": 8,
  "tags": ["khách quan tâm", "hỏi giá", "cần follow-up"],
  "summary": "Sale tư vấn rõ ràng, khách quan tâm nhưng cần thời gian suy nghĩ thêm.",
  "detail": "Phân tích markdown chi tiết",
  "meta": { "mood": "😊 Tích cực", "intent": "Tìm hiểu sản phẩm", "outcome": "Cần follow-up" },
  "customer": {
    "need": "Cần tã size L cho bé 12kg, ưu tiên thoáng khí",
    "concern": "Lo giá cao so với hãng khác",
    "moods": ["Quan tâm", "Lưỡng lự"]
  },
  "sale": {
    "intent": "Bình tĩnh / Tư vấn rõ ràng",
    "strengths": [
      "Lắng nghe đầy đủ nhu cầu trước khi tư vấn",
      "So sánh sản phẩm với hãng khác hợp lý"
    ],
    "improvements": [
      "Chưa đề nghị test sample - phải nói 'em gửi anh/chị 1 gói size L test trước nhé' thay vì im lặng",
      "Không chốt thời điểm gọi lại cụ thể"
    ]
  },
  "actions": [
    { "title": "Gửi mẫu sản phẩm size L test miễn phí", "priority": "today", "dueHint": "trong hôm nay", "note": "Khách đã đồng ý" },
    { "title": "Gọi lại sau 2 ngày confirm đặt hàng", "priority": "optional", "dueHint": "10/06" }
  ]
}

Ràng buộc bắt buộc:
- score: số nguyên 0-10 (chất lượng cuộc gọi tổng thể: kỹ năng sale + kết quả + thái độ. 0 = kém, 10 = xuất sắc).
- tags: 2-5 nhãn ngắn 2-4 từ.
- summary: 1 câu duy nhất, ≤ 25 từ.
- priority: CHỈ "urgent" | "today" | "optional".
- actions: tối đa 5 việc, sắp xếp ưu tiên giảm dần.
- moods: tối đa 4 cảm xúc.
- strengths / improvements: tối đa 4 mỗi list.
- improvements PHẢI kèm câu nói gợi ý cụ thể (vd "thay 'sẽ xem xét' bằng 'em gọi lại 14h mai xác nhận'").
- Field nào không phân tích được → bỏ qua, không bịa.
`;

/** Clamp score về [0,10] và đảm bảo là integer. Null nếu input invalid. */
function normalizeScore(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(10, Math.round(n)));
}

@Injectable()
export class AiSummaryService {
  private readonly logger = new Logger(AiSummaryService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ConfigService,
    private readonly settings: SystemSettingsService,
  ) {}

  /**
   * Trigger after call ingest. Chi phan tich cuoc goi neu co transcript.
   * KHONG gate duration: trust upstream (OmiCall ASR) da loc cuoc co transcript.
   * KHONG auto trigger customer analysis - de UI goi thu cong khi can.
   */
  async triggerFromCall(callLogId: bigint, callLog: { content: string | null }) {
    if (!callLog.content) return;
    try {
      await this.analyzeCall(callLogId, callLog.content);
    } catch (err) {
      this.logger.error('AI trigger failed', err);
    }
  }

  /**
   * Analyze 1 cuộc gọi. Lưu JSON schema v2 vào callLog.analysis.
   * Schema: { tags, detail, score, summary, meta, customer, sale, actions }
   * - Schema v1 cũ ({tags, detail}) vẫn render OK ở UI (các field mới optional).
   * - Score clamp [0,10], integer. Invalid -> null (badge "Chưa chấm điểm" ở UI).
   */
  async analyzeCall(callLogId: bigint, content: string): Promise<string | null> {
    const userPrompt = await this.settings.get(SETTING_KEYS.AI_CALL_ANALYSIS_PROMPT) || DEFAULT_CALL_PROMPT;
    const prompt = `${userPrompt}\n\nNội dung cuộc gọi:\n${content}${CALL_ANALYSIS_V2_WRAPPER}`;
    let raw = await this.callAI(prompt, { jsonMode: true });
    if (!raw) return null;
    // AI doi khi sinh null byte trong text. Neu de lot, JSON.stringify escape no thanh
    // literal "\u0000" luu vao analysis (TEXT) -> khi score-filter cast analysis::jsonb,
    // Postgres fail ("unsupported Unicode escape sequence") lam chet ca query -> tra ve rong.
    // Strip o raw TRUOC khi parse/stringify de khong con lot vao DB.
    raw = raw.replace(/\u0000/g, "");

    // Parse v2, fallback v1 (tags+detail), fallback v0 (raw text -> detail).
    let result: string;
    try {
      const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const normalized = {
        // backward-compat fields
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
        detail: typeof parsed.detail === 'string' ? parsed.detail : '',
        // v2 fields (all optional - UI render conditional)
        score: normalizeScore(parsed.score),
        summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
        meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : undefined,
        customer: parsed.customer && typeof parsed.customer === 'object' ? parsed.customer : undefined,
        sale: parsed.sale && typeof parsed.sale === 'object' ? parsed.sale : undefined,
        actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 5) : undefined,
      };

      // Cần ít nhất tags+detail HOẶC score để được coi là valid v2 output
      if (normalized.tags.length || normalized.detail || normalized.score !== null) {
        result = JSON.stringify(normalized);
      } else {
        result = JSON.stringify({ tags: [], detail: raw, score: null });
      }
    } catch {
      result = JSON.stringify({ tags: [], detail: raw, score: null });
    }

    await this.prisma.callLog.update({
      where: { id: callLogId },
      data: { analysis: result },
    });

    return result;
  }

  /**
   * Summarize calls in date range using only tags. Max 150 calls. Fixed prompt.
   * Scope theo role (giong CallLogsService.list) de tranh USER/LEADER tong hop tag ngoai pham vi:
   * - MANAGER+ -> tat ca. LEADER co team -> member team. USER / LEADER khong team -> self.
   */
  async summarizeCalls(
    dateFrom: string,
    dateTo: string,
    actor: { id: bigint; role: UserRole; teamId: bigint | null },
  ): Promise<string | null> {
    // dateTo co the la ngay ("2026-07-17") hoac ngay+gio ("2026-07-17T10:25").
    // Chi append cuoi ngay khi la date-only, tranh tao chuoi "...T10:25T23:59:..." -> Invalid Date -> 500.
    const gte = new Date(dateFrom);
    const lte = new Date(dateTo.includes('T') ? dateTo : dateTo + 'T23:59:59.999Z');
    if (Number.isNaN(gte.getTime()) || Number.isNaN(lte.getTime())) return null;
    const where: Prisma.CallLogWhereInput = {
      deletedAt: null,
      callTime: { gte, lte },
      analysis: { not: null },
    };
    if (actor.role !== UserRole.SUPER_ADMIN && actor.role !== UserRole.MANAGER) {
      if (actor.role === UserRole.LEADER && actor.teamId != null) {
        const members = await this.prisma.user.findMany({
          where: { teamId: actor.teamId, deletedAt: null },
          select: { id: true },
        });
        where.matchedUserId = { in: members.map((m) => m.id) };
      } else {
        where.matchedUserId = actor.id;
      }
    }

    const calls = await this.prisma.callLog.findMany({
      where,
      select: { analysis: true, callType: true },
      orderBy: { callTime: 'desc' },
      take: 150,
    });

    if (calls.length === 0) return null;

    // Extract only tags from each call analysis
    const allTags: string[] = [];
    const tagCounts: Record<string, number> = {};
    for (const c of calls) {
      try {
        const parsed = JSON.parse(c.analysis!);
        const tags: string[] = parsed.tags || [];
        for (const tag of tags) {
          allTags.push(tag);
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      } catch { /* skip non-JSON */ }
    }

    if (allTags.length === 0) return null;

    // Build tag frequency list
    const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    const tagList = sorted.map(([tag, count]) => `- "${tag}": ${count} lần`).join('\n');

    const prompt = `Bạn là trợ lý CRM phân tích hiệu suất cuộc gọi. Dựa trên các nhãn (tags) được AI gán cho ${calls.length} cuộc gọi trong khoảng ${dateFrom} → ${dateTo}, hãy:

1. **Tổng quan**: Tóm tắt tình hình chung cuộc gọi
2. **Điểm mạnh**: Những xu hướng tích cực (VD: nhiều tag "Khách hài lòng", "Đã chốt đơn"...)
3. **Điểm yếu**: Những vấn đề cần cải thiện (VD: nhiều tag "Khách phàn nàn", "Nhỡ cuộc gọi"...)
4. **Đề xuất**: 2-3 hành động cụ thể để cải thiện

Trả lời bằng tiếng Việt, dùng markdown.

Tần suất nhãn (${sorted.length} loại, ${allTags.length} tổng):
${tagList}`;

    return this.callAI(prompt);
  }

  /** Analyze customer: gather all data, generate short + detail descriptions + rating. */
  async analyzeCustomer(customerId: bigint): Promise<{ short: string; detail: string; rating: number | null } | null> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { id: true, name: true, phone: true, status: true },
    });
    if (!customer) return null;

    // Gather leads
    const leads = await this.prisma.lead.findMany({
      where: { customerId, deletedAt: null },
      select: { id: true, name: true, status: true, product: { select: { name: true } } },
    });
    const leadIds = leads.map(l => l.id);

    // Gather notes (activities from customer + leads)
    const activities = await this.prisma.activity.findMany({
      where: {
        deletedAt: null,
        OR: [
          { entityType: 'CUSTOMER', entityId: customerId },
          ...(leadIds.length > 0 ? [{ entityType: 'LEAD' as const, entityId: { in: leadIds } }] : []),
        ],
      },
      select: { type: true, content: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    // Gather payments
    const orders = await this.prisma.order.findMany({
      where: { customerId, deletedAt: null },
      select: {
        status: true, totalAmount: true,
        product: { select: { name: true } },
        payments: { select: { amount: true, status: true, createdAt: true } },
      },
    });

    // Gather call analyses
    const callLogs = await this.prisma.callLog.findMany({
      where: {
        deletedAt: null,
        analysis: { not: null },
        OR: [
          { matchedEntityType: 'CUSTOMER', matchedEntityId: customerId },
          ...(leadIds.length > 0 ? [{ matchedEntityType: 'LEAD' as const, matchedEntityId: { in: leadIds } }] : []),
        ],
      },
      select: { analysis: true, callTime: true, duration: true },
      orderBy: { callTime: 'desc' },
      take: 10,
    });

    // Build context
    const context = [
      `Khách hàng: ${customer.name} (${customer.phone}) - ${customer.status}`,
      `Leads (${leads.length}): ${leads.map(l => `${l.name} [${l.status}] SP:${l.product?.name || '?'}`).join(' | ') || 'Chưa có'}`,
      `Đơn hàng (${orders.length}): ${orders.map(o => `${o.product?.name}: ${o.status} ${o.totalAmount} - ${o.payments.length} thanh toán`).join(' | ') || 'Chưa có'}`,
      `Ghi chú (${activities.length}): ${activities.map(a => `[${a.type}] ${a.content || ''}`).join(' | ') || 'Chưa có'}`,
      `Phân tích cuộc gọi (${callLogs.length}): ${callLogs.map(c => c.analysis).join(' | ') || 'Chưa có'}`,
    ].join('\n');

    const userPrompt = await this.settings.get(SETTING_KEYS.AI_CUSTOMER_ANALYSIS_PROMPT) || DEFAULT_CUSTOMER_PROMPT;
    const prompt = `${userPrompt}\n\n${context}${CUSTOMER_OUTPUT_WRAPPER}`;
    const raw = await this.callAI(prompt, { jsonMode: true });
    if (!raw) return null;

    // Parse JSON - always extract short + detail + rating
    let short: string;
    let detail: string;
    let rating: number | null = null;
    try {
      const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const json = JSON.parse(cleaned);
      short = json.short || '';
      detail = json.detail || '';
      const parsedRating = parseInt(json.rating, 10);
      if (!isNaN(parsedRating) && parsedRating >= 1 && parsedRating <= 5) {
        rating = parsedRating;
      }
    } catch {
      // Fallback: use full text as detail, first sentence as short
      const sentences = raw.split(/[.。!！\n]/).filter(Boolean);
      short = (sentences[0] || raw).trim().slice(0, 200);
      detail = raw.trim();
    }

    if (short || detail || rating !== null) {
      await this.prisma.customer.update({
        where: { id: customerId },
        data: {
          ...(short ? { shortDescription: short } : {}),
          ...(detail ? { description: detail } : {}),
          ...(rating !== null ? { aiRating: rating } : {}),
        },
      });
    }

    return { short, detail, rating };
  }

  /**
   * Call AI via OpenRouter (settings first, env fallback).
   * jsonMode: ép model trả JSON valid 100% qua OpenAI-compatible `response_format`.
   *   Model nào không support -> 400 -> auto retry KHÔNG có response_format.
   *   Parser try-catch trong analyzeCall cứu trường hợp model vẫn trả non-JSON.
   * max_tokens 4000: schema v2 output JSON ~1200 token, nhung cuoc goi dai (transcript lon)
   * model hay viet field `detail` markdown rat dai -> de bi cat JSON giua chung (parse fail -> mat phan tich).
   */
  private async callAI(prompt: string, options?: { jsonMode?: boolean }): Promise<string | null> {
    const apiKey = await this.settings.get(SETTING_KEYS.AI_API_KEY) || this.config.get('AI_API_KEY');
    if (!apiKey) {
      this.logger.warn('AI API key not configured (Settings > AI hoặc env AI_API_KEY)');
      return null;
    }

    const model = await this.settings.get(SETTING_KEYS.AI_MODEL) || this.config.get('AI_MODEL') || 'google/gemini-2.0-flash-exp:free';
    const baseUrl = this.config.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1';

    const baseBody: Record<string, unknown> = {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
    };

    const doFetch = (body: Record<string, unknown>) =>
      fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });

    try {
      // Tier 1: thử với response_format nếu jsonMode = true
      let res = options?.jsonMode
        ? await doFetch({ ...baseBody, response_format: { type: 'json_object' } })
        : await doFetch(baseBody);

      // Tier 2 auto-fallback: model không support response_format -> retry không có field đó
      if (!res.ok && res.status === 400 && options?.jsonMode) {
        this.logger.warn(`Model "${model}" không support response_format - retry without`);
        res = await doFetch(baseBody);
      }

      if (!res.ok) {
        this.logger.error(`AI call failed: ${res.status} ${res.statusText}`);
        return null;
      }
      const data: any = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
      this.logger.error('AI call failed', err);
      return null;
    }
  }
}
