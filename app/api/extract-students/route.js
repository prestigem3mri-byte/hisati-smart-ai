import OpenAI from "openai";

export const runtime = "nodejs";

const schema = {
  type: "object",
  properties: {
    students: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["students"],
  additionalProperties: false,
};

export async function POST(req) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "مفتاح OpenAI غير موجود في إعدادات Vercel." },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("image");

    if (!file || !file.size) {
      return Response.json(
        { error: "اختاري صورة سجل الطالبات أولًا." },
        { status: 400 }
      );
    }

    // منع الصور الكبيرة جدًا
    const maxSize = 4 * 1024 * 1024;

    if (file.size > maxSize) {
      return Response.json(
        {
          error:
            "الصورة كبيرة جدًا. اختاري صورة أقل من 4 MB أو التقطي صورة بجودة متوسطة.",
        },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "image/jpeg";

    const imageUrl =
      `data:${mimeType};base64,${buffer.toString("base64")}`;

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",

      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "اقرأ صورة سجل الطالبات بعناية. " +
                "استخرج أسماء الطالبات فقط وبنفس الترتيب الظاهر في الصورة. " +
                "تجاهل الأرقام والصفوف والعناوين والدرجات وأرقام الهواتف " +
                "وأي بيانات أخرى. لا تضف أسماء غير موجودة. " +
                "إذا كان الاسم غير واضح اكتب [غير واضح]. " +
                "أعد الأسماء باللغة العربية كما تظهر في الصورة.",
            },
            {
              type: "input_image",
              image_url: imageUrl,
              detail: "high",
            },
          ],
        },
      ],

      text: {
        format: {
          type: "json_schema",
          name: "student_names",
          strict: true,
          schema,
        },
      },
    });

    const output = response.output_text;

    if (!output) {
      return Response.json(
        { error: "لم يتم العثور على أسماء في الصورة." },
        { status: 422 }
      );
    }

    let result;

    try {
      result = JSON.parse(output);
    } catch {
      return Response.json(
        { error: "تعذر معالجة نتيجة قراءة السجل." },
        { status: 500 }
      );
    }

    return Response.json({
      students: result.students || [],
    });

  } catch (error) {
    console.error("extract-students error:", error);

    return Response.json(
      {
        error:
          error?.message ||
          "حدث خطأ أثناء قراءة صورة سجل الطالبات.",
      },
      { status: 500 }
    );
  }
}
