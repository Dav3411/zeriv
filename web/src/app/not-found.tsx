import Link from "next/link";

export default function NotFound() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-4"
      style={{ backgroundColor: "#111113" }}
    >
      <p className="text-8xl font-bold tracking-tight text-white">404</p>
      <p className="text-base text-gray-400">페이지를 찾을 수 없습니다.</p>
      <Link
        href="/"
        className="rounded-full px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-80"
        style={{ backgroundColor: "#ffa4c6" }}
      >
        홈으로 돌아가기
      </Link>
    </main>
  );
}
