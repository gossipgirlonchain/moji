import { Profile } from "@/components/Profile";

export const metadata = { title: "profile" };

export default function ProfilePage() {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="pop text-center text-[30px] text-sky-600">profile</h1>
      <Profile />
    </main>
  );
}
