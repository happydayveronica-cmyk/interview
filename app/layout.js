import "./globals.css";

export const metadata = {
  title: "반포고 면접 리허설 스튜디오",
  description: "반포고 학생부 기반 AI 면접 연습 앱"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
