import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = {
  type: "object",
  properties: {
    students: { type: "array", items: { type: "string" } },
  },
  required: ["students"],
  additionalProperties: false,
};

function cleanNames(items = []) {
  const banned = /(?:لم أتمكن|غير واضح|الأسماء|الصورة|السجل|طالبة|طالبات|ملاحظة|تنبيه|وضوح|العثور|استخراج)/i;
  return [...new Set(items
    .map(v => String(v || "").replace(/[\d٠-٩]+/g, "").replace(/[\[\]{}():؛،,.!?؟ـ]/g, " ").replace(/\s+/g, " ").trim())
    .filter(v => v.length >= 3 && v.length <= 80 && /[\u0600-\u06FF]/.test(v) && !banned.test(v))
  )];
}

export async function POST(req) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "مفتاح OpenAI غير موجود في إعدادات Vercel." }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get("image");
    if (!file || !file.size) {
      return Response.json({ error: "اختاري صورة سجل الطالبات أولًا." }, { status: 400 });
    }
    if (!String(file.type || "").startsWith("image/")) {
      return Response.json({ error: "الملف المختار يجب أن يكون صورة." }, { status: 400 });
    }
    if (file.size > 4 * 1024 * 1024) {
      return Response.json({ error: "الصورة كبيرة جدًا. أعيدي اختيارها وسيقوم الموقع بضغطها تلقائيًا." }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "image/jpeg";
    const imageUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: `هذه صورة قائمة/سجل طالبات باللغة العربية. اقرأها بصريًا بدقة واستخرج أسماء الأشخاص فقط.
قواعد إلزامية:
- أعد كل اسم واضح كما هو وبنفس ترتيب ظهوره.
- لا تُرجع العنوان أو الصف أو الشعبة أو الأرقام أو الدرجات أو الملاحظات أو أي جملة تفسيرية.
- إذا كان اسم غير مقروء فتجاهله تمامًا؛ لا تكتب "غير واضح" ولا تخمّن.
- لا تنشئ أسماء غير موجودة في الصورة.
- الناتج يجب أن يكون JSON وفق المخطط فقط.`
          },
          { type: "input_image", image_url: imageUrl, detail: "high" },
        ],
      }],
      text: { format: { type: "json_schema", name: "student_names", strict: true, schema } },
    });

    if (!response.output_text) {
      return Response.json({ error: "لم أتمكن من قراءة أسماء من الصورة. جرّبي صورة أقرب وأكثر وضوحًا." }, { status: 422 });
    }

    let parsed;
    try { parsed = JSON.parse(response.output_text); }
    catch { return Response.json({ error: "تعذر معالجة نتيجة قراءة السجل. أعيدي المحاولة بصورة أوضح." }, { status: 502 }); }

    const students = cleanNames(parsed.students);
    if (!students.length) {
      return Response.json({ error: "لم أجد أسماء طالبات واضحة في الصورة. صوّري جزء الأسماء فقط وبشكل مستقيم وواضح." }, { status: 422 });
    }

    return Response.json({ students, count: students.length });
  } catch (error) {
    console.error("extract-students error:", error);
    const status = Number(error?.status) || 500;
    const friendly = status === 429
      ? "خدمة الذكاء الاصطناعي وصلت إلى حد الاستخدام مؤقتًا. تحققي من رصيد OpenAI ثم أعيدي المحاولة."
      : status === 401
      ? "مفتاح OpenAI غير صالح أو انتهت صلاحيته."
      : "تعذر قراءة صورة السجل الآن. جرّبي مرة أخرى بصورة واضحة.";
    return Response.json({ error: friendly }, { status: status >= 400 && status < 600 ? status : 500 });
  }
}
