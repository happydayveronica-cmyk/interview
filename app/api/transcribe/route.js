import { jsonError, transcribeAudio } from "../../../lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!audio || typeof audio.arrayBuffer !== "function") {
      return Response.json({ error: "녹음 파일이 없습니다." }, { status: 400 });
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return Response.json({ error: "녹음 파일은 25MB 이하만 전사할 수 있습니다." }, { status: 413 });
    }

    const { text } = await transcribeAudio(audio);
    return Response.json({ text });
  } catch (error) {
    return jsonError(error);
  }
}
