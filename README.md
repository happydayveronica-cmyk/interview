# 면접 리허설 스튜디오

학생이 학교생활기록부 PDF를 업로드하면 AI가 면접 예상 문항을 만들고, 학생의 구두 답변을 전사한 뒤 평가와 예시답안을 제공하는 웹 앱입니다. 생성된 문항, 전사 답변, 평가, 보완 답안, 첨삭 메모는 브라우저 리뷰함에 저장해 반복 복습할 수 있습니다.

## 주요 기능

- 학생부 PDF 기반 예상 면접 질문 생성
- 브라우저 마이크 녹음
- 녹음 답변 자동 전사
- 답변 점수, 루브릭, 강점, 보완점, 꼬리질문 생성
- 예시답안을 바탕으로 학생이 직접 보완 답안 작성
- 첨삭 메모와 리뷰 저장
- 저장 리뷰 JSON 내보내기

## 기술 구조

- Next.js App Router
- OpenAI Responses API: 학생부 PDF 분석과 질문/평가 생성
- OpenAI Audio Transcriptions API: 학생 음성 답변 전사
- LocalStorage: 학생 개인 리뷰 저장

API 키는 서버 라우트에서만 사용하며 브라우저 코드에 노출하지 않습니다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`에 본인의 OpenAI API 키를 넣습니다.

```bash
OPENAI_API_KEY=sk-your-api-key
OPENAI_MODEL=gpt-5.5
OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe
```

브라우저에서 `http://localhost:3000`을 엽니다.

## GitHub와 Vercel 배포

1. GitHub에 새 저장소를 만들고 이 프로젝트를 push합니다.
2. Vercel에서 해당 GitHub 저장소를 Import합니다.
3. Vercel Project Settings의 Environment Variables에 `OPENAI_API_KEY`를 추가합니다.
4. 필요하면 `OPENAI_MODEL`, `OPENAI_TRANSCRIBE_MODEL`도 추가합니다.
5. Deploy를 실행합니다.

GitHub Pages는 정적 파일만 호스팅하므로 API 키 보호가 어렵습니다. 학생이 쓰는 앱은 Vercel, Render, Railway 같은 서버 실행 환경에 배포하는 편이 안전합니다.

## 파일 구조

```text
app/
  api/
    evaluate/route.js      답변 평가
    questions/route.js     PDF 기반 예상 문항 생성
    transcribe/route.js    음성 답변 전사
  globals.css              화면 스타일
  layout.js
  page.js                  학생용 연습 화면
lib/
  openai.js                OpenAI REST 호출 유틸
```

## 참고한 OpenAI 공식 문서

- File inputs: PDF는 Responses API의 `input_file`로 전달할 수 있고, Base64 파일 데이터도 지원합니다.
- Speech to text: Transcriptions API는 `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `gpt-4o-transcribe-diarize` 모델을 지원하며 파일 업로드는 25MB 제한이 있습니다.
