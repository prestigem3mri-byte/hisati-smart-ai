
import OpenAI from "openai";

export const runtime = "nodejs";

const schema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: {
            type: "array",
            items: { type: "string" }
          },
          correct: { type: "integer" },
          answer: { type: "string" },
          hint: { type: "string" },
          level: { type: "integer" }
        },
        required: [
          "question",
          "options",
          "correct",
          "answer",
          "hint",
          "level"
        ],
        additionalProperties: false
      }
    }
  },
  required: ["questions"],
  additionalProperties: false
};

async function dataUrl(file) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

export async function POST(req) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "مفتاح OpenAI غير مضبوط في Vercel." },
        { status: 500 }
      );
    }

    const form = await req.formData();

    const title = String(form.get("title") || "").trim();
    const grade = String(form.get("grade") || "").trim();
    const subject = String(form.get("subject") || "").trim();
    const lessonText = String(form.get("text") || "").trim();

    const count = Math.min(
      15,
      Math.max(6, Number(form.get("count")) || 12)
    );

    const files = form
      .getAll("images")
      .filter(file => file && file.size > 0)
      .slice(0, 6);

    if (!title && !lessonText && files.length === 0) {
      return Response.json(
        { error: "أدخلي عنوان الدرس أو نصه أو صوره." },
        { status: 400 }
      );
    }

    const hasSource = Boolean(lessonText || files.length);

    const instructions = `
أنت خبير تربوي في إعداد الأسئلة للمدارس العمانية.

المادة: ${subject || "غير محددة"}
الصف: ${grade || "غير محدد"}
عنوان الدرس: ${title || "استخرجه من المحتوى"}
عدد الأسئلة: ${count}

${hasSource
  ? `استخرج الأسئلة من النص والصور المرفقة.
لا تضف معلومات تخالف المصدر.`
  : `لم يُرفق نص الكتاب أو صوره.
أنشئ أسئلة تدريبية عامة مستوحاة من عنوان الدرس،
ومناسبة لعمر الطالب والمادة.
لا تدّعِ أنها أسئلة مستخرجة من الكتاب المدرسي.`}

نص الدرس:
${lessonText || "غير مرفق"}

المطلوب:
- أنشئ ${count} سؤال اختيار من متعدد.
- أربعة خيارات لكل سؤال.
- وزع المستويات بين 1 مبتدئ و2 متوسط و3 متقدم.
- اجعل الأسئلة واضحة ومناسبة لعمر الطالب.
- correct رقم الخيار الصحيح من 0 إلى 3.
- answer يساوي نص الخيار الصحيح حرفيًا.
- hint تلميح قصير لا يكشف الإجابة.
- نوّع مواقع الإجابات الصحيحة.
- أرجع أسئلة فعلية، ولا تُرجع مصفوفة فارغة.
`;

    const content = [
      { type: "input_text", text: instructions }
    ];

    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;

      content.push({
        type: "input_image",
        image_url: await dataUrl(file),
        detail: "high"
      });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      input: [
        {
          role: "user",
          content
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "lesson_questions",
          strict: true,
          schema
        }
      }
    });

    if (!response.output_text) {
      throw new Error(
        "لم يُرجع الذكاء الاصطناعي محتوى للأسئلة."
      );
    }

    const result = JSON.parse(response.output_text);

    if (
      !Array.isArray(result.questions) ||
      result.questions.length === 0
    ) {
      throw new Error(
        "لم يتم توليد أسئلة. حاولي مرة أخرى أو أرفقي صور الدرس."
      );
    }

    const questions = result.questions
      .filter(q =>
        q.question &&
        Array.isArray(q.options) &&
        q.options.length === 4
      )
      .slice(0, count)
      .map(q => {
        const correct = Math.max(
          0,
          Math.min(3, Number(q.correct) || 0)
        );

        return {
          question: q.question,
          options: q.options,
          correct,
          answer: q.options[correct],
          hint: q.hint || "",
          level: Math.max(
            1,
            Math.min(3, Number(q.level) || 1)
          )
        };
      });

    if (!questions.length) {
      throw new Error("تعذر إعداد بنك أسئلة صالح.");
    }

    return Response.json({ questions });

  } catch (error) {
    console.error("Question generation failed:", error);

    return Response.json(
      {
        error: error?.message || "تعذر إنشاء الأسئلة."
      },
      { status: 500 }
    );
  }
}
