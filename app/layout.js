import "./globals.css";

export const metadata = {
  title: "면접 리허설 스튜디오",
  description: "학생부 PDF 기반 AI 면접 연습 앱"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
