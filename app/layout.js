import "./globals.css";

export const metadata = {
  title: "반포고 AI 디지털 기반 면접 연습 앱",
  description: "학생부 내용을 AI를 활용하여 분석합니다"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
