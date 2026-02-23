import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <main className="container flex min-h-screen items-center justify-center py-16">
      <SignIn />
    </main>
  );
}
