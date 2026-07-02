"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "student-interview-coach.savedReviews";

export default function Home() {
  const [studentName, setStudentName] = useState("");
  const [targetSchool, setTargetSchool] = useState("");
  const [targetMajor, setTargetMajor] = useState("");
  const [questionCount, setQuestionCount] = useState(8);
  const [pdfFile, setPdfFile] = useState(null);
  const [profile, setProfile] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [answers, setAnswers] = useState({});
  const [savedReviews, setSavedReviews] = useState([]);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      setSavedReviews(Array.isArray(stored) ? stored : []);
    } catch {
      setSavedReviews([]);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedReviews));
    }
  }, [hydrated, savedReviews]);

  const selectedQuestion = useMemo(() => {
    return questions.find((question) => question.id === activeId) || questions[0] || null;
  }, [activeId, questions]);

  const activeAnswer = selectedQuestion ? answers[selectedQuestion.id] || {} : {};
  const isWorking = Boolean(busy);

  async function generateQuestions(event) {
    event.preventDefault();

    if (!pdfFile) {
      setNotice("학생부 PDF를 먼저 선택해주세요.");
      return;
    }

    setBusy("questions");
    setNotice("");

    try {
      const form = new FormData();
      form.append("pdf", pdfFile);
      form.append("studentName", studentName);
      form.append("targetSchool", targetSchool);
      form.append("targetMajor", targetMajor);
      form.append("questionCount", String(questionCount));

      const data = await apiJson("/api/questions", {
        method: "POST",
        body: form
      });

      const sessionId = makeId("session");
      const nextQuestions = (data.questions || []).map((question, index) => ({
        ...question,
        id: `${sessionId}-${question.id || index + 1}`
      }));

      setProfile(data.studentProfile || null);
      setQuestions(nextQuestions);
      setAnswers({});
      setActiveId(nextQuestions[0]?.id || "");
      setNotice(nextQuestions.length ? "예상 질문을 생성했습니다." : "생성된 질문이 없습니다.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy("");
    }
  }

  async function startRecording() {
    if (!selectedQuestion || isWorking || isRecording) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setNotice("현재 브라우저에서 녹음을 사용할 수 없습니다.");
      return;
    }

    try {
      setNotice("");
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type)
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        stopStream();

        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        chunksRef.current = [];

        if (blob.size > 0) {
          await transcribeAndEvaluate(blob, selectedQuestion);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      patchAnswer(selectedQuestion.id, { status: "recording" });
    } catch (error) {
      setNotice(error.message || "마이크 권한을 확인해주세요.");
      setIsRecording(false);
      stopStream();
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }

  async function transcribeAndEvaluate(blob, question) {
    setBusy("transcribe");
    patchAnswer(question.id, { status: "transcribing" });

    try {
      const form = new FormData();
      form.append("audio", blob, "interview-answer.webm");

      const transcript = await apiJson("/api/transcribe", {
        method: "POST",
        body: form
      });

      patchAnswer(question.id, {
        transcript: transcript.text,
        status: "evaluating"
      });

      await evaluateAnswer(question, transcript.text);
    } catch (error) {
      setNotice(error.message);
      patchAnswer(question.id, { status: "idle" });
    } finally {
      setBusy("");
    }
  }

  async function evaluateAnswer(question = selectedQuestion, transcript = activeAnswer.transcript) {
    if (!question || !transcript?.trim()) {
      setNotice("평가할 답변 텍스트가 필요합니다.");
      return;
    }

    setBusy("evaluate");
    patchAnswer(question.id, { status: "evaluating" });
    setNotice("");

    try {
      const evaluation = await apiJson("/api/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question,
          transcript,
          context: {
            targetSchool,
            targetMajor,
            profileSummary: profile?.summary || ""
          }
        })
      });

      patchAnswer(question.id, (current) => ({
        evaluation,
        draftAnswer: current.draftAnswer || evaluation.modelAnswer || "",
        status: "done",
        evaluatedAt: Date.now()
      }));
      setNotice("답변 평가가 완료되었습니다.");
    } catch (error) {
      setNotice(error.message);
      patchAnswer(question.id, { status: "idle" });
    } finally {
      setBusy("");
    }
  }

  function patchAnswer(questionId, patch) {
    setAnswers((currentAnswers) => {
      const current = currentAnswers[questionId] || {};
      const nextPatch = typeof patch === "function" ? patch(current) : patch;

      return {
        ...currentAnswers,
        [questionId]: {
          ...current,
          ...nextPatch
        }
      };
    });
  }

  function saveCurrentReview() {
    if (!selectedQuestion) {
      return;
    }

    const answer = answers[selectedQuestion.id] || {};
    const review = {
      key: `${selectedQuestion.id}:${selectedQuestion.question}`,
      savedAt: Date.now(),
      question: selectedQuestion,
      transcript: answer.transcript || "",
      evaluation: answer.evaluation || null,
      draftAnswer: answer.draftAnswer || "",
      memo: answer.memo || "",
      context: {
        studentName,
        targetSchool,
        targetMajor,
        profile
      }
    };

    setSavedReviews((current) => [review, ...current.filter((item) => item.key !== review.key)].slice(0, 80));
    setNotice("리뷰함에 저장했습니다.");
  }

  function openSavedReview(review) {
    const questionExists = questions.some((question) => question.id === review.question.id);

    if (!questionExists) {
      setQuestions((current) => [review.question, ...current]);
    }

    if (review.context?.profile) {
      setProfile(review.context.profile);
    }

    setStudentName(review.context?.studentName || studentName);
    setTargetSchool(review.context?.targetSchool || targetSchool);
    setTargetMajor(review.context?.targetMajor || targetMajor);
    setActiveId(review.question.id);
    patchAnswer(review.question.id, {
      transcript: review.transcript || "",
      evaluation: review.evaluation || null,
      draftAnswer: review.draftAnswer || "",
      memo: review.memo || "",
      status: "done"
    });
  }

  function deleteSavedReview(key) {
    setSavedReviews((current) => current.filter((item) => item.key !== key));
  }

  function exportSavedReviews() {
    const blob = new Blob([JSON.stringify(savedReviews, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `interview-reviews-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="brandCluster">
          <img className="schoolLogo" src="/banpo-school-logo.svg" alt="반포고등학교" />
          <div>
            <span className="topEyebrow">BANPO INTERVIEW LAB</span>
            <h1>면접 리허설 스튜디오</h1>
            <p>학생부 기반 AI 면접 연습</p>
          </div>
        </div>
        <div className="topStatus">
          <span>반포고 맞춤형</span>
          <div className="statusPill">{busy ? statusLabel(busy) : "준비됨"}</div>
        </div>
      </header>

      {notice ? <div className="notice">{notice}</div> : null}

      <div className="workspace">
        <aside className="rail">
          <form className="surface intakeSurface" onSubmit={generateQuestions}>
            <div className="surfaceTitle">
              <span>학생부</span>
              <span className="fineText">PDF</span>
            </div>

            <label className="field">
              <span>학생 이름</span>
              <input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="예: 김하늘" />
            </label>

            <label className="field">
              <span>지원 학교</span>
              <input value={targetSchool} onChange={(event) => setTargetSchool(event.target.value)} placeholder="예: 한국대학교" />
            </label>

            <label className="field">
              <span>지원 학과</span>
              <input value={targetMajor} onChange={(event) => setTargetMajor(event.target.value)} placeholder="예: 생명과학과" />
            </label>

            <label className="field">
              <span>문항 수</span>
              <input
                type="number"
                min="5"
                max="12"
                value={questionCount}
                onChange={(event) => setQuestionCount(event.target.value)}
              />
            </label>

            <label className="filePicker">
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => setPdfFile(event.target.files?.[0] || null)}
              />
              <span>PDF 선택</span>
              <strong>{pdfFile?.name || "선택된 파일 없음"}</strong>
            </label>

            <button className="primaryButton" type="submit" disabled={isWorking}>
              {busy === "questions" ? "질문 생성 중" : "예상 질문 생성"}
            </button>
          </form>

          <section className="surface savedSurface">
            <div className="surfaceTitle">
              <span>리뷰함</span>
              <button className="ghostButton compact" type="button" onClick={exportSavedReviews} disabled={!savedReviews.length}>
                내보내기
              </button>
            </div>

            <div className="savedList">
              {savedReviews.length ? (
                savedReviews.map((review) => (
                  <article className="savedItem" key={review.key}>
                    <button type="button" onClick={() => openSavedReview(review)}>
                      <strong>{review.question.question}</strong>
                      <span>{formatDate(review.savedAt)}</span>
                    </button>
                    <button className="deleteButton" type="button" onClick={() => deleteSavedReview(review.key)} aria-label="저장 리뷰 삭제">
                      ×
                    </button>
                  </article>
                ))
              ) : (
                <p className="emptyText">저장된 리뷰 없음</p>
              )}
            </div>
          </section>
        </aside>

        <section className="mainStage">
          {profile ? (
            <section className="profileBand">
              <div>
                <span className="eyebrow">학생부 요약</span>
                <p>{profile.summary}</p>
              </div>
              <TagList items={profile.keywords} />
            </section>
          ) : null}

          <div className="practiceGrid">
            <section className="surface questionSurface">
              <div className="surfaceTitle">
                <span>예상 문항</span>
                <span className="fineText">{questions.length}개</span>
              </div>

              <div className="questionList">
                {questions.length ? (
                  questions.map((question, index) => (
                    <button
                      className={`questionCard ${question.id === selectedQuestion?.id ? "active" : ""}`}
                      key={question.id}
                      type="button"
                      onClick={() => setActiveId(question.id)}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{question.question}</strong>
                      <small>{question.difficulty}</small>
                    </button>
                  ))
                ) : (
                  <p className="emptyText">생성된 문항 없음</p>
                )}
              </div>
            </section>

            <section className="surface answerSurface">
              {selectedQuestion ? (
                <>
                  <div className="questionDetail">
                    <div className="questionMeta">
                      <span>{selectedQuestion.difficulty}</span>
                      <span>{selectedQuestion.intent || "의도 미제공"}</span>
                    </div>
                    <h2>{selectedQuestion.question}</h2>
                    <p>{selectedQuestion.relatedRecord}</p>
                  </div>

                  <div className="detailColumns">
                    <MiniList title="꼬리질문" items={selectedQuestion.followUps} />
                    <MiniList title="답변 기준" items={selectedQuestion.rubric} />
                  </div>

                  <div className="recorderBar">
                    <button
                      className={isRecording ? "dangerButton" : "primaryButton"}
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isWorking && !isRecording}
                    >
                      {isRecording ? "녹음 종료" : "답변 녹음"}
                    </button>
                    <button
                      className="secondaryButton"
                      type="button"
                      onClick={() => evaluateAnswer()}
                      disabled={isWorking || !activeAnswer.transcript}
                    >
                      텍스트 평가
                    </button>
                    <span className="fineText">{answerStatus(activeAnswer.status)}</span>
                  </div>

                  <label className="field transcriptField">
                    <span>전사된 답변</span>
                    <textarea
                      value={activeAnswer.transcript || ""}
                      onChange={(event) => patchAnswer(selectedQuestion.id, { transcript: event.target.value })}
                      placeholder="녹음 후 자동 입력됩니다."
                    />
                  </label>

                  <EvaluationView evaluation={activeAnswer.evaluation} />

                  <div className="revisionGrid">
                    <label className="field">
                      <span>내 보완 답안</span>
                      <textarea
                        value={activeAnswer.draftAnswer || ""}
                        onChange={(event) => patchAnswer(selectedQuestion.id, { draftAnswer: event.target.value })}
                        placeholder="평가 후 예시답안이 들어옵니다."
                      />
                    </label>

                    <label className="field">
                      <span>첨삭 메모</span>
                      <textarea
                        value={activeAnswer.memo || ""}
                        onChange={(event) => patchAnswer(selectedQuestion.id, { memo: event.target.value })}
                        placeholder="다음 연습에서 고칠 점"
                      />
                    </label>
                  </div>

                  <div className="saveBar">
                    <button className="secondaryButton" type="button" onClick={saveCurrentReview}>
                      리뷰함 저장
                    </button>
                  </div>
                </>
              ) : (
                <div className="emptyState">
                  <h2>학생부 PDF를 업로드하세요</h2>
                  <p>예상 문항이 생성되면 여기에서 녹음과 평가를 진행합니다.</p>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function EvaluationView({ evaluation }) {
  if (!evaluation) {
    return null;
  }

  return (
    <section className="evaluationBox">
      <div className="scoreBlock">
        <div className="scoreRing">
          <strong>{evaluation.score}</strong>
          <span>점</span>
        </div>
        <div>
          <span className="eyebrow">평가</span>
          <h3>{evaluation.level || "평가 완료"}</h3>
          <p>{evaluation.summary}</p>
        </div>
      </div>

      <div className="rubricList">
        {evaluation.rubric?.map((item) => (
          <div className="rubricItem" key={item.name}>
            <div>
              <strong>{item.name}</strong>
              <span>{item.score}/5</span>
            </div>
            <p>{item.comment}</p>
          </div>
        ))}
      </div>

      <div className="detailColumns">
        <MiniList title="잘한 점" items={evaluation.strengths} />
        <MiniList title="보완점" items={evaluation.improvements} />
        <MiniList title="추가 질문" items={evaluation.followUpQuestions} />
      </div>

      {evaluation.revisedAnswerGuide ? (
        <div className="guideBox">
          <strong>첨삭 방향</strong>
          <p>{evaluation.revisedAnswerGuide}</p>
        </div>
      ) : null}

      {evaluation.practiceTip ? (
        <div className="guideBox subtle">
          <strong>연습 팁</strong>
          <p>{evaluation.practiceTip}</p>
        </div>
      ) : null}
    </section>
  );
}

function MiniList({ title, items = [] }) {
  return (
    <div className="miniList">
      <strong>{title}</strong>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>항목 없음</p>
      )}
    </div>
  );
}

function TagList({ items = [] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="tagList">
      {items.slice(0, 6).map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

async function apiJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || "요청 처리에 실패했습니다.");
  }

  return data;
}

function answerStatus(status) {
  const labels = {
    recording: "녹음 중",
    transcribing: "전사 중",
    evaluating: "평가 중",
    done: "평가 완료",
    idle: "대기"
  };

  return labels[status] || "대기";
}

function statusLabel(status) {
  const labels = {
    questions: "질문 생성",
    transcribe: "음성 전사",
    evaluate: "답변 평가"
  };

  return labels[status] || "작업 중";
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function makeId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
