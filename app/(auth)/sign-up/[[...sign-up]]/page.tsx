import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <main className="container flex min-h-screen items-center justify-center py-16">
      <SignUp />
    </main>
  );
}
