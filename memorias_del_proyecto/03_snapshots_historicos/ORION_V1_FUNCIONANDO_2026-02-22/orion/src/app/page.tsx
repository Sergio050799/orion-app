"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function RootPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/analysis/ocr");
    } else {
      router.push("/login");
    }
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen bg-[#0A0F1A] flex items-center justify-center">
      <div className="w-12 h-12 rounded-full border-4 border-t-[#3CE0FF] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
    </div>
  );
}
