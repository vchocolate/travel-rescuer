import "./globals.css";

export const metadata = {
  title: "旅伴重构器 · Travel Rescuer",
  description:
    "对话生成行程，订单形成锚点。突发变化时，只调整需要调整的部分。",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
