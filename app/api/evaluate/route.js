import { createOpenAIResponse, jsonError, parseModelJson } from "../../../lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  try {
    const body = await request.json();
    const question = body.question || {};
    const transcript = String(body.transcript || "").trim();
    const context = body.context || {};

    if (!question.question) {
      return Response.json({ error: "평가할 문항을 찾지 못했습니다." }, { status: 400 });
    }

    if (!transcript) {
      return Response.json({ error: "평가할 답변 텍스트가 없습니다." }, { status: 400 });
    }

    const prompt = [
      "아래는 학생부 기반 면접 질문과 학생의 구두 답변 전사문입니다.",
      "평가는 학생이 스스로 개선할 수 있도록 구체적이고 따뜻하게 작성하세요.",
      "학생부에 없는 사실을 예시답안에 새로 꾸며 넣지 마세요.",
      "",
      `지원 학교: ${context.targetSchool || "미입력"}`,
      `지원 학과/전공: ${context.targetMajor || "미입력"}`,
      `학생부 요약: ${context.profileSummary || "미제공"}`,
      `질문: ${question.question}`,
      `질문 의도: ${question.intent || "미제공"}`,
      `학생부 근거: ${question.relatedRecord || "미제공"}`,
      `평가 기준: ${(question.rubric || []).join(", ") || "미제공"}`,
      "",
      `학생 답변 전사문:\n${transcript}`,
      "",
      "반드시 아래 JSON 형식만 반환하세요.",
      JSON.stringify({
        score: 82,
        level: "상 | 중 | 하",
        summary: "총평",
        rubric: [
          {
            name: "내용 충실도",
            score: 4,
            comment: "평가 코멘트"
          }
        ],
        strengths: ["잘한 점"],
        improvements: ["보완할 점"],
        followUpQuestions: ["추가로 받을 수 있는 꼬리질문"],
        modelAnswer: "학생부 사실을 바탕으로 한 예시답안",
        revisedAnswerGuide: "학생이 자기 답안을 고칠 때의 방향",
        practiceTip: "다음 연습 팁"
      })
    ].join("\n");

    const { text } = await createOpenAIResponse({
      instructions: "당신은 한국 대입 면접을 지도하는 코치입니다. 채점은 엄격하지만 학생이 다음 답변을 더 잘 만들 수 있도록 구체적으로 돕습니다. JSON만 출력합니다.",
      maxOutputTokens: 3000,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt
            }
          ]
        }
      ]
    });

    const parsed = parseModelJson(text);
    return Response.json(normalizeEvaluation(parsed));
  } catch (error) {
    return jsonError(error);
  }
}

function normalizeEvaluation(evaluation = {}) {
  return {
    score: Number(evaluation.score || 0),
    level: String(evaluation.level || ""),
    summary: String(evaluation.summary || ""),
    rubric: Array.isArray(evaluation.rubric)
      ? evaluation.rubric.map((item) => ({
          name: String(item.name || ""),
          score: Number(item.score || 0),
          comment: String(item.comment || "")
        }))
      : [],
    strengths: toStringList(evaluation.strengths),
    improvements: toStringList(evaluation.improvements),
    followUpQuestions: toStringList(evaluation.followUpQuestions),
    modelAnswer: String(evaluation.modelAnswer || ""),
    revisedAnswerGuide: String(evaluation.revisedAnswerGuide || ""),
    practiceTip: String(evaluation.practiceTip || "")
  };
}

function toStringList(value) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}
