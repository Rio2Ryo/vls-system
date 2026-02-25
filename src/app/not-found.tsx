import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-sm text-center">
        <div className="text-4xl mb-3">🔍</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">
          ページが見つかりません
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          お探しのページは存在しないか、移動した可能性があります。
        </p>
        <Link href="/">
          <Button size="md">トップに戻る</Button>
        </Link>
      </Card>
    </main>
  );
}
