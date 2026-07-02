import { createOpenAIResponse, jsonError, parseModelJson } from "../../../lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PDF_BYTES = 15 * 1024 * 1024;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const pdf = formData.get("pdf");
    const studentName = String(formData.get("studentName") || "").trim();
    const targetSchool = String(formData.get("targetSchool") || "").trim();
    const targetMajor = String(formData.get("targetMajor") || "").trim();
    const requestedCount = Number(formData.get("questionCount") || 8);
    const questionCount = Math.min(Math.max(requestedCount || 8, 5), 12);

    if (!pdf || typeof pdf.arrayBuffer !== "function") {
      return Response.json({ error: "학생부 PDF 파일을 업로드해주세요." }, { status: 400 });
    }

    if (pdf.size > MAX_PDF_BYTES) {
      return Response.json({ error: "PDF 파일은 15MB 이하로 업로드해주세요." }, { status: 413 });
    }

    const buffer = Buffer.from(await pdf.arrayBuffer());
    const base64 = buffer.toString("base64");
    const fileData = `data:${pdf.type || "application/pdf"};base64,${base64}`;

    const prompt = [
      "업로드된 PDF는 학생의 학교생활기록부입니다.",
      "학생부 내용을 근거로 실제 학생부종합전형 면접에서 나올 법한 질문을 추출하세요.",
      "추측이 필요한 내용은 단정하지 말고, 학생부에 보이는 활동과 역량을 중심으로 질문하세요.",
      `질문 수: ${questionCount}개`,
      `학생 이름: ${studentName || "미입력"}`,
      `지원 학교: ${targetSchool || "미입력"}`,
      `지원 학과/전공: ${targetMajor || "미입력"}`,
      "",
      "반드시 아래 JSON 형식만 반환하세요.",
      JSON.stringify({
        studentProfile: {
          summary: "학생부 전체 인상 요약",
          strengths: ["강점"],
          risks: ["면접에서 보완할 점"],
          keywords: ["핵심 키워드"]
        },
        questions: [
          {
            id: "q1",
            question: "면접 질문",
            intent: "면접관이 확인하려는 역량",
            difficulty: "기본 | 심화 | 압박",
            relatedRecord: "학생부 근거 활동 또는 문장 요약",
            followUps: ["꼬리질문"],
            rubric: ["좋은 답변에 포함될 요소"]
          }
        ]
      })
    ].join("\n");

    const { text } = await createOpenAIResponse({
      instructions: "당신은 한국 고등학생의 대입 면접을 돕는 입학사정관 출신 코치입니다. 답변은 한국어로 작성하고 JSON만 출력합니다.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_file",
              filename: pdf.name || "student-record.pdf",
              file_data: fileData
            },
            {
              type: "input_text",
              text: prompt
            }
          ]
        }
      ]
    });

    const parsed = parseModelJson(text);
    const questions = normalizeQuestions(parsed.questions);

    return Response.json({
      studentProfile: normalizeProfile(parsed.studentProfile),
      questions
    });
  } catch (error) {
    return jsonError(error);
  }
}

function normalizeProfile(profile = {}) {
  return {
    summary: String(profile.summary || ""),
    strengths: toStringList(profile.strengths),
    risks: toStringList(profile.risks),
    keywords: toStringList(profile.keywords)
  };
}

function normalizeQuestions(questions = []) {
  return questions.map((question, index) => ({
    id: String(question.id || `q${index + 1}`),
    question: String(question.question || ""),
    intent: String(question.intent || ""),
    difficulty: String(question.difficulty || "기본"),
    relatedRecord: String(question.relatedRecord || ""),
    followUps: toStringList(question.followUps),
    rubric: toStringList(question.rubric)
  })).filter((question) => question.question);
}

function toStringList(value) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}
