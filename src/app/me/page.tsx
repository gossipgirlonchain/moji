import { MyMojis } from "@/components/MyMojis";

export const metadata = { title: "your mojis" };

export default function MePage() {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="pop text-center text-[30px] text-sky-600">your mojis</h1>
      <MyMojis />
    </main>
  );
}
